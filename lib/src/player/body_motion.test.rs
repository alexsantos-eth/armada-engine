//! Tests for the player's presentation-only body scale.

use super::*;
use iso::player::PlayerMotionType;

fn moment() -> BodyMoment {
    BodyMoment {
        motion: PlayerMotionType::Idle,
        speed: 0.0,
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

    assert!(shape.y > 1.0);
    assert!((shape.x - (1.0 - (shape.y - 1.0) / 2.0)).abs() < 1e-9);
    assert_eq!(
        body.advance(BodyMoment {
            motion: PlayerMotionType::Walking,
            speed: 0.15,
            walked: WALK_STRIDE / 2.0,
            ..moment()
        }),
        BodyScale { x: 1.0, y: 1.0 },
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

    assert!(air.y > 1.0);
    assert!(climb.y > 1.0);
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

    assert!(takeoff.y > 1.0 && takeoff.x < 1.0);
    assert!(landing.y < 1.0 && landing.x > 1.0);
}
