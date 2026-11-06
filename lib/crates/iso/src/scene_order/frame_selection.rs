//! Selects a player's sheet and column from presentation state, without textures.

use super::{climb_pose, idle_pose, walk_pose};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlayerSheet {
    Walk,
    Climb,
    Jump,
    Idle,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlayerFrame {
    pub sheet: PlayerSheet,
    pub pose: i32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlayerFrameInput {
    pub walk_frames: i32,
    pub walk_stride: f64,
    pub climb_frames: Option<i32>,
    pub idle: Option<(i32, f64)>,
    pub jump_pose: Option<i32>,
    pub climbing: Option<f64>,
    pub walking: bool,
    pub flying: bool,
    pub walked: f64,
    pub stood_ms: f64,
    pub air_pose: Option<i32>,
}

/// Chooses sheet and column with climb, jump, idle, then walk priority.
pub fn select_player_frame(input: PlayerFrameInput) -> PlayerFrame {
    if let Some(progress) = input.climbing {
        return input
            .climb_frames
            .map(|frames| PlayerFrame {
                sheet: PlayerSheet::Climb,
                pose: climb_pose(progress, frames),
            })
            .unwrap_or(PlayerFrame {
                sheet: PlayerSheet::Walk,
                pose: 0,
            });
    }
    if let Some(pose) = input.jump_pose {
        return PlayerFrame {
            sheet: PlayerSheet::Jump,
            pose,
        };
    }
    if let Some((frames, period)) = input.idle.filter(|_| !input.walking && !input.flying) {
        return PlayerFrame {
            sheet: PlayerSheet::Idle,
            pose: idle_pose(input.stood_ms, frames, period),
        };
    }
    PlayerFrame {
        sheet: PlayerSheet::Walk,
        pose: if input.flying {
            input.air_pose.unwrap_or(0)
        } else if input.walking {
            walk_pose(input.walked, input.walk_frames, input.walk_stride)
        } else {
            0
        },
    }
}

#[cfg(test)]
#[path = "frame_selection.test.rs"]
mod tests;
