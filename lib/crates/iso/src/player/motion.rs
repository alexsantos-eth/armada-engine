//! Player locomotion motion-state transitions, portable and dependency-free.

/// A player's motion state on the ground or in the air.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PlayerMotionType {
    #[default]
    Idle,
    Walking,
    Running,
    Skidding,
    Jumping,
    Falling,
    Flying,
    Climbing,
}

/// Events produced by the deterministic player step and consumed by the motion machine.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlayerMotionEvent {
    Walk,
    Run,
    Skid,
    Stop,
    Jump,
    Fall,
    Fly,
    LandIdle,
    LandWalking,
    LandRunning,
    LandSkidding,
    Climb,
    ClimbTick,
    ClimbDoneIdle,
    ClimbDoneWalking,
}

/// Transitions out of every ground state: idle, walking, running and skidding.
const GROUND: &[(PlayerMotionEvent, PlayerMotionType)] = &[
    (PlayerMotionEvent::Walk, PlayerMotionType::Walking),
    (PlayerMotionEvent::Run, PlayerMotionType::Running),
    (PlayerMotionEvent::Skid, PlayerMotionType::Skidding),
    (PlayerMotionEvent::Stop, PlayerMotionType::Idle),
    (PlayerMotionEvent::Jump, PlayerMotionType::Jumping),
    (PlayerMotionEvent::Fall, PlayerMotionType::Falling),
    (PlayerMotionEvent::Climb, PlayerMotionType::Climbing),
];

/// Transitions out of the air: jumping, falling or flying.
const AIR: &[(PlayerMotionEvent, PlayerMotionType)] = &[
    (PlayerMotionEvent::Fall, PlayerMotionType::Falling),
    (PlayerMotionEvent::Fly, PlayerMotionType::Flying),
    (PlayerMotionEvent::LandIdle, PlayerMotionType::Idle),
    (PlayerMotionEvent::LandWalking, PlayerMotionType::Walking),
    (PlayerMotionEvent::LandRunning, PlayerMotionType::Running),
    (PlayerMotionEvent::LandSkidding, PlayerMotionType::Skidding),
    (PlayerMotionEvent::Climb, PlayerMotionType::Climbing),
];

/// A jump press while already airborne keeps the player jumping or flying.
const AIR_JUMP: &[(PlayerMotionEvent, PlayerMotionType)] =
    &[(PlayerMotionEvent::Jump, PlayerMotionType::Jumping)];

/// Transitions out of climbing.
const CLIMBING: &[(PlayerMotionEvent, PlayerMotionType)] = &[
    (PlayerMotionEvent::ClimbTick, PlayerMotionType::Climbing),
    (PlayerMotionEvent::ClimbDoneIdle, PlayerMotionType::Idle),
    (
        PlayerMotionEvent::ClimbDoneWalking,
        PlayerMotionType::Walking,
    ),
];

/// Finds the next state for `event` in `transitions`, or `None` when the event is not handled.
fn next_state(
    transitions: &[(PlayerMotionEvent, PlayerMotionType)],
    event: PlayerMotionEvent,
) -> Option<PlayerMotionType> {
    transitions
        .iter()
        .find_map(|(kind, next)| (*kind == event).then_some(*next))
}

/// Applies one event to `state` and returns the resulting motion state.
pub fn transition_player_motion(
    state: PlayerMotionType,
    event: PlayerMotionEvent,
) -> PlayerMotionType {
    match state {
        PlayerMotionType::Idle
        | PlayerMotionType::Walking
        | PlayerMotionType::Running
        | PlayerMotionType::Skidding => next_state(GROUND, event).unwrap_or(state),
        PlayerMotionType::Jumping | PlayerMotionType::Flying => next_state(AIR_JUMP, event)
            .or_else(|| next_state(AIR, event))
            .unwrap_or(state),
        PlayerMotionType::Falling => next_state(AIR, event).unwrap_or(state),
        PlayerMotionType::Climbing => next_state(CLIMBING, event).unwrap_or(state),
    }
}

#[cfg(test)]
#[path = "motion.test.rs"]
mod tests;
