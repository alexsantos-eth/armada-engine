//! Tests for the player's presentation-only body scale.

use super::*;
use iso::assets::SpriteLayout;
use iso::player::PlayerMotionType;
use iso::projection::GridPoint;

/// A drift of nothing, for a body that is not going anywhere.
const ZERO_DRIFT: GridPoint = GridPoint { x: 0.0, y: 0.0 };

fn moment() -> BodyMoment {
    BodyMoment {
        motion: PlayerMotionType::Idle,
        speed: 0.0,
        velocity: ZERO_DRIFT,
        acceleration: ZERO_DRIFT,
        skidding: false,
        walked: 0.0,
        vertical_speed: None,
        climbing: None,
        elapsed_ms: 16.0,
        jumps: 0,
        landings: 0,
        impact: 0.0,
    }
}

#[test]
fn bobs_twice_per_walk_cycle_and_preserves_volume() {
    let mut body = BodyMotion::default();
    let shape = body.advance(BodyMoment {
        motion: PlayerMotionType::Walking,
        speed: 0.15,
        walked: WALK_STRIDE / 8.0,
        ..moment()
    });

    let shape = shape.scale;
    assert!(shape.y > 1.0);
    assert!((shape.x - (1.0 - (shape.y - 1.0) / 2.0)).abs() < 1e-9);
    assert_eq!(
        body.advance(BodyMoment {
            motion: PlayerMotionType::Walking,
            speed: 0.15,
            walked: WALK_STRIDE / 2.0,
            ..moment()
        }),
        BodyPose {
            scale: BodyScale { x: 1.0, y: 1.0 },
            tilt: 0.0,
            turned: 0.0
        },
        "the body is upright between steps"
    );
}

#[test]
fn stretches_in_air_and_halfway_through_a_climb() {
    let mut body = BodyMotion::default();
    let air = body.advance(BodyMoment {
        motion: PlayerMotionType::Jumping,
        vertical_speed: Some(0.34),
        ..moment()
    });
    let climb = body.advance(BodyMoment {
        motion: PlayerMotionType::Climbing,
        climbing: Some(0.5),
        ..moment()
    });

    assert!(air.scale.y > 1.0);
    assert!(climb.scale.y > 1.0);
}

#[test]
fn stretches_at_takeoff_and_squashes_at_landing() {
    let mut body = BodyMotion::default();
    let takeoff = body.advance(BodyMoment {
        jumps: 1,
        ..moment()
    });
    let landing = body.advance(BodyMoment {
        landings: 1,
        impact: 0.34,
        ..moment()
    });

    assert!(takeoff.scale.y > 1.0 && takeoff.scale.x < 1.0);
    assert!(landing.scale.y < 1.0 && landing.scale.x > 1.0);
}

/// A moment on the ground drifting right across the screen at `speed` columns per tick.
fn drifting(speed: f64) -> BodyMoment {
    BodyMoment {
        motion: PlayerMotionType::Walking,
        speed,
        velocity: GridPoint { x: speed, y: 0.0 },
        ..moment()
    }
}

#[test]
fn only_a_sideways_move_leans_the_body() {
    assert!(
        screen_drift(GridPoint { x: 0.15, y: 0.0 }) > 0.0,
        "east leans right"
    );
    assert!(
        screen_drift(GridPoint { x: 0.0, y: 0.15 }) < 0.0,
        "north leans left"
    );
    assert_eq!(
        screen_drift(GridPoint { x: 0.15, y: 0.15 }),
        0.0,
        "straight away from the camera leans nowhere"
    );
}

#[test]
fn the_body_leans_into_where_it_goes_and_never_past_its_limit() {
    let walk = lean_target(GridPoint { x: 0.15, y: 0.0 }, ZERO_DRIFT, false);
    let run = lean_target(GridPoint { x: 0.25, y: 0.0 }, ZERO_DRIFT, false);
    assert!(0.0 < walk && walk < run, "a run leans further than a walk");
    assert!(run <= MAX_LEAN);
    let flat_out = lean_target(
        GridPoint { x: 9.0, y: 0.0 },
        GridPoint { x: 9.0, y: 0.0 },
        false,
    );
    assert_eq!(flat_out, MAX_LEAN, "and nothing leans past the limit");
    let skid = lean_target(GridPoint { x: 0.25, y: 0.0 }, ZERO_DRIFT, true);
    assert!(skid < 0.0, "a skid digs its heels in and leans back");
}

#[test]
fn a_flight_turns_the_whole_body_much_further_than_a_walk_leans() {
    let fly = roll_target(GridPoint { x: 0.15, y: 0.0 }, ZERO_DRIFT);
    let walk = lean_target(GridPoint { x: 0.15, y: 0.0 }, ZERO_DRIFT, false);
    assert!(
        fly > walk * 4.0,
        "flying is a roll, not a lean: {fly} vs {walk}"
    );
    assert!(
        roll_target(GridPoint { x: 9.0, y: 0.0 }, GridPoint { x: 9.0, y: 0.0 }) == MAX_FLY_ROLL
    );
    assert_eq!(
        roll_target(ZERO_DRIFT, ZERO_DRIFT),
        0.0,
        "upright standing still"
    );
}

#[test]
fn the_lean_follows_its_target_with_a_spring_and_settles_exactly_upright() {
    let mut lean = BodyLean::default();
    step_body_lean(&mut lean, 0.1, 16.0, LEAN_SPRING);
    assert!(
        lean.angle > 0.0 && lean.angle < 0.1,
        "it does not snap: {}",
        lean.angle
    );
    for _ in 0..200 {
        step_body_lean(&mut lean, 0.1, 16.0, LEAN_SPRING);
    }
    assert!(
        (lean.angle - 0.1).abs() < 1e-3,
        "it reaches the target: {}",
        lean.angle
    );
    for _ in 0..400 {
        step_body_lean(&mut lean, 0.0, 16.0, LEAN_SPRING);
    }
    assert_eq!(lean.angle, 0.0, "and rests exactly upright");
    assert_eq!(lean.speed, 0.0);
}

#[test]
fn a_long_frame_is_taken_in_short_steps() {
    let mut once = BodyLean::default();
    let mut split = BodyLean::default();
    step_body_lean(&mut once, 0.1, 64.0, LEAN_SPRING);
    for _ in 0..4 {
        step_body_lean(&mut split, 0.1, 16.0, LEAN_SPRING);
    }
    assert!(
        (once.angle - split.angle).abs() < 1e-9,
        "a 64 ms frame is four 16 ms steps: {} vs {}",
        once.angle,
        split.angle
    );
}

#[test]
fn walking_leans_the_body_and_flying_rolls_it_instead() {
    let mut body = BodyMotion::default();
    let mut walked = body.advance(drifting(0.15));
    for _ in 0..40 {
        walked = body.advance(drifting(0.15));
    }
    assert!(walked.tilt > 0.0, "it leans east: {}", walked.tilt);
    assert_eq!(walked.turned, 0.0, "and does not roll on the ground");

    let mut body = BodyMotion::default();
    let mut flown = body.advance(BodyMoment {
        motion: PlayerMotionType::Flying,
        ..drifting(0.15)
    });
    for _ in 0..40 {
        flown = body.advance(BodyMoment {
            motion: PlayerMotionType::Flying,
            ..drifting(0.15)
        });
    }
    assert!(
        flown.turned > walked.tilt,
        "flying turns further than walking leans"
    );
    assert!(
        flown.tilt.abs() < 1e-3,
        "and the lean lets go while it flies"
    );
}

#[test]
fn the_quad_keeps_the_feet_where_they_stand() {
    let layout = SpriteLayout {
        x: 100.0,
        y: 100.0,
        width: 40.0,
        height: 80.0,
    };
    let feet = (120.0, 180.0);
    let upright = body_quad(layout, feet, 0.0, 0.0, 160.0);
    assert_eq!(
        upright[3],
        (100.0, 180.0),
        "upright it is the rectangle itself"
    );
    assert_eq!(upright[2], (140.0, 180.0));

    let leant = body_quad(layout, feet, 0.2, 0.0, 160.0);
    assert_eq!(
        leant[3], upright[3],
        "a lean keeps the bottom edge where it is"
    );
    assert_eq!(leant[2], upright[2]);
    assert!(
        leant[0].0 > upright[0].0,
        "and carries the head to the right"
    );

    let rolled = body_quad(layout, feet, 0.0, 0.3, 160.0);
    assert!(rolled[0].0 > upright[0].0, "a roll carries the head right");
    assert!(
        rolled[3].0 < upright[3].0,
        "and the feet the other way, about the body"
    );
}
