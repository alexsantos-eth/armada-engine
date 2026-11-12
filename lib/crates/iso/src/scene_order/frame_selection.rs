//! Selects a player's sheet and column from presentation state, without textures.

use super::{
    SWIM_FLOAT_POSE, climb_pose, flip_pose, idle_pose, swim_dive_pose, swim_pose, walk_pose,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlayerSheet {
    Walk,
    Climb,
    Jump,
    Idle,
    Swim,
    Flip,
}

/// What the flip sheet is drawn from while the player turns a somersault in the air.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FlipInput {
    /// Columns the sheet holds: the equal steps of one whole turn.
    pub columns: i32,
    /// How much of the turn is made, from `0.0` to `1.0`.
    pub turned: f64,
}

/// What the swim sheet is drawn from while the player is in the water.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwimInput {
    /// Columns the sheet holds: treading water, the crawl's cycle, and diving.
    pub columns: i32,
    /// Whether the head is under the surface, which is drawn diving.
    pub under: bool,
    /// Whether the swimmer is moving along, which is what strokes the crawl.
    pub moving: bool,
    /// Columns swum, for the crawl's cycle.
    pub swum: f64,
    /// Columns of one cycle of the crawl.
    pub stride: f64,
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
    /// The swim, when the player is in the water and there is a sheet for it.
    pub swim: Option<SwimInput>,
    /// The somersault in the air, when one is being turned and there is a sheet for it.
    pub flip: Option<FlipInput>,
}

/// Chooses sheet and column with swim, climb, flip, jump, idle, then walk priority.
pub fn select_player_frame(input: PlayerFrameInput) -> PlayerFrame {
    if let Some(swim) = input.swim {
        let pose = if swim.under {
            swim_dive_pose(swim.columns)
        } else if swim.moving {
            swim_pose(swim.swum, swim.columns, swim.stride)
        } else {
            SWIM_FLOAT_POSE
        };
        return PlayerFrame {
            sheet: PlayerSheet::Swim,
            pose,
        };
    }
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
    if let Some(flip) = input.flip {
        return PlayerFrame {
            sheet: PlayerSheet::Flip,
            pose: flip_pose(flip.turned, flip.columns),
        };
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
