//! Tests for the player's animation bookkeeping.

use super::*;

const SHEETS: PlayerSheets = PlayerSheets {
    walk_poses: Some(8),
    idle_poses: Some(8),
    climb_poses: Some(9),
    jump_poses: Some([0, 1, 2, 3, 4]),
};

fn moment() -> PlayerMoment {
    PlayerMoment {
        climbing: None,
        motion: PlayerMotionType::Idle,
        direction: GridPoint { x: 0.0, y: 0.0 },
        moved: 0.0,
        jump_phase: PlayerJumpPhase::Ground,
        elapsed_ms: 16.0,
    }
}

/// Walking east: one step of the stride is one pose further through the cycle, and column zero
/// is the standing pose, so a walk pose is never zero.
#[test]
fn advances_the_walk_cycle_with_the_distance_covered() {
    let mut animation = PlayerAnimation::default();
    let walking = PlayerMoment {
        motion: PlayerMotionType::Walking,
        direction: GridPoint { x: 1.0, y: -1.0 },
        moved: WALK_STRIDE / 8.0,
        ..moment()
    };
    let mut poses = Vec::new();
    for _ in 0..8 {
        let pose = animation.advance(walking, SHEETS);
        assert_eq!(pose.sheet, PlayerSheet::Walk);
        assert_eq!(pose.facing, 0, "east");
        poses.push(pose.pose);
    }
    // The first frame has already covered an eighth of the stride, so the cycle starts on its
    // second pose and comes back round to the first; column zero, standing, is never used.
    assert_eq!(poses, vec![2, 3, 4, 5, 6, 7, 8, 1], "one full cycle");
    assert_eq!(animation.advance(walking, SHEETS).pose, 2, "and round again");
}

/// Standing still holds the first idle pose for the delay, then dances through the cycle.
#[test]
fn starts_the_idle_cycle_after_the_delay() {
    let mut animation = PlayerAnimation::default();
    let still = PlayerMoment { elapsed_ms: IDLE_DELAY_MS, ..moment() };
    let first = animation.advance(still, SHEETS);
    assert_eq!(first.sheet, PlayerSheet::Idle);
    assert_eq!(first.pose, 0);
    assert_eq!(first.facing, START_FACING, "it keeps facing the camera");
    let mut animation = PlayerAnimation::default();
    animation.advance(
        PlayerMoment { elapsed_ms: IDLE_DELAY_MS + IDLE_PERIOD_MS / 2.0, ..moment() },
        SHEETS,
    );
    assert_eq!(
        animation.advance(PlayerMoment { elapsed_ms: 0.0, ..moment() }, SHEETS).pose,
        4,
        "half way through the cycle"
    );
}

/// Walking resets the idle cycle, so the dance always starts from its first pose.
#[test]
fn walking_resets_the_idle_cycle() {
    let mut animation = PlayerAnimation::default();
    animation.advance(PlayerMoment { elapsed_ms: 10_000.0, ..moment() }, SHEETS);
    animation.advance(
        PlayerMoment {
            motion: PlayerMotionType::Walking,
            direction: GridPoint { x: 1.0, y: 1.0 },
            moved: 0.5,
            ..moment()
        },
        SHEETS,
    );
    let pose = animation.advance(PlayerMoment { elapsed_ms: IDLE_DELAY_MS, ..moment() }, SHEETS);
    assert_eq!((pose.sheet, pose.pose), (PlayerSheet::Idle, 0));
    assert_eq!(pose.facing, 2, "north, the way it last walked");
}

/// A climb takes priority over everything and runs through its own sheet once.
#[test]
fn runs_the_climb_sheet_over_the_climb() {
    let mut animation = PlayerAnimation::default();
    let climbing = |progress: f64| PlayerMoment {
        climbing: Some(progress),
        motion: PlayerMotionType::Climbing,
        direction: GridPoint { x: -1.0, y: 0.0 },
        jump_phase: PlayerJumpPhase::Rise,
        ..moment()
    };
    assert_eq!(animation.advance(climbing(0.0), SHEETS), PlayerPose {
        sheet: PlayerSheet::Climb,
        pose: 0,
        facing: 5,
    });
    assert_eq!(animation.advance(climbing(0.5), SHEETS).pose, 4);
    assert_eq!(animation.advance(climbing(1.0), SHEETS).pose, 8, "the last pose, not past it");
}

/// In the air the jump sheet shows the phase the physics is in.
#[test]
fn shows_the_phase_of_a_jump() {
    let mut animation = PlayerAnimation::default();
    for (phase, pose) in [
        (PlayerJumpPhase::Takeoff, 0),
        (PlayerJumpPhase::Rise, 1),
        (PlayerJumpPhase::Apex, 2),
        (PlayerJumpPhase::Fall, 3),
        (PlayerJumpPhase::Landing, 4),
    ] {
        let frame = animation.advance(
            PlayerMoment { motion: PlayerMotionType::Jumping, jump_phase: phase, ..moment() },
            SHEETS,
        );
        assert_eq!((frame.sheet, frame.pose), (PlayerSheet::Jump, pose));
    }
    // On the ground the jump sheet is not used at all.
    let standing = animation.advance(moment(), SHEETS);
    assert_eq!(standing.sheet, PlayerSheet::Idle);
}

/// Without a jump sheet, an airborne player takes the leaping pose of the walk sheet.
#[test]
fn falls_back_to_the_walk_sheet_in_the_air() {
    let sheets = PlayerSheets { jump_poses: None, idle_poses: None, ..SHEETS };
    let mut animation = PlayerAnimation::default();
    let frame = animation.advance(
        PlayerMoment {
            motion: PlayerMotionType::Falling,
            jump_phase: PlayerJumpPhase::Fall,
            ..moment()
        },
        sheets,
    );
    assert_eq!((frame.sheet, frame.pose), (PlayerSheet::Walk, AIR_POSE as usize));
    // And with no idle sheet either, standing still is the walk sheet's own standing column.
    let standing = animation.advance(moment(), sheets);
    assert_eq!((standing.sheet, standing.pose), (PlayerSheet::Walk, 0));
}

/// A skid pedals twice as fast as a walk, and backwards once the controls are let go.
#[test]
fn pedals_against_a_skid() {
    let skid = |direction: GridPoint| PlayerMoment {
        motion: PlayerMotionType::Skidding,
        direction,
        moved: WALK_STRIDE / 8.0,
        ..moment()
    };
    let mut forwards = PlayerAnimation::default();
    assert_eq!(forwards.advance(skid(GridPoint { x: 1.0, y: -1.0 }), SHEETS).pose, 3);
    let mut backwards = PlayerAnimation::default();
    assert_eq!(
        backwards.advance(skid(GridPoint { x: 0.0, y: 0.0 }), SHEETS).pose,
        7,
        "the cycle runs backwards from its end"
    );
}

#[test]
fn names_the_facing_it_turned_to() {
    let mut animation = PlayerAnimation::default();
    assert_eq!(animation.facing_name(), "south");
    animation.advance(
        PlayerMoment {
            motion: PlayerMotionType::Walking,
            direction: GridPoint { x: 1.0, y: 0.0 },
            moved: 0.1,
            ..moment()
        },
        SHEETS,
    );
    assert_eq!(animation.facing_name(), "north-east");
}

/// The jump sheet's columns are found by name, so a sheet drawn in another order still shows
/// the right phase; one that names nothing keeps the declared order.
#[test]
fn reads_the_jump_columns_by_name() {
    let named: Vec<String> = ["apex", "takeoff", "landing", "rise", "fall"]
        .iter()
        .map(|pose| (*pose).to_owned())
        .collect();
    assert_eq!(jump_poses(&named, 5), Some([1, 3, 0, 4, 2]));
    assert_eq!(jump_poses(&[], 5), Some([0, 1, 2, 3, 4]), "the declared order");
    assert_eq!(jump_poses(&[], 4), None, "a sheet too short to hold the phases");
    assert_eq!(
        jump_poses(&["takeoff".to_owned()], 1),
        None,
        "named, but the rest fall outside the sheet"
    );
}
