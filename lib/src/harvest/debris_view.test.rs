//! Tests for how a gathered entity comes apart on screen.

use super::*;
use iso::debris::{Part, PartBox};

fn tree() -> EntityParts {
    let boxed = |z: f64| PartBox {
        centre: [0.0, 0.0, z],
        half: [8.0, 6.0, 10.0],
        color: 0x8a5a30,
    };
    EntityParts {
        tiles: [1, 1, 2],
        parts: vec![
            Part {
                piece: "trunk".into(),
                at: [0.0, 0.0, 0.0],
                boxes: vec![boxed(10.0), boxed(30.0)],
            },
            Part {
                piece: "leaf_block".into(),
                at: [-30.0, 0.0, 85.0],
                boxes: vec![boxed(10.0)],
            },
        ],
    }
}

fn spawned() -> DebrisView {
    let mut view = DebrisView::default();
    view.spawn(&tree(), WorldCoord { x: 4, y: 7 }, 2, 11);
    view
}

#[test]
fn a_blast_starts_as_the_entity_stood() {
    let view = spawned();
    let placed = view.blasts[0].placed();
    assert_eq!(placed.len(), 3);
    // The trunk's lowest box sits on the base of the anchor tile, as wide as the model says.
    assert_eq!(placed[0].at, [4.5, 7.5, 2.0]);
    assert_eq!(placed[0].size, [12.0 / 128.0, 16.0 / 128.0, 20.0 / 85.0]);
    assert!((placed[1].at[2] - (2.0 + 20.0 / 85.0)).abs() < 1e-9);
    // The leaf block stood a block up, towards the grid's +y... (model x -30 is grid y +30/128).
    assert!((placed[2].at[2] - (2.0 + 1.0)).abs() < 1e-9);
    assert!((placed[2].at[1] - (7.5 + 30.0 / 128.0)).abs() < 1e-9);
    assert!(placed.iter().all(|p| p.alpha == 1.0));
}

#[test]
fn the_pieces_move_apart_and_a_piece_keeps_its_boxes_together() {
    let mut view = spawned();
    let before = view.blasts[0].placed();
    view.advance(200.0);
    let after = view.blasts[0].placed();
    assert_eq!(after.len(), before.len());
    // The two trunk boxes move as one: the gap between them does not change.
    let gap = |boxes: &[Placed]| boxes[1].at[2] - boxes[0].at[2];
    assert!((gap(&before) - gap(&after)).abs() < 1e-9);
    assert!(after[2].at != before[2].at);
}

#[test]
fn a_blast_ends_and_is_forgotten() {
    let mut view = spawned();
    assert_eq!(view.live(), 1);
    view.advance(DEBRIS_MS - 1.0);
    assert_eq!(view.live(), 1);
    view.advance(2.0);
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
        );
    }
    assert_eq!(view.live(), MAX_BLASTS);
    // The oldest ones were the ones to go.
    assert_eq!(view.blasts[0].anchor.x, 3.5);
}

#[test]
fn a_face_is_its_colour_at_its_own_brightness() {
    let [top, left, right] = colours(0xff8000, 0.5);
    assert_eq!((top.r, top.a), (1.0, 0.5));
    assert!((left.r - LEFT_SHADE).abs() < 1e-6);
    assert!((right.g - 128.0 / 255.0 * RIGHT_SHADE).abs() < 1e-6);
    assert_eq!(top.b, 0.0);
}

#[test]
fn it_draws_every_box_of_every_live_piece() {
    let view = spawned();
    let mut draws = Vec::new();
    let projection = ProjectionConfig {
        tile_width: 64.0,
        tile_height: 32.0,
        origin_x: 0.0,
        origin_y: 0.0,
        elevation_step: None,
    };
    view.collect(projection, &mut draws);
    assert_eq!(draws.len(), 3);
}
