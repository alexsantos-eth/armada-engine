//! Tests for how a gathered entity comes apart on screen.

use super::*;
use iso::debris::Part;

/// Flat dry ground at level 2.
fn level(_: i32, _: i32) -> Option<Floor> {
    Some(Floor {
        top: 2.0,
        water: false,
    })
}

fn tree() -> EntityParts {
    let part = |piece: &str, at: [f64; 3], sprite: &str| Part {
        piece: piece.into(),
        at,
        sprite: sprite.into(),
        shift: [0.0, 0.0],
        collect: true,
    };
    EntityParts {
        tiles: [1, 1, 2],
        parts: vec![
            part("trunk", [0.0, 0.0, 0.0], "debris/p_a"),
            part("leaf_block", [-30.0, 0.0, 85.0], "debris/p_b"),
        ],
    }
}

fn spawned() -> DebrisView {
    let mut view = DebrisView::default();
    view.spawn(&tree(), WorldCoord { x: 4, y: 7 }, 2, 11, &[]);
    view
}

#[test]
fn a_blast_starts_as_the_entity_stood() {
    let placed = spawned().blasts[0].placed();
    assert_eq!(placed.len(), 2);
    assert_eq!(placed[0].sprite, "debris/p_a");
    assert_eq!(placed[0].at, [4.5, 7.5, 2.0]);
    // The leaf block stood a block up, 30 voxels along the model's -x, which is the grid's +y.
    let ground = ground_of(-30.0, 0.0);
    assert!((placed[1].at[0] - (4.5 + ground.x)).abs() < 1e-9);
    assert!((placed[1].at[1] - (7.5 + ground.y)).abs() < 1e-9);
    assert!((placed[1].at[2] - 3.0).abs() < 1e-9);
    assert!(placed.iter().all(|p| p.alpha == 1.0 && p.scale == 1.0));
}

#[test]
fn the_pieces_move_apart_and_then_fade() {
    let mut view = spawned();
    let before = view.blasts[0].placed();
    view.advance(200.0, &level);
    let after = view.blasts[0].placed();
    assert_ne!(after[1].at, before[1].at);
    view.advance(DEBRIS_MS - 300.0, &level);
    let last = view.blasts[0].placed();
    assert!(last[0].alpha < 1.0 && last[0].scale < 1.0);
}

#[test]
fn a_blast_ends_and_is_forgotten() {
    let mut view = spawned();
    assert_eq!(view.live(), 1);
    view.advance(DEBRIS_MS - 1.0, &level);
    assert_eq!(view.live(), 1);
    view.advance(2.0, &level);
    assert_eq!(view.live(), 0);
}

#[test]
fn only_so_many_entities_come_apart_at_once() {
    let mut view = DebrisView::default();
    for index in 0..MAX_BLASTS + 3 {
        view.spawn(
            &tree(),
            WorldCoord {
                x: index as i32,
                y: 0,
            },
            0,
            1,
            &[],
        );
    }
    assert_eq!(view.live(), MAX_BLASTS);
    // The oldest ones were the ones to go.
    assert_eq!(view.blasts[0].bodies[0].1.at[0], 3.5);
}

#[test]
fn a_shrinking_piece_stays_on_its_spot() {
    let layout = SpriteLayout {
        x: 90.0,
        y: 40.0,
        width: 20.0,
        height: 20.0,
    };
    let about = ScreenPoint { x: 100.0, y: 60.0 };
    let half = scaled_about(layout, about, 0.5);
    assert_eq!((half.width, half.height), (10.0, 10.0));
    // Its foot, the point it was scaled about, did not move.
    assert_eq!(half.x + half.width / 2.0, 100.0);
    assert_eq!(half.y + half.height, 60.0);
    assert_eq!(scaled_about(layout, about, 1.0), layout);
}

#[test]
fn a_wide_piece_is_drawn_back_from_where_it_stands_by_how_far_its_sprite_was_moved() {
    let mut parts = tree();
    parts.parts[0].shift = [64.0, 64.0];
    let mut view = DebrisView::default();
    view.spawn(&parts, WorldCoord { x: 0, y: 0 }, 0, 1, &[]);
    let placed = view.blasts[0].placed();
    // The sprite's foot is where the piece was moved to: back by that, to land it where it stands.
    let back = ground_of(64.0, 64.0);
    assert!((placed[0].at[0] - (0.5 - back.x)).abs() < 1e-9);
    assert!((placed[0].at[1] - (0.5 - back.y)).abs() < 1e-9);
}

#[test]
fn the_pieces_that_stay_as_items_are_not_part_of_the_fading_blast() {
    let mut view = DebrisView::default();
    let mut all = DebrisView::default();
    all.spawn(&tree(), WorldCoord { x: 0, y: 0 }, 0, 3, &[]);
    view.spawn(&tree(), WorldCoord { x: 0, y: 0 }, 0, 3, &[0]);
    assert_eq!(view.blasts[0].bodies.len() + 1, all.blasts[0].bodies.len());
    assert!(view.blasts[0].bodies.iter().all(|(part, _)| *part != 0));
}

#[test]
fn the_pieces_fall_to_the_level_below_and_into_the_water() {
    let mut view = DebrisView::default();
    // The tree stands on level 2 at x = 4; everything east of it is water at level 0.
    let shore = |x: i32, _: i32| {
        Some(if x <= 4 {
            Floor {
                top: 2.0,
                water: false,
            }
        } else {
            Floor {
                top: 0.0,
                water: true,
            }
        })
    };
    view.spawn(&tree(), WorldCoord { x: 4, y: 7 }, 2, 11, &[]);
    for _ in 0..60 {
        view.advance(20.0, &shore);
    }
    let blast = &view.blasts[0];
    assert!(blast.bodies.iter().all(|(_, body)| body.resting));
    for (_, body) in &blast.bodies {
        let expect = if body.at[0] < 5.0 { 2.0 } else { 0.0 };
        assert!((body.at[2] - expect).abs() < 1e-9, "{:?}", body.at);
        assert_eq!(body.afloat, body.at[0] >= 5.0);
    }
}
