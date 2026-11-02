use super::*;

fn input() -> PlayerFrameInput {
    PlayerFrameInput {
        walk_frames: 4,
        walk_stride: 2.0,
        climb_frames: Some(4),
        idle: Some((4, 2000.0)),
        jump_pose: Some(2),
        climbing: None,
        walking: false,
        flying: false,
        walked: 0.0,
        stood_ms: 500.0,
        air_pose: Some(3),
    }
}

#[test]
fn prioritizes_climb_then_jump_then_idle() {
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            climbing: Some(0.5),
            walking: true,
            flying: true,
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Climb,
            pose: 2
        }
    );
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            walking: true,
            flying: true,
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Jump,
            pose: 2
        }
    );
    assert_eq!(
        select_player_frame(input()),
        PlayerFrame {
            sheet: PlayerSheet::Jump,
            pose: 2
        }
    );
}

#[test]
fn falls_back_to_idle_or_walk_when_special_sheets_are_missing() {
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            jump_pose: None,
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Idle,
            pose: 1
        }
    );
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            climb_frames: None,
            climbing: Some(0.5),
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Walk,
            pose: 0
        }
    );
}
