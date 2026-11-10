use super::*;
use crate::assets::sprites::{ground_key, scene_key};
use crate::game::config::{
    CHUNK_CULL_MARGIN, ENTITY_LAYER, PLAYER_BEHIND_LAYER, PLAYER_FRONT_LAYER,
    PREVIEW_ELEVATION_STEP, PREVIEW_TILE_HEIGHT, PREVIEW_TILE_WIDTH, SceneMetrics,
};
use crate::lighting::shadow_view::GROUND_SHADOW_LAYER;
use crate::lighting::shadow_view_atlas::SLOT_COUNT;
use crate::terrain::terrain_view_blocks::TERRAIN_LAYER;
use iso::camera::{Camera, ScreenSize, visible_chunks};
use iso::scene_order::compare_draw_keys;

/// The shadow atlas holds nine chunks; the camera may not ask for more than it holds.
#[test]
fn the_atlas_holds_more_chunks_than_the_camera_can_show() {
    let viewport = ScreenSize {
        width: 3840.0,
        height: 2160.0,
    };
    let projection = preview_projection(0.0, 0.0, SceneMetrics::REFERENCE);
    let camera = Camera {
        x: 0.0,
        y: 0.0,
        zoom: 1.0,
    };

    let culled = visible_chunks(camera, viewport, projection, CHUNK_CULL_MARGIN);

    assert!(
        culled.len() <= SLOT_COUNT,
        "the camera shows {} chunks and the shadow atlas holds {SLOT_COUNT}",
        culled.len()
    );
}

#[test]
fn player_feet_stay_at_their_terrain_column_centre() {
    let projection = ProjectionConfig {
        tile_width: 150.0,
        tile_height: 75.0,
        elevation_step: Some(50.0),
        origin_x: 400.0,
        origin_y: 300.0,
    };
    let position = GridPoint { x: 12.0, y: 7.0 };

    assert_eq!(
        player_feet(position, 0.0, projection),
        ScreenPoint {
            x: 775.0,
            y: -450.0
        },
        "player feet use the same projected centre as their supporting terrain column"
    );
}

#[test]
fn the_player_is_drawn_at_its_measured_artwork_scaled_about_its_feet() {
    let ink = InkBox {
        x: -0.128_125,
        y: -0.278_809,
        width: 0.263_086,
        height: 0.332_91,
    };
    let feet = ScreenPoint { x: 400.0, y: 300.0 };

    let layout = ink_layout(feet, ink.scaled(PLAYER_SCALE), PREVIEW_TILE_WIDTH);

    let expect = |value: f64| value * PLAYER_SCALE * PREVIEW_TILE_WIDTH;
    assert!((layout.x - (feet.x + expect(ink.x))).abs() < 1e-9);
    assert!((layout.y - (feet.y + expect(ink.y))).abs() < 1e-9);
    assert!((layout.width - expect(ink.width)).abs() < 1e-9);
    assert!((layout.height - expect(ink.height)).abs() < 1e-9);
    assert!(
        layout.width < PREVIEW_TILE_WIDTH,
        "the figure is narrower than the tile it stands on"
    );
}

#[test]
fn body_motion_scales_the_player_about_its_feet() {
    use crate::player::body_motion::BodyScale;

    let feet = ScreenPoint { x: 400.0, y: 300.0 };
    let layout = ink_layout(
        feet,
        InkBox {
            x: -0.1,
            y: -0.3,
            width: 0.2,
            height: 0.3,
        },
        280.0,
    );
    let scaled = scale_player_layout(layout, feet, BodyScale { x: 0.9, y: 1.2 });

    assert_eq!(scaled.x + scaled.width / 2.0, feet.x);
    assert_eq!(scaled.y + scaled.height, feet.y);
    assert_eq!(scaled.width, layout.width * 0.9);
    assert_eq!(scaled.height, layout.height * 1.2);
}

#[test]
fn the_player_and_what_stands_on_its_column_sort_by_the_same_point() {
    let (x, y, elevation) = (12.5, 7.5, 2.0);
    let key = |layer| scene_key(x, y, elevation, layer, PREVIEW_TILE_HEIGHT);

    let entity = key(ENTITY_LAYER);
    let behind = key(PLAYER_BEHIND_LAYER);
    let front = key(PLAYER_FRONT_LAYER);

    assert_eq!(behind.depth, entity.depth, "one cell is one depth");
    assert_eq!(
        compare_draw_keys(&behind, &entity),
        std::cmp::Ordering::Less,
        "walking along the back of the column it goes under the tree"
    );
    assert_eq!(
        compare_draw_keys(&front, &entity),
        std::cmp::Ordering::Greater,
        "along the front of the same column it goes over it"
    );

    let own_ground = ground_key(x, y, elevation, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT);
    assert_eq!(
        compare_draw_keys(&own_ground, &behind),
        std::cmp::Ordering::Less,
        "the player stands on its column's top, not under it"
    );
}

/// Ground level with the player towards the camera is drawn under it; a step up still covers
/// it.
#[test]
fn level_ground_towards_the_camera_never_covers_the_player_and_a_step_still_does() {
    use std::cmp::Ordering;

    let (x, y, elevation) = (12.5, 7.5, 2.0);
    for layer in [PLAYER_BEHIND_LAYER, PLAYER_FRONT_LAYER] {
        let player = scene_key(x, y, elevation, layer, PREVIEW_TILE_HEIGHT);
        for (dx, dy) in [(-1.0, 0.0), (0.0, -1.0)] {
            let level = ground_key(
                x + dx,
                y + dy,
                elevation,
                TERRAIN_LAYER,
                PREVIEW_TILE_HEIGHT,
            );
            assert_eq!(
                compare_draw_keys(&level, &player),
                Ordering::Less,
                "ground level with the player's at ({dx}, {dy}) is drawn under it"
            );
            let step = ground_key(
                x + dx,
                y + dy,
                elevation + 1.0,
                TERRAIN_LAYER,
                PREVIEW_TILE_HEIGHT,
            );
            assert_eq!(
                compare_draw_keys(&step, &player),
                Ordering::Greater,
                "a step up at ({dx}, {dy}) still hides the player behind it"
            );
        }
    }
}

/// The diamond of the cell across the corner starts where the feet stop.
#[test]
fn the_cell_across_the_corner_only_ever_touches_the_players_feet() {
    let projection = ProjectionConfig {
        origin_x: 0.0,
        origin_y: 0.0,
        tile_width: PREVIEW_TILE_WIDTH,
        tile_height: PREVIEW_TILE_HEIGHT,
        elevation_step: Some(PREVIEW_ELEVATION_STEP),
    };
    let (cx, cy, elevation) = (12.0, 7.0, 2.0);
    let feet = player_feet(
        GridPoint {
            x: cx - 0.5,
            y: cy - 0.5,
        },
        elevation,
        projection,
    );
    let across = project_block(
        GridPoint {
            x: cx - 0.5,
            y: cy - 0.5,
        },
        elevation,
        projection,
    );
    assert!(
        (across.screen_y - PREVIEW_TILE_HEIGHT / 2.0 - feet.y).abs() < 1e-9,
        "the diamond starts where the feet stop"
    );
}

/// A shadow is painted on a cell's top, so it sorts with the ground it lies on and never
/// covers the player walking over it.
#[test]
fn what_is_painted_on_the_ground_sorts_with_the_ground_it_lies_on() {
    use std::cmp::Ordering;

    let (x, y, elevation) = (12.5, 7.5, 2.0);
    let shadow = ground_key(x, y, elevation, GROUND_SHADOW_LAYER, PREVIEW_TILE_HEIGHT);
    assert_eq!(
        compare_draw_keys(
            &ground_key(x, y, elevation, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
            &shadow,
        ),
        Ordering::Less,
        "it lies on its own ground",
    );
    for (dx, dy) in [(-1.0, 0.0), (0.0, -1.0), (-1.0, -1.0)] {
        assert_eq!(
            compare_draw_keys(
                &ground_key(
                    x + dx,
                    y + dy,
                    elevation,
                    TERRAIN_LAYER,
                    PREVIEW_TILE_HEIGHT,
                ),
                &shadow,
            ),
            Ordering::Greater,
            "and the ground at ({dx}, {dy}) covers it, as it covered it before",
        );
    }
    assert_eq!(
        compare_draw_keys(
            &shadow,
            &scene_key(x, y, elevation, PLAYER_BEHIND_LAYER, PREVIEW_TILE_HEIGHT),
        ),
        Ordering::Less,
        "and the player walks over it",
    );
}

/// Moving every block of the terrain back by the same cell cannot change its order among
/// itself.
#[test]
fn the_terrain_keeps_its_order_among_itself() {
    let cells = [
        (4.5, 9.5, 0.0),
        (3.5, 9.5, 1.0),
        (4.5, 8.5, -2.0),
        (3.5, 8.5, 3.0),
    ];
    for &(ax, ay, ae) in &cells {
        for &(bx, by, be) in &cells {
            let before = compare_draw_keys(
                &scene_key(ax, ay, ae, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
                &scene_key(bx, by, be, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
            );
            let after = compare_draw_keys(
                &ground_key(ax, ay, ae, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
                &ground_key(bx, by, be, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
            );
            assert_eq!(
                before, after,
                "({ax}, {ay}, {ae}) against ({bx}, {by}, {be})"
            );
        }
    }
}

#[test]
fn the_player_passes_behind_what_stands_on_the_far_half_of_its_column() {
    let column = WorldCoord { x: 12, y: 7 };

    assert_eq!(
        player_layer(GridPoint { x: 12.3, y: 7.0 }, column),
        PLAYER_BEHIND_LAYER,
        "past the column's centre it is further from the camera than the tree on it"
    );
    assert_eq!(
        player_layer(GridPoint { x: 11.7, y: 7.0 }, column),
        PLAYER_FRONT_LAYER,
        "before the centre it is nearer the camera and covers what stands there"
    );
    assert_eq!(
        player_layer(GridPoint { x: 12.0, y: 7.0 }, column),
        PLAYER_FRONT_LAYER,
        "on the centre it stands in front"
    );
    const {
        assert!(PLAYER_BEHIND_LAYER < ENTITY_LAYER && ENTITY_LAYER < PLAYER_FRONT_LAYER);
    }
}

/// The shadow atlas feeds the zoomed-out touch view too: a large coarse-pointer screen may
/// not ask for more chunks than it holds.
#[test]
fn the_atlas_holds_more_chunks_than_a_coarse_pointer_screen_can_show() {
    let viewport = ScreenSize {
        width: 3840.0,
        height: 2160.0,
    };
    let metrics = SceneMetrics::for_pointer(true);
    let projection = ProjectionConfig {
        origin_x: 0.0,
        origin_y: 0.0,
        tile_width: metrics.tile_width,
        tile_height: metrics.tile_height,
        elevation_step: Some(metrics.elevation_step),
    };
    let camera = Camera {
        x: 0.0,
        y: 0.0,
        zoom: 1.0,
    };

    let culled = visible_chunks(camera, viewport, projection, CHUNK_CULL_MARGIN);

    assert!(
        culled.len() <= SLOT_COUNT,
        "the coarse-pointer camera shows {} chunks and the shadow atlas holds {SLOT_COUNT}",
        culled.len()
    );
}
