use super::*;

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
fn autosave_fires_on_quit_with_unsaved_changes() {
    assert!(should_autosave(true, true, 0.0));
}

#[test]
fn autosave_fires_once_the_interval_elapsed() {
    assert!(should_autosave(true, false, AUTOSAVE_SECONDS + 1.0));
}

#[test]
fn autosave_waits_while_everything_is_saved() {
    assert!(!should_autosave(false, true, AUTOSAVE_SECONDS + 1.0));
    assert!(!should_autosave(false, false, f64::INFINITY));
}

#[test]
fn autosave_waits_within_the_interval() {
    assert!(!should_autosave(true, false, 0.0));
    assert!(!should_autosave(true, false, AUTOSAVE_SECONDS));
}
