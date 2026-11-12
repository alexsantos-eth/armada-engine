//! Tests for `transition_player_motion`, against the `motion` section of the contract fixture.

use super::*;

#[test]
fn ground_transitions_match_contract_fixture() {
    assert_eq!(
        transition_player_motion(PlayerMotionType::Idle, PlayerMotionEvent::Run),
        PlayerMotionType::Running
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Running, PlayerMotionEvent::Skid),
        PlayerMotionType::Skidding
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Skidding, PlayerMotionEvent::Jump),
        PlayerMotionType::Jumping
    );
}

#[test]
fn air_transitions_match_contract_fixture() {
    assert_eq!(
        transition_player_motion(PlayerMotionType::Jumping, PlayerMotionEvent::Fly),
        PlayerMotionType::Flying
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Flying, PlayerMotionEvent::LandIdle),
        PlayerMotionType::Idle
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Idle, PlayerMotionEvent::Fly),
        PlayerMotionType::Idle
    );
}

#[test]
fn climb_transitions() {
    assert_eq!(
        transition_player_motion(PlayerMotionType::Climbing, PlayerMotionEvent::ClimbTick),
        PlayerMotionType::Climbing
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Climbing, PlayerMotionEvent::ClimbDoneIdle),
        PlayerMotionType::Idle
    );
    assert_eq!(
        transition_player_motion(
            PlayerMotionType::Climbing,
            PlayerMotionEvent::ClimbDoneWalking
        ),
        PlayerMotionType::Walking
    );
}

#[test]
fn airborne_landing_and_rejump() {
    assert_eq!(
        transition_player_motion(PlayerMotionType::Falling, PlayerMotionEvent::LandRunning),
        PlayerMotionType::Running
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Flying, PlayerMotionEvent::Jump),
        PlayerMotionType::Jumping
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Jumping, PlayerMotionEvent::Fall),
        PlayerMotionType::Falling
    );
}

#[test]
fn walk_and_stop() {
    assert_eq!(
        transition_player_motion(PlayerMotionType::Idle, PlayerMotionEvent::Walk),
        PlayerMotionType::Walking
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Walking, PlayerMotionEvent::Stop),
        PlayerMotionType::Idle
    );
}

#[test]
fn going_into_the_water_from_the_ground_or_the_air_starts_a_swim() {
    for state in [
        PlayerMotionType::Idle,
        PlayerMotionType::Walking,
        PlayerMotionType::Running,
        PlayerMotionType::Skidding,
        PlayerMotionType::Jumping,
        PlayerMotionType::Falling,
        PlayerMotionType::Flying,
        PlayerMotionType::Climbing,
    ] {
        assert_eq!(
            transition_player_motion(state, PlayerMotionEvent::Sink),
            PlayerMotionType::Sinking,
            "{state:?} going under"
        );
        assert_eq!(
            transition_player_motion(state, PlayerMotionEvent::Swim),
            PlayerMotionType::Swimming,
            "{state:?} at the surface"
        );
    }
}

#[test]
fn a_swimmer_surfaces_and_goes_under_again() {
    assert_eq!(
        transition_player_motion(PlayerMotionType::Sinking, PlayerMotionEvent::Swim),
        PlayerMotionType::Swimming
    );
    assert_eq!(
        transition_player_motion(PlayerMotionType::Swimming, PlayerMotionEvent::Sink),
        PlayerMotionType::Sinking
    );
}

#[test]
fn leaving_the_water_hands_the_swimmer_back_to_the_land() {
    for (event, expected) in [
        (PlayerMotionEvent::Stop, PlayerMotionType::Idle),
        (PlayerMotionEvent::Walk, PlayerMotionType::Walking),
        (PlayerMotionEvent::Run, PlayerMotionType::Running),
        (PlayerMotionEvent::Skid, PlayerMotionType::Skidding),
        (PlayerMotionEvent::Climb, PlayerMotionType::Climbing),
        (PlayerMotionEvent::Fall, PlayerMotionType::Falling),
        (PlayerMotionEvent::Jump, PlayerMotionType::Jumping),
        (PlayerMotionEvent::LandIdle, PlayerMotionType::Idle),
        (PlayerMotionEvent::LandWalking, PlayerMotionType::Walking),
        (PlayerMotionEvent::LandRunning, PlayerMotionType::Running),
        (PlayerMotionEvent::LandSkidding, PlayerMotionType::Skidding),
    ] {
        assert_eq!(
            transition_player_motion(PlayerMotionType::Swimming, event),
            expected,
            "{event:?} out of the water"
        );
    }
}
