//! Tests for the player's animation bookkeeping.

use super::*;

const SHEETS: PlayerSheets = PlayerSheets {
    walk_poses: Some(8),
    idle_poses: Some(8),
    climb_poses: Some(9),
    jump_poses: Some([0, 1, 2, 3, 4]),
    swim_poses: Some(10),
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
#[test]
fn advances_the_walk_cycle_with_the_distance_covered() {
    let mut animation = PlayerAnimation::default();
    let walking = PlayerMoment {
        motion: PlayerMotionType::Walking,
        direction: GridPoint { x: 1.0, y: -1.0 },
        moved: WALK_STRIDE / 8.0,
        ..moment()
    };
    animation.advance(
        PlayerMoment {
            elapsed_ms: 1_000.0,
            moved: 0.0,
            ..walking
        },
        SHEETS,
    );
    let mut poses = Vec::new();
    for _ in 0..8 {
        let pose = animation.advance(walking, SHEETS);
        assert_eq!(pose.sheet, PlayerSheet::Walk);
        assert_eq!(pose.facing, 0, "east");
        poses.push(pose.pose);
    }
    assert_eq!(poses, vec![2, 3, 4, 5, 6, 7, 8, 1], "one full cycle");
    assert_eq!(
        animation.advance(walking, SHEETS).pose,
        2,
        "and round again"
    );
}

/// Standing still holds the first idle pose for the delay, then dances through the cycle.
#[test]
fn starts_the_idle_cycle_after_the_delay() {
    let mut animation = PlayerAnimation::default();
    let still = PlayerMoment {
        elapsed_ms: IDLE_DELAY_MS,
        ..moment()
    };
    let first = animation.advance(still, SHEETS);
    assert_eq!(first.sheet, PlayerSheet::Idle);
    assert_eq!(first.pose, 0);
    assert_eq!(first.facing, START_FACING, "it keeps facing the camera");
    let mut animation = PlayerAnimation::default();
    animation.advance(
        PlayerMoment {
            elapsed_ms: IDLE_DELAY_MS + IDLE_PERIOD_MS / 2.0,
            ..moment()
        },
        SHEETS,
    );
    assert_eq!(
        animation
            .advance(
                PlayerMoment {
                    elapsed_ms: 0.0,
                    ..moment()
                },
                SHEETS
            )
            .pose,
        4,
        "half way through the cycle"
    );
}

/// Walking resets the idle cycle, so the dance always starts from its first pose.
#[test]
fn walking_resets_the_idle_cycle() {
    let mut animation = PlayerAnimation::default();
    animation.advance(
        PlayerMoment {
            elapsed_ms: 10_000.0,
            ..moment()
        },
        SHEETS,
    );
    animation.advance(
        PlayerMoment {
            motion: PlayerMotionType::Walking,
            direction: GridPoint { x: 1.0, y: 1.0 },
            moved: 0.5,
            elapsed_ms: 1_000.0,
            ..moment()
        },
        SHEETS,
    );
    let pose = animation.advance(
        PlayerMoment {
            elapsed_ms: IDLE_DELAY_MS,
            ..moment()
        },
        SHEETS,
    );
    assert_eq!((pose.sheet, pose.pose), (PlayerSheet::Idle, 0));
    assert_eq!(pose.facing, 4, "north, the way it last walked");
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
    animation.advance(
        PlayerMoment {
            elapsed_ms: 1_000.0,
            ..climbing(0.0)
        },
        SHEETS,
    );
    assert_eq!(
        animation.advance(climbing(0.0), SHEETS),
        PlayerPose {
            sheet: PlayerSheet::Climb,
            pose: 0,
            facing: 10,
        }
    );
    assert_eq!(animation.advance(climbing(0.5), SHEETS).pose, 4);
    assert_eq!(
        animation.advance(climbing(1.0), SHEETS).pose,
        8,
        "the last pose, not past it"
    );
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
            PlayerMoment {
                motion: PlayerMotionType::Jumping,
                jump_phase: phase,
                ..moment()
            },
            SHEETS,
        );
        assert_eq!((frame.sheet, frame.pose), (PlayerSheet::Jump, pose));
    }
    let standing = animation.advance(moment(), SHEETS);
    assert_eq!(standing.sheet, PlayerSheet::Idle);
}

/// Without a jump sheet, an airborne player takes the leaping pose of the walk sheet.
#[test]
fn falls_back_to_the_walk_sheet_in_the_air() {
    let sheets = PlayerSheets {
        jump_poses: None,
        idle_poses: None,
        ..SHEETS
    };
    let mut animation = PlayerAnimation::default();
    let frame = animation.advance(
        PlayerMoment {
            motion: PlayerMotionType::Falling,
            jump_phase: PlayerJumpPhase::Fall,
            ..moment()
        },
        sheets,
    );
    assert_eq!(
        (frame.sheet, frame.pose),
        (PlayerSheet::Walk, AIR_POSE as usize)
    );
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
    assert_eq!(
        forwards
            .advance(skid(GridPoint { x: 1.0, y: -1.0 }), SHEETS)
            .pose,
        3
    );
    let mut backwards = PlayerAnimation::default();
    assert_eq!(
        backwards
            .advance(skid(GridPoint { x: 0.0, y: 0.0 }), SHEETS)
            .pose,
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
            elapsed_ms: 1_000.0,
            ..moment()
        },
        SHEETS,
    );
    assert_eq!(animation.facing_name(), "north-east");
}

/// The jump sheet's columns are found by name, so a sheet drawn in another order still shows
#[test]
fn reads_the_jump_columns_by_name() {
    let named: Vec<String> = ["apex", "takeoff", "landing", "rise", "fall"]
        .iter()
        .map(|pose| (*pose).to_owned())
        .collect();
    assert_eq!(jump_poses(&named, 5), Some([1, 3, 0, 4, 2]));
    assert_eq!(
        jump_poses(&[], 5),
        Some([0, 1, 2, 3, 4]),
        "the declared order"
    );
    assert_eq!(
        jump_poses(&[], 4),
        None,
        "a sheet too short to hold the phases"
    );
    assert_eq!(
        jump_poses(&["takeoff".to_owned()], 1),
        None,
        "named, but the rest fall outside the sheet"
    );
}

/// Turning goes through the facings between, one every `TURN_MS_PER_FACING`, which is what the
#[test]
fn turns_through_the_facings_between() {
    let mut animation = PlayerAnimation::default();
    let east = PlayerMoment {
        motion: PlayerMotionType::Walking,
        direction: GridPoint { x: 1.0, y: -1.0 },
        moved: 0.0,
        elapsed_ms: TURN_MS_PER_FACING,
        ..moment()
    };
    let mut facings = Vec::new();
    for _ in 0..5 {
        facings.push(animation.advance(east, SHEETS).facing);
    }
    assert_eq!(
        facings,
        vec![13, 14, 15, 0, 0],
        "south-south-east, south-east, east-south-east"
    );
}

/// It turns the shorter way round, and the time it takes does not depend on the frame rate.
#[test]
fn turns_the_short_way_at_a_steady_rate() {
    let west = |elapsed_ms: f64| PlayerMoment {
        motion: PlayerMotionType::Walking,
        direction: GridPoint { x: -1.0, y: 1.0 },
        elapsed_ms,
        ..moment()
    };
    let mut animation = PlayerAnimation::default();
    assert_eq!(
        animation.advance(west(TURN_MS_PER_FACING), SHEETS).facing,
        11
    );
    let mut quick = PlayerAnimation::default();
    assert_eq!(
        quick
            .advance(west(TURN_MS_PER_FACING * 10.0), SHEETS)
            .facing,
        8
    );
    let mut slow = PlayerAnimation::default();
    for _ in 0..2 {
        assert_eq!(
            slow.advance(west(TURN_MS_PER_FACING / 3.0), SHEETS).facing,
            12
        );
    }
    assert_eq!(
        slow.advance(west(TURN_MS_PER_FACING / 3.0), SHEETS).facing,
        11
    );
}

/// In the water the swim sheet is drawn from: treading water when it drifts, the crawl's cycle
/// as it swims along, and the dive while its head is under.
#[test]
fn draws_the_swim_sheet_while_the_player_is_in_the_water() {
    let mut animation = PlayerAnimation::default();
    let floating = PlayerMoment {
        motion: PlayerMotionType::Swimming,
        ..moment()
    };
    let pose = animation.advance(floating, SHEETS);
    assert_eq!(pose.sheet, PlayerSheet::Swim);
    assert_eq!(pose.pose, 0, "it treads water while it drifts");

    let swimming = PlayerMoment {
        motion: PlayerMotionType::Swimming,
        direction: GridPoint { x: 1.0, y: -1.0 },
        moved: SWIM_STRIDE / 8.0,
        ..moment()
    };
    let mut poses = vec![];
    for _ in 0..4 {
        poses.push(animation.advance(swimming, SHEETS).pose);
    }
    assert_eq!(
        poses,
        vec![2, 3, 4, 5],
        "the crawl follows the distance swum"
    );

    let under = PlayerMoment {
        motion: PlayerMotionType::Sinking,
        ..swimming
    };
    assert_eq!(
        animation.advance(under, SHEETS).pose,
        9,
        "under the surface it is drawn diving"
    );
}

/// Leaving the water starts the next swim's cycle from the beginning.
#[test]
fn forgets_the_crawl_once_the_player_is_out_of_the_water() {
    let mut animation = PlayerAnimation::default();
    let swimming = PlayerMoment {
        motion: PlayerMotionType::Swimming,
        direction: GridPoint { x: 1.0, y: -1.0 },
        moved: SWIM_STRIDE / 2.0,
        ..moment()
    };
    animation.advance(swimming, SHEETS);
    assert!(animation.swum > 0.0);
    animation.advance(
        PlayerMoment {
            motion: PlayerMotionType::Walking,
            ..swimming
        },
        SHEETS,
    );
    assert_eq!(animation.swum, 0.0);
}

/// A swimmer never stands still long enough for the dance: the idle sheet stays out of the water.
#[test]
fn a_swimmer_never_falls_into_the_idle_dance() {
    let mut animation = PlayerAnimation::default();
    for _ in 0..200 {
        let pose = animation.advance(
            PlayerMoment {
                motion: PlayerMotionType::Swimming,
                elapsed_ms: 100.0,
                ..moment()
            },
            SHEETS,
        );
        assert_eq!(pose.sheet, PlayerSheet::Swim);
    }
}

/// Without a swim sheet in the atlas the walk sheet still carries the swimmer.
#[test]
fn falls_back_to_the_walk_sheet_when_there_is_no_swim_sheet() {
    let mut animation = PlayerAnimation::default();
    let pose = animation.advance(
        PlayerMoment {
            motion: PlayerMotionType::Swimming,
            ..moment()
        },
        PlayerSheets {
            swim_poses: None,
            ..SHEETS
        },
    );
    assert_eq!(pose.sheet, PlayerSheet::Walk);
}
