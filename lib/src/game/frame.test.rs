use super::*;
use iso::grid::WorldCoord;
use iso::player::physics::{
    PlayerGround, PlayerObstacle, create_player, jump_player, set_player_run, step_player,
};
use iso::terrain::{TerrainColumn, TerrainMaterial};

struct Lawn;

impl PlayerGround for Lawn {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn> {
        Some(TerrainColumn {
            coord: WorldCoord { x, y },
            elevation: 8,
            surface: TerrainMaterial::Grass,
            walkable: true,
        })
    }
    fn occupancy_at(&self, _x: i32, _y: i32) -> Vec<PlayerObstacle> {
        Vec::new()
    }
}

fn camera_path(jump: bool, frame_ms: f64) -> Vec<(f64, f64)> {
    let mut player = create_player(&Lawn, GridPoint { x: 2.0, y: 2.0 });
    set_player_run(&mut player, true);
    player.walk = GridPoint {
        x: std::f64::consts::FRAC_1_SQRT_2,
        y: -std::f64::consts::FRAC_1_SQRT_2,
    };
    let mut stepper = iso::simulation::FixedStepper::default();
    let mut camera = Camera {
        x: 2.0,
        y: 2.0,
        zoom: 1.0,
    };
    let mut focus = iso::camera::CameraFocus::new(
        &iso::player::physics::get_player_render_position(&player, 1.0),
    );
    let frames = (4.0 * 1000.0 / frame_ms) as usize;
    let mut path = Vec::with_capacity(frames);
    for frame in 0..frames {
        if jump && frame == 60 {
            jump_player(&mut player);
        }
        let ticks = stepper.consume_frame(frame_ms);
        if ticks > 0 {
            step_player(
                &mut player,
                &mut Lawn,
                u32::try_from(ticks).unwrap_or(u32::MAX),
            );
        }
        let rp = iso::player::physics::get_player_render_position(
            &player,
            stepper.interpolation_alpha(),
        );
        let level = focus.advance(
            &rp,
            player.motion,
            frame_ms,
            iso::camera::CAMERA_LEVEL_SMOOTH_MS,
        );
        camera = camera_after_follow(camera, GridPoint { x: rp.x, y: rp.y }, frame_ms);
        let projection = crate::game::scene::frame_projection(
            camera,
            level,
            960.0,
            600.0,
            crate::game::config::SceneMetrics::REFERENCE,
        );
        path.push((projection.origin_x, projection.origin_y));
    }
    path
}

#[test]
fn running_jump_leaves_the_flat_ground_camera_untouched() {
    for frame_ms in [8.3333, 12.5, 16.6667, 20.8333] {
        let plain = camera_path(false, frame_ms);
        let jumping = camera_path(true, frame_ms);
        assert_eq!(plain.len(), jumping.len());
        for (index, (a, b)) in plain.iter().zip(&jumping).enumerate() {
            assert!(
                (a.0 - b.0).abs() < 1e-9 && (a.1 - b.1).abs() < 1e-9,
                "frame {index} at {frame_ms} ms: origin ({},{}) vs ({},{})",
                a.0,
                a.1,
                b.0,
                b.1
            );
        }
    }
}

#[test]
fn camera_after_follow_eases_towards_the_target_instead_of_snapping() {
    let camera = Camera {
        x: 0.0,
        y: 0.0,
        zoom: 1.0,
    };
    let next = camera_after_follow(camera, GridPoint { x: 10.0, y: 0.0 }, 16.0);
    assert!(next.x > 0.0, "the follow must move towards the target");
    assert!(
        next.x < 10.0,
        "the follow must not snap onto the target in one frame"
    );
}

#[test]
fn camera_after_follow_converges_onto_the_target_when_the_player_stops() {
    let target = GridPoint { x: 3.0, y: -2.0 };
    let mut camera = Camera {
        x: 0.0,
        y: 0.0,
        zoom: 1.0,
    };
    for _ in 0..240 {
        camera = camera_after_follow(camera, target, 16.0);
    }
    assert!((camera.x - target.x).abs() < 1e-3);
    assert!((camera.y - target.y).abs() < 1e-3);
}

#[test]
fn camera_after_follow_keeps_the_zoom() {
    let camera = Camera {
        x: 0.0,
        y: 0.0,
        zoom: 1.4,
    };
    let next = camera_after_follow(camera, GridPoint { x: 5.0, y: 5.0 }, 16.0);
    assert_eq!(next.zoom, 1.4);
}

#[test]
fn camera_after_follow_holds_the_camera_on_a_zero_frame() {
    let camera = Camera {
        x: 1.0,
        y: 2.0,
        zoom: 1.0,
    };
    let next = camera_after_follow(camera, GridPoint { x: 9.0, y: 9.0 }, 0.0);
    assert_eq!(next, camera);
}

#[test]
fn camera_after_follow_does_not_clamp_a_wide_world() {
    let camera = Camera {
        x: 0.0,
        y: 0.0,
        zoom: 1.0,
    };
    let next = camera_after_follow(
        camera,
        GridPoint {
            x: 1.0e14,
            y: -1.0e14,
        },
        1000.0,
    );
    assert!(next.x > 1.0e13);
    assert!(next.y < -1.0e13);
}

#[test]
fn ticks_pass_through_unchanged_below_the_limit() {
    assert_eq!(frame_ticks(0), 0);
    assert_eq!(frame_ticks(1), 1);
    assert_eq!(frame_ticks(u64::from(u32::MAX)), u32::MAX);
}

#[test]
fn ticks_saturate_instead_of_wrapping() {
    assert_eq!(frame_ticks(u64::from(u32::MAX) + 1), u32::MAX);
    assert_eq!(frame_ticks(u64::MAX), u32::MAX);
}

#[test]
fn saving_on_quit_fires_with_unsaved_changes() {
    assert!(should_save_on_quit(true, true));
}

#[test]
fn quitting_waits_while_everything_is_saved() {
    assert!(!should_save_on_quit(false, true));
    assert!(!should_save_on_quit(true, false));
    assert!(!should_save_on_quit(false, false));
}
