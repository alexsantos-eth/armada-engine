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
