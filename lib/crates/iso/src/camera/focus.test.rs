use crate::camera::{CAMERA_LEVEL_SMOOTH_MS, CAMERA_RISE_MS_PER_BLOCK, CameraFocus};
use crate::player::{PlayerMotionType, PlayerRenderPosition, get_climb_rise};
use crate::projection::ProjectionConfig;

const PROJECTION: ProjectionConfig = ProjectionConfig {
    tile_width: 40.0,
    tile_height: 20.0,
    elevation_step: Some(10.0),
    origin_x: 0.0,
    origin_y: 0.0,
};

/// Blocks of level the projection turns into one block of lift along both world axes.
const LIFT_PER_LEVEL: f64 = 0.5;

fn at(elevation: f64, height: f64) -> PlayerRenderPosition {
    PlayerRenderPosition {
        x: 4.0,
        y: 6.0,
        elevation,
        height,
    }
}

#[test]
fn opens_on_the_top_the_player_stands_on() {
    let focus = CameraFocus::new(&at(3.0, 0.0));
    assert_eq!(focus.level(), 3.0, "a session opens settled, with no swoop");
    assert!(!focus.rising());
}

#[test]
fn looks_at_the_players_column_lifted_by_its_level() {
    let mut focus = CameraFocus::new(&at(2.0, 0.0));
    let ground = focus.ground(&at(2.0, 0.0), PlayerMotionType::Walking, 16.0, PROJECTION);
    assert_eq!(ground.x, 4.0 + 2.0 * LIFT_PER_LEVEL);
    assert_eq!(ground.y, 6.0 + 2.0 * LIFT_PER_LEVEL);
}

#[test]
fn a_jump_does_not_bob_the_camera() {
    let mut focus = CameraFocus::new(&at(2.0, 0.0));
    for height in [0.2, 0.5, 0.75, 0.5, 0.2] {
        focus.ground(&at(2.0, height), PlayerMotionType::Jumping, 16.0, PROJECTION);
        assert_eq!(focus.level(), 2.0, "the level stays on the top it took off from");
    }
    focus.ground(&at(2.0, 0.0), PlayerMotionType::Idle, 16.0, PROJECTION);
    assert_eq!(focus.level(), 2.0);
}

#[test]
fn a_fall_is_followed_down_as_the_feet_fall() {
    let mut focus = CameraFocus::new(&at(4.0, 0.0));
    // Walking off a ledge: the column under it is already the lower top, and its feet are the two
    // blocks of `height` above that top they fall through.
    focus.ground(&at(2.0, 2.0), PlayerMotionType::Falling, 16.0, PROJECTION);
    assert_eq!(focus.level(), 4.0, "it starts where the feet left the ground");
    focus.ground(&at(2.0, 1.0), PlayerMotionType::Falling, 16.0, PROJECTION);
    assert_eq!(focus.level(), 3.0, "the camera is half way down with the feet, not waiting to land");
    focus.ground(&at(2.0, 0.0), PlayerMotionType::Idle, 16.0, PROJECTION);
    assert_eq!(focus.level(), 2.0, "landing on the lower top is no jolt, it was on the way");
    assert!(!focus.rising());
}

#[test]
fn a_jump_onto_a_higher_top_rises_on_the_climbs_curve() {
    let mut focus = CameraFocus::new(&at(2.0, 0.0));
    let landed = at(3.0, 0.0);
    let mut levels = vec![];
    let step = CAMERA_RISE_MS_PER_BLOCK / 10.0;
    for frame in 1..=10 {
        focus.ground(&landed, PlayerMotionType::Idle, step, PROJECTION);
        levels.push(focus.level());
        let risen = get_climb_rise(f64::from(frame) * step / CAMERA_RISE_MS_PER_BLOCK);
        let expected = if risen < 1.0 { 2.0 + risen } else { 3.0 };
        assert!(
            (levels[levels.len() - 1] - expected).abs() < 1e-12,
            "frame {frame}: {} is not the climb curve's {expected}",
            levels[levels.len() - 1],
        );
    }
    assert!(levels[0] > 2.0 && levels[0] < 2.1, "it starts slowly, not in one jolt");
    assert!(levels.windows(2).all(|pair| pair[1] >= pair[0]), "it only ever rises");
    assert_eq!(*levels.last().unwrap(), 3.0, "and it gets all the way there");
    focus.ground(&landed, PlayerMotionType::Idle, step, PROJECTION);
    assert!(!focus.rising(), "once on the aim the rise is over");
}

#[test]
fn a_higher_top_part_way_up_a_rise_restarts_it_from_where_it_is() {
    let mut focus = CameraFocus::new(&at(0.0, 0.0));
    focus.ground(&at(1.0, 0.0), PlayerMotionType::Idle, CAMERA_RISE_MS_PER_BLOCK / 2.0, PROJECTION);
    let part_way = focus.level();
    assert!(part_way > 0.0 && part_way < 1.0);
    focus.ground(&at(2.0, 0.0), PlayerMotionType::Idle, 0.0, PROJECTION);
    assert_eq!(focus.level(), part_way, "the new rise starts where the old one had got to");
    for _ in 0..40 {
        focus.ground(&at(2.0, 0.0), PlayerMotionType::Idle, CAMERA_RISE_MS_PER_BLOCK / 4.0, PROJECTION);
    }
    assert_eq!(focus.level(), 2.0);
}

#[test]
fn climbing_and_flying_follow_the_feet_up_without_a_rise() {
    for motion in [PlayerMotionType::Climbing, PlayerMotionType::Flying] {
        let mut focus = CameraFocus::new(&at(2.0, 0.0));
        focus.ground(&at(2.0, 0.4), motion, 16.0, PROJECTION);
        assert_eq!(focus.level(), 2.4, "{motion:?} follows the feet as they go");
        assert!(!focus.rising(), "{motion:?} needs no rise, it is already following");
    }
}

#[test]
fn a_frame_with_no_time_does_not_advance_a_rise() {
    let mut focus = CameraFocus::new(&at(0.0, 0.0));
    for elapsed in [0.0, -16.0, f64::NAN, f64::INFINITY] {
        focus.ground(&at(1.0, 0.0), PlayerMotionType::Idle, elapsed, PROJECTION);
        assert_eq!(focus.level(), 0.0, "{elapsed} is not a frame's worth of time");
    }
}

#[test]
fn advance_is_the_level_and_ground_is_that_level_as_a_lift() {
    let mut eased = CameraFocus::new(&at(0.0, 0.0));
    let mut lifted = CameraFocus::new(&at(0.0, 0.0));
    let higher = at(1.0, 0.0);
    let step = CAMERA_RISE_MS_PER_BLOCK / 3.0;
    for _ in 0..2 {
        let level = eased.advance(&higher, PlayerMotionType::Idle, step, 0.0);
        assert_eq!(level, eased.level(), "it answers the level it eased to");
        let ground = lifted.ground(&higher, PlayerMotionType::Idle, step, PROJECTION);
        assert_eq!(lifted.level(), level, "both ways ease the same");
        assert_eq!(ground.x, higher.x + level * LIFT_PER_LEVEL);
        assert_eq!(ground.y, higher.y + level * LIFT_PER_LEVEL);
    }
}

#[test]
fn the_level_shown_settles_on_the_level_aimed_at_without_a_corner() {
    // Landing on the top a block down: the aim is the feet, and it drops to the lower top the frame
    // the player lands, so the smoothing is the only thing the camera is behind by — and the only
    // thing the player moves on screen by.
    let mut focus = CameraFocus::new(&at(1.0, 0.0));
    let landed = at(0.0, 0.0);
    let frame = 1000.0 / 60.0;
    let mut shown = vec![];
    for _ in 0..60 {
        shown.push(focus.advance(&landed, PlayerMotionType::Falling, frame, CAMERA_LEVEL_SMOOTH_MS));
    }
    assert_eq!(focus.aim_level(), 0.0, "it aims at the top the feet reached");
    let steps: Vec<f64> = std::iter::once(1.0)
        .chain(shown.iter().copied())
        .collect::<Vec<_>>()
        .windows(2)
        .map(|pair| pair[0] - pair[1])
        .collect();
    assert!(
        steps[0] < steps[1] && steps[1] < steps[2],
        "it leaves slowly instead of answering at full speed: {steps:?}",
    );
    let fastest = steps.iter().copied().fold(0.0_f64, f64::max);
    assert!(
        steps.iter().rev().take(20).all(|step| *step < fastest / 10.0),
        "and arrives slowly too",
    );
    assert!(shown.windows(2).all(|pair| pair[1] <= pair[0]), "without ever turning back");
    assert_eq!(*shown.last().unwrap(), 0.0, "and it settles rather than trailing for ever");
    assert_eq!(focus.level(), 0.0, "which is the level it shows");
}

#[test]
fn a_shorter_step_is_smoothed_over_the_same_time_as_a_longer_one() {
    // The same unhurried motion whatever the drop, not a flick because there is less of it to cover.
    let settle = |drop: f64| {
        let mut focus = CameraFocus::new(&at(drop, 0.0));
        let landed = at(0.0, 0.0);
        let frame = 1000.0 / 60.0;
        let mut frames: i32 = 0;
        while focus.advance(&landed, PlayerMotionType::Falling, frame, CAMERA_LEVEL_SMOOTH_MS) > 0.0 {
            frames += 1;
            assert!(frames < 600, "a {drop} block step never settled");
        }
        frames
    };
    let (half, whole) = (settle(0.5), settle(1.0));
    assert!(
        (half - whole).abs() <= 2,
        "half a block took {half} frames and a whole one {whole}",
    );
}

#[test]
fn no_smoothing_shows_the_level_itself() {
    for smooth_ms in [0.0, -30.0, f64::NAN] {
        let mut focus = CameraFocus::new(&at(1.0, 0.0));
        let shown = focus.advance(&at(0.0, 0.0), PlayerMotionType::Falling, 16.0, smooth_ms);
        assert_eq!(shown, 0.0, "{smooth_ms} is no spring, so the player never drifts");
        assert_eq!(focus.level(), focus.aim_level());
    }
}

#[test]
fn a_frame_with_no_time_does_not_advance_the_smoothing() {
    let mut focus = CameraFocus::new(&at(1.0, 0.0));
    let shown = focus.advance(&at(0.0, 0.0), PlayerMotionType::Falling, 0.0, CAMERA_LEVEL_SMOOTH_MS);
    assert_eq!(shown, 0.0, "with no frame to smooth over it shows the level it aims at");
}
