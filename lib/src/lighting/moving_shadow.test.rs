use super::*;
use crate::assets::sprites::{DrawKind, ground_key, scene_key};
use crate::lighting::shadow_view::GROUND_SHADOW_LAYER;
use crate::terrain::terrain_view_blocks::TERRAIN_LAYER;
use iso::lighting::{DAWN, ShadowProjection};
use iso::scene_order::compare_draw_keys;
use iso::terrain::TerrainMaterial;
use std::cmp::Ordering;

const TILE_WIDTH: f64 = 280.0;

fn projection() -> ProjectionConfig {
    ProjectionConfig {
        tile_width: TILE_WIDTH,
        tile_height: TILE_WIDTH / 2.0,
        elevation_step: Some(140.0),
        origin_x: 600.0,
        origin_y: 400.0,
    }
}

/// The player as the client draws it: feet at the ground point, about a block tall.
fn layout(feet: ScreenPoint) -> SpriteLayout {
    SpriteLayout {
        x: feet.x - 60.0,
        y: feet.y - 200.0,
        width: 120.0,
        height: 200.0,
    }
}

fn frame() -> SpriteFrame {
    SpriteFrame {
        x: 0,
        y: 0,
        width: 64,
        height: 64,
    }
}

/// The key the player's own sprite is queued with: sorted by the column it stands on, on the
/// away layer, like the client draws it.
fn player_key() -> iso::scene_order::DrawKey {
    scene_key(
        10.5,
        20.5,
        2.0,
        crate::PLAYER_BEHIND_LAYER,
        TILE_WIDTH / 2.0,
    )
}

fn collect(
    light: &PhaseLight,
    level: f64,
    ground_at: impl Fn(i32, i32) -> Option<CellGround>,
) -> Vec<SpriteDraw> {
    let mut out = Vec::new();
    let feet = ScreenPoint { x: 120.0, y: 300.0 };
    collect_moving_shadow(
        light,
        3,
        frame(),
        layout(feet),
        feet,
        (10.5, 20.5),
        level,
        projection(),
        ground_at(10, 20),
        player_key(),
        &mut out,
    );
    out
}

fn at(elevation: f64) -> CellGround {
    CellGround {
        elevation,
        material: TerrainMaterial::Grass,
    }
}

fn flat() -> impl Fn(i32, i32) -> Option<CellGround> {
    |_, _| Some(at(2.0))
}

#[test]
fn the_shadow_is_queued_once_for_the_player() {
    let draws = collect(&DAWN, 2.0, flat());
    assert_eq!(draws.len(), 1, "the player has one projected silhouette");
    for draw in &draws {
        match &draw.kind {
            DrawKind::Silhouette {
                texture,
                points,
                uv,
                opacity,
                ..
            } => {
                assert_eq!(*texture, 3, "it is drawn from the caster's own texture");
                assert_eq!(points.len(), 4, "one uncut projection quad");
                assert_eq!(points.len(), uv.len());
                assert!((f64::from(*opacity) - DAWN.opacity()).abs() < 1e-6);
            }
            _ => panic!("a moving shadow is a silhouette"),
        }
        assert_eq!(draw.key.layer, GROUND_SHADOW_LAYER);
        assert_eq!(
            draw.key.depth,
            player_key().depth,
            "the shadow sorts at the player's depth, however far the light throws it"
        );
    }
}

#[test]
fn the_shadow_sorts_with_the_player_it_was_cast_from() {
    let shadow = &collect(&DAWN, 2.0, flat())[0].key;
    let player = player_key();
    let flat_front = ground_key(9.5, 20.5, 2.0, TERRAIN_LAYER, TILE_WIDTH / 2.0);

    assert_eq!(
        shadow.depth, player.depth,
        "the shadow keeps the player's depth wherever the quad lands"
    );
    assert_eq!(
        compare_draw_keys(shadow, &player),
        Ordering::Less,
        "on the ground layer it draws before the sprite that casts it"
    );
    assert_eq!(
        compare_draw_keys(&flat_front, shadow),
        Ordering::Less,
        "the flat tile immediately in front draws below the shadow instead of cutting it"
    );
}

#[test]
fn the_shadow_is_laid_on_the_level_of_the_ground_it_falls_on() {
    // A cell drawn lower puts the shadow lower on screen.
    let lower = collect(&DAWN, 2.0, |_, _| Some(at(1.0)));
    let lowest = |draws: &[SpriteDraw]| {
        draws
            .iter()
            .filter_map(|draw| match &draw.kind {
                DrawKind::Silhouette { points, .. } => Some(
                    points
                        .iter()
                        .map(|point| point.1)
                        .fold(f64::NEG_INFINITY, f64::max),
                ),
                _ => None,
            })
            .fold(f64::NEG_INFINITY, f64::max)
    };
    assert!(
        lowest(&lower) > lowest(&collect(&DAWN, 2.0, flat())),
        "a lower top puts the shadow lower on screen"
    );
}

#[test]
fn a_level_change_eases_the_shadow_receiver_across_frames() {
    let mut receiver = MovingShadowReceiver::default();
    assert_eq!(receiver.update(Some(at(2.0)), 0.0), Some(at(2.0)));
    let first = receiver
        .update(Some(at(3.0)), 1.0 / 60.0)
        .expect("a receiver");
    assert!(
        first.elevation > 2.0 && first.elevation < 3.0,
        "the first frame does not snap"
    );
    let later = receiver
        .update(Some(at(3.0)), 1.0 / 60.0)
        .expect("a receiver");
    assert!(
        later.elevation > first.elevation && later.elevation < 3.0,
        "it continues towards the new level"
    );
}

#[test]
fn a_step_down_eases_more_slowly_than_a_step_up() {
    let mut rising = MovingShadowReceiver::default();
    rising.update(Some(at(2.0)), 0.0);
    let up = rising
        .update(Some(at(3.0)), 1.0 / 60.0)
        .expect("a receiver");
    let mut falling = MovingShadowReceiver::default();
    falling.update(Some(at(3.0)), 0.0);
    let down = falling
        .update(Some(at(2.0)), 1.0 / 60.0)
        .expect("a receiver");
    assert!(
        3.0 - down.elevation < up.elevation - 2.0,
        "the receiver travels less in its first downward frame"
    );
}

#[test]
fn a_step_in_the_ground_does_not_duplicate_the_shadow() {
    // Terrain changes do not split the player shadow into a top, wall and lower-ground piece.
    let draws = collect(&DAWN, 2.0, |_, y| Some(at(if y >= 21 { 3.0 } else { 2.0 })));
    assert_eq!(draws.len(), 1, "the step cannot create extra shadow pieces");
}

#[test]
fn a_cell_the_world_has_not_loaded_takes_no_piece() {
    let draws = collect(&DAWN, 2.0, |x, _| (x == 10).then_some(at(2.0)));
    assert!(!draws.is_empty());
    let projection = projection();
    let left = project_block(GridPoint { x: 10.0, y: 0.0 }, 0.0, projection).screen_x;
    for draw in &draws {
        let DrawKind::Silhouette { points, .. } = &draw.kind else {
            panic!("a moving shadow is a silhouette");
        };
        assert!(
            points
                .iter()
                .all(|point| point.0 <= left + projection.tile_width * 6.0)
        );
    }
}

#[test]
fn a_phase_whose_shadows_are_invisible_queues_nothing() {
    let dark = PhaseLight {
        shadow: ShadowProjection {
            alpha: 0.0,
            ..DAWN.shadow
        },
        shadow_strength: 0.0,
    };
    assert!(collect(&dark, 2.0, flat()).is_empty());
}

#[test]
fn a_sprite_with_no_artwork_above_its_feet_queues_nothing() {
    let mut out = Vec::new();
    let feet = ScreenPoint { x: 120.0, y: 300.0 };
    collect_moving_shadow(
        &DAWN,
        0,
        frame(),
        SpriteLayout {
            x: feet.x - 60.0,
            y: feet.y,
            width: 120.0,
            height: 200.0,
        },
        feet,
        (10.5, 20.5),
        2.0,
        projection(),
        Some(at(2.0)),
        player_key(),
        &mut out,
    );
    assert!(out.is_empty());
}
fn key(depth: f64) -> iso::scene_order::DrawKey {
    iso::scene_order::DrawKey {
        depth,
        layer: crate::PLAYER_BEHIND_LAYER,
    }
}

#[test]
fn the_shadow_key_commits_immediately_until_a_level_changes() {
    let mut hold = MovingShadowKey::default();
    assert_eq!(
        hold.update(key(1.0), false, false, 1.0 / 60.0),
        key(1.0),
        "the first key is committed straight away"
    );
    assert_eq!(
        hold.update(key(2.0), false, false, 1.0 / 60.0).depth,
        2.0,
        "a walk without a level change commits at once"
    );
}

#[test]
fn the_shadow_key_lingers_for_a_few_milliseconds_after_a_level_change() {
    let mut hold = MovingShadowKey::default();
    hold.update(key(1.0), false, false, 1.0 / 60.0);
    let frame = 1.0 / 60.0;
    let armed = hold.update(key(9.0), false, true, frame);
    assert_eq!(
        armed.depth, 1.0,
        "the arming frame still sorts where the shadow drew before the change"
    );
    let mut lingering = 0;
    while hold.update(key(9.0), false, false, frame).depth != 9.0 {
        lingering += 1;
        assert!(lingering < 60, "the hold ends");
    }
    assert!(
        lingering >= 6,
        "the shadow lingers for at least a few frames, not just the arming one"
    );
    assert!(
        (lingering as f64 * frame) + frame >= SHADOW_KEY_DELAY_SECONDS - 1e-6,
        "and no further than the delay it was held for"
    );
}

#[test]
fn a_walk_during_the_hold_is_masked_until_the_deadline() {
    let mut hold = MovingShadowKey::default();
    let frame = 1.0 / 60.0;
    hold.update(key(10.0), false, false, frame);
    hold.update(key(30.0), false, true, frame);
    assert_eq!(
        hold.update(key(40.0), false, false, frame).depth,
        10.0,
        "a walk while a level change is pending keeps the committed key"
    );
    let mut shown = 10.0;
    for _ in 0..60 {
        shown = hold.update(key(40.0), false, false, frame).depth;
        if shown != 10.0 {
            break;
        }
    }
    assert_eq!(
        shown, 30.0,
        "it adopts the pending key at the deadline, not the walked-to one"
    );
    assert_eq!(
        hold.update(key(40.0), false, false, frame).depth,
        40.0,
        "and the walk commits on the next frame"
    );
}

#[test]
fn a_level_change_never_advances_while_the_player_is_in_the_air() {
    let mut hold = MovingShadowKey::default();
    let frame = 1.0 / 60.0;
    hold.update(key(1.0), false, false, frame);
    // The feet cross into the landing cell mid-jump; the signal cannot advance the shadow.
    for _ in 0..120 {
        assert_eq!(
            hold.update(key(9.0), true, false, frame).depth,
            1.0,
            "while the player is in the air the committed key is kept"
        );
    }
    // Landing: the physics commits the new level, and the hold counts down from there.
    let landing = hold.update(key(9.0), false, true, frame);
    assert_eq!(landing.depth, 1.0, "the landing frame still sorts at the old key");
    let mut lingering = 0;
    while hold.update(key(9.0), false, false, frame).depth != 9.0 {
        lingering += 1;
        assert!(lingering < 60, "the hold ends");
    }
    assert!(
        lingering >= 6,
        "the shadow lingers a few frames after the landing, not only before it"
    );
}

#[test]
fn a_second_level_change_re_arms_the_hold_with_the_newest_key() {
    let mut hold = MovingShadowKey::default();
    let frame = 1.0 / 60.0;
    hold.update(key(1.0), false, false, frame);
    hold.update(key(2.0), false, true, frame);
    assert_eq!(
        hold.update(key(3.0), false, true, frame).depth,
        1.0,
        "the arming frame keeps the committed key"
    );
    let mut seen = Vec::new();
    for _ in 0..120 {
        let shown = hold.update(key(3.0), false, false, frame);
        seen.push(shown.depth);
        if shown.depth == 3.0 {
            break;
        }
    }
    assert!(
        seen.contains(&3.0),
        "the shadow does end up sorting by the newest key"
    );
    assert!(
        !seen.contains(&2.0),
        "the superseded pending key never becomes the shown key"
    );
}

#[test]
fn a_change_of_layer_alone_arms_no_hold() {
    let mut hold = MovingShadowKey::default();
    let frame = 1.0 / 60.0;
    let behind = key(5.0);
    let front = iso::scene_order::DrawKey {
        depth: 5.0,
        layer: crate::PLAYER_FRONT_LAYER,
    };
    assert_eq!(hold.update(behind, false, false, frame), behind);
    assert_eq!(
        hold.update(front, true, false, frame).depth,
        5.0,
        "a layer flip inside the same depth commits at once, even in the air"
    );
    assert_eq!(
        hold.update(front, false, true, frame).depth,
        5.0,
        "and a level signal with the same depth commits at once"
    );
}
