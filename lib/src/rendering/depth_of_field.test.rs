use super::*;
use iso::projection::{GridPoint, ProjectionConfig};
use iso::scene_order::DrawKey;

use crate::assets::sprites::{Focus, ground_key, scene_key};

const TILE_WIDTH: f64 = 280.0;
const TILE_HEIGHT: f64 = 140.0;
const STEP: f64 = 100.0;
const HEIGHT: f32 = 800.0;

fn projection(level: f64) -> ProjectionConfig {
    ProjectionConfig {
        tile_width: TILE_WIDTH,
        tile_height: TILE_HEIGHT,
        elevation_step: Some(STEP),
        origin_x: 480.0,
        origin_y: 450.0 + level * STEP,
    }
}

fn frame(level: f64) -> DepthFrame {
    DepthFrame::new(
        projection(level),
        level,
        HEIGHT,
        GridPoint { x: 0.0, y: 0.0 },
    )
}

/// The CPU mirror of the shaders' unpacking of two bytes into a depth.
fn decode_depth(bytes: [u8; 2]) -> f32 {
    f32::from(u16::from_be_bytes(bytes)) / 65535.0 * DEPTH_SPAN + DEPTH_MIN
}

/// The CPU mirror of the depth fragment: the pixel's lifted height, held to the stamp.
fn depth_at(stamp: DepthStamp, pixel_y: f32, height: f32) -> f32 {
    ((pixel_y + stamp.lift) / height).clamp(stamp.least, stamp.most)
}

fn close(a: f32, b: f32, tolerance: f32) -> bool {
    (a - b).abs() <= tolerance
}

#[test]
fn a_depth_survives_its_sixteen_bit_round_trip() {
    for depth in [-0.9f32, -0.25, 0.0, 0.31, 0.5, 0.999, 1.4, 1.95] {
        let back = decode_depth(encode_depth(depth));
        assert!(
            close(back, depth, DEPTH_SPAN / 65535.0),
            "{depth} came back {back}"
        );
    }
}

#[test]
fn a_depth_beyond_the_range_is_held_at_its_edge() {
    assert!(close(decode_depth(encode_depth(-7.0)), DEPTH_MIN, 1e-6));
    assert!(close(
        decode_depth(encode_depth(9.0)),
        DEPTH_MIN + DEPTH_SPAN,
        1e-6
    ));
}

#[test]
fn the_focus_is_where_the_players_feet_meet_the_ground() {
    let frame = frame(0.0);
    assert!(close(frame.focus(), 450.0 / HEIGHT, 1e-6));
    let further = DepthFrame::new(projection(0.0), 0.0, HEIGHT, GridPoint { x: 1.0, y: 1.0 });
    assert!(close(
        further.focus(),
        (450.0 - TILE_HEIGHT as f32) / HEIGHT,
        1e-6
    ));
}

#[test]
fn the_whole_of_a_standing_sprite_reads_at_the_depth_of_its_cell() {
    let frame = frame(0.0);
    let key = scene_key(2.5, 1.5, 3.0, 0, TILE_HEIGHT);
    let stamp = frame.stamp(key, Focus::Standing);
    let foot = (450.0 - 4.0 * TILE_HEIGHT as f32 / 2.0) / HEIGHT;
    for pixel_y in [-400.0f32, 0.0, 120.0, 600.0, 1400.0] {
        assert!(close(depth_at(stamp, pixel_y, HEIGHT), foot, 1e-4));
    }
}

#[test]
fn a_tall_crown_and_its_trunk_share_one_depth_however_high_on_screen() {
    let frame = frame(0.0);
    let stamp = frame.stamp(scene_key(0.5, 0.5, 0.0, 0, TILE_HEIGHT), Focus::Standing);
    let trunk = depth_at(stamp, 440.0, HEIGHT);
    let crown = depth_at(stamp, 40.0, HEIGHT);
    assert_eq!(trunk, crown);
}

#[test]
fn a_top_face_reads_the_ground_it_shows_pixel_by_pixel() {
    let level = 0.0;
    let frame = frame(level);
    let top = 2.0;
    let (x, y) = (3.5, 2.5);
    let stamp = frame.stamp(
        ground_key(x, y, top, 0, TILE_HEIGHT),
        Focus::Surface { top },
    );
    let centre = 450.0 - (x + y) as f32 * TILE_HEIGHT as f32 / 2.0;
    let face_centre = centre - top as f32 * STEP as f32;
    assert!(close(
        depth_at(stamp, face_centre, HEIGHT),
        centre / HEIGHT,
        1e-4
    ));
    let quarter = TILE_HEIGHT as f32 / 4.0;
    assert!(close(
        depth_at(stamp, face_centre + quarter, HEIGHT),
        (centre + quarter) / HEIGHT,
        1e-4
    ));
    assert!(close(
        depth_at(stamp, face_centre - quarter, HEIGHT),
        (centre - quarter) / HEIGHT,
        1e-4
    ));
}

#[test]
fn the_sides_under_a_top_face_read_at_the_cells_near_corner() {
    let frame = frame(0.0);
    let top = 2.0;
    let stamp = frame.stamp(
        ground_key(0.5, 0.5, top, 0, TILE_HEIGHT),
        Focus::Surface { top },
    );
    let centre = 450.0 - TILE_HEIGHT as f32 / 2.0;
    let near = (centre + TILE_HEIGHT as f32 / 2.0) / HEIGHT;
    let face_centre = centre - top as f32 * STEP as f32;
    for below in [TILE_HEIGHT as f32, 2.0 * STEP as f32, 400.0] {
        assert!(close(
            depth_at(stamp, face_centre + below, HEIGHT),
            near,
            1e-4
        ));
    }
}

#[test]
fn neighbouring_top_faces_meet_without_a_step() {
    let frame = frame(0.0);
    let top = 0.0;
    let far = frame.stamp(
        ground_key(1.5, 1.5, top, 0, TILE_HEIGHT),
        Focus::Surface { top },
    );
    let near = frame.stamp(
        ground_key(2.5, 1.5, top, 0, TILE_HEIGHT),
        Focus::Surface { top },
    );
    let seam = 450.0 - 3.5 * TILE_HEIGHT as f32 / 2.0;
    assert!(close(
        depth_at(far, seam, HEIGHT),
        depth_at(near, seam, HEIGHT),
        1e-4
    ));
}

#[test]
fn the_camera_level_does_not_move_a_cell_out_of_its_depth() {
    let key = scene_key(1.5, 0.5, 2.0, 0, TILE_HEIGHT);
    let low = depth_at(frame(0.0).stamp(key, Focus::Standing), 0.0, HEIGHT);
    let high = depth_at(frame(2.0).stamp(key, Focus::Standing), 0.0, HEIGHT);
    assert!(close(low, high, 1e-4));
}

#[test]
fn a_flat_field_at_the_camera_level_keeps_the_screen_gradient() {
    let level = 1.0;
    let frame = frame(level);
    let stamp = frame.stamp(
        ground_key(0.5, 0.5, level, 0, TILE_HEIGHT),
        Focus::Surface { top: level },
    );
    let face_centre = 450.0 - TILE_HEIGHT as f32 / 2.0;
    assert!(close(
        depth_at(stamp, face_centre, HEIGHT),
        face_centre / HEIGHT,
        1e-4
    ));
}

#[test]
fn a_stamp_rides_on_the_colour_and_normal_of_every_vertex() {
    let stamp = frame(0.0).stamp(
        ground_key(0.5, 0.5, 1.0, 0, TILE_HEIGHT),
        Focus::Surface { top: 1.0 },
    );
    let mut vertex = Vertex::new(1.0, 2.0, 0.0, 0.3, 0.4, WHITE);
    stamp.over(&mut vertex);
    assert_eq!(
        decode_depth([vertex.color[0], vertex.color[1]]),
        decode_depth(encode_depth(stamp.least))
    );
    assert_eq!(
        decode_depth([vertex.color[2], vertex.color[3]]),
        decode_depth(encode_depth(stamp.most))
    );
    assert_eq!(vertex.normal.x, stamp.lift);
    assert_eq!(vertex.position, vec3(1.0, 2.0, 0.0));
    assert_eq!(vertex.uv, vec2(0.3, 0.4));
}

#[test]
fn the_shader_spells_out_the_same_curve_and_range() {
    assert!(GRADE_DEPTH_GLSL.contains("smoothstep"));
    assert!(GRADE_DEPTH_GLSL.contains(&format!("{DEPTH_MIN:?}")));
    assert!(DEPTH_FRAGMENT.contains(&format!("{DEPTH_SPAN:?}")));
}

#[test]
fn the_shaders_name_nothing_glsl_reserves() {
    for source in [GRADE_DEPTH_GLSL, DEPTH_FRAGMENT] {
        for reserved in [
            "packed",
            "float distance",
            "float sample",
            "input",
            "output",
        ] {
            assert!(!source.contains(reserved), "{reserved} is reserved");
        }
    }
}

#[test]
fn the_depth_map_is_drawn_at_half_resolution_and_never_empty() {
    assert_eq!(depth_target_size(960.0, 600.0), (480, 300));
    assert_eq!(depth_target_size(961.0, 3.0), (481, 2));
    assert_eq!(depth_target_size(0.0, f32::NAN), (1, 1));
}

#[test]
fn an_unused_key_still_names_a_depth() {
    let key = DrawKey {
        depth: -70.0,
        layer: 0,
    };
    let stamp = frame(0.0).stamp(key, Focus::Standing);
    assert!(close(stamp.least, 380.0 / HEIGHT, 1e-6));
    assert_eq!(stamp.least, stamp.most);
}
