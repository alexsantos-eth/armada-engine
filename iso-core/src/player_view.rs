//! Which pose of which sheet the player is drawn with, and which way it faces.
//!
//! The pose itself is chosen by the domain (`armada_core::scene_order::select_player_frame`),
//! which knows the priority between climbing, jumping, standing and walking but nothing about
//! time or distance. This keeps the two things it needs from one frame to the next — the
//! columns walked since the player last stood still, which drives the walk cycle, and the real
//! milliseconds it has stood still, which drives the idle one — and turns the answer into a
//! row and a column of a sheet.
//!
//! It is the same bookkeeping the TypeScript client does in `player-view.ts`, kept apart from
//! the drawing so it can be tested without a window: the walk cycle advances with the distance
//! covered rather than with time, so it does not slide when the frame rate changes and a
//! running player's feet turn over faster on their own.

use armada_core::player::{
    PLAYER_FACINGS, PlayerJumpPhase, PlayerMotionType, get_player_facing,
};
use armada_core::projection::GridPoint;
use armada_core::scene_order::{PlayerFrame, PlayerFrameInput, PlayerSheet, select_player_frame};

/// Columns walked per cycle of the walk sheet, from the TypeScript content (`PLAYER_WALK`):
/// at the walking speed of three columns a second that is about four steps a second.
pub const WALK_STRIDE: f64 = 1.4;

/// Real milliseconds one cycle of the idle sheet lasts: two beats of the monkey's dance.
pub const IDLE_PERIOD_MS: f64 = 900.0;

/// Milliseconds the player stands still before its idle cycle starts, so that stopping for an
/// instant between two steps does not make it dance.
pub const IDLE_DELAY_MS: f64 = 300.0;

/// The walk pose used in the air when there is no jump sheet: the legs furthest apart, a leap.
pub const AIR_POSE: i32 = 3;

/// How fast the feet pedal while the player skids: twice walking pace, and backwards when it
/// has let go of the controls and is only sliding.
pub const SKID_PEDAL: f64 = 2.0;

/// The facing the player starts with, before it has walked anywhere: towards the camera.
pub const START_FACING: usize = 6;

/// What one frame does to the animation: where the player is going, what it is doing, and how
/// far it moved since the frame before.
#[derive(Clone, Copy, Debug)]
pub struct PlayerMoment {
    /// How far into a climb the player is, or `None` if it is not climbing.
    pub climbing: Option<f64>,
    pub motion: PlayerMotionType,
    /// The way the player is heading: where it climbs to, or the direction it is walking in.
    /// `(0, 0)` while it stands still, which leaves it facing the way it already did.
    pub direction: GridPoint,
    /// Columns covered since the frame before, for the walk cycle.
    pub moved: f64,
    pub jump_phase: PlayerJumpPhase,
    /// Milliseconds of real time since the frame before, for the idle cycle.
    pub elapsed_ms: f64,
}

/// How many poses each of the player's sheets holds, read from the manifest once.
///
/// The walk sheet's first column is the standing pose, so it holds one more column than it has
/// walk poses; the others are all cycles or sequences. A sheet the atlas does not have is
/// `None`, and the player falls back to standing or to the generic airborne pose.
#[derive(Clone, Copy, Debug, Default)]
pub struct PlayerSheets {
    pub walk_poses: Option<i32>,
    pub idle_poses: Option<i32>,
    pub climb_poses: Option<i32>,
    /// The column of each jump phase, in the order `takeoff rise apex fall landing`.
    pub jump_poses: Option<[usize; 5]>,
}

/// The columns of the five jump phases in a sheet that names its columns (`data-poses`).
///
/// Looked up by name rather than taken in order, so that a sheet regenerated with its phases in
/// another order still shows the right one; a sheet that names nothing is taken in the order
/// the phases are declared in, which is how it was drawn.
pub fn jump_poses(poses: &[String], columns: usize) -> Option<[usize; 5]> {
    const PHASES: [&str; 5] = ["takeoff", "rise", "apex", "fall", "landing"];
    let mut found = [0usize; 5];
    for (index, (slot, phase)) in found.iter_mut().zip(PHASES).enumerate() {
        *slot = poses
            .iter()
            .position(|pose| pose == phase)
            .unwrap_or(index);
        if *slot >= columns {
            return None;
        }
    }
    Some(found)
}

/// The row and column of the sheet the player is drawn from this frame.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlayerPose {
    pub sheet: PlayerSheet,
    /// The column: a pose of that sheet.
    pub pose: usize,
    /// The row: the facing, an index into [`PLAYER_FACINGS`].
    pub facing: usize,
}

/// The animation's memory between frames.
#[derive(Clone, Copy, Debug)]
pub struct PlayerAnimation {
    facing: usize,
    walked: f64,
    stood_ms: f64,
}

impl Default for PlayerAnimation {
    fn default() -> Self {
        Self { facing: START_FACING, walked: 0.0, stood_ms: 0.0 }
    }
}

impl PlayerAnimation {
    /// Takes one frame into account and answers with the pose to draw.
    pub fn advance(&mut self, moment: PlayerMoment, sheets: PlayerSheets) -> PlayerPose {
        let walking = matches!(
            moment.motion,
            PlayerMotionType::Walking | PlayerMotionType::Running | PlayerMotionType::Skidding
        );
        let flying = matches!(
            moment.motion,
            PlayerMotionType::Jumping | PlayerMotionType::Falling | PlayerMotionType::Flying
        );
        let jump_pose = match (sheets.jump_poses, moment.jump_phase) {
            (_, PlayerJumpPhase::Ground) | (None, _) => None,
            (Some(poses), phase) => Some(poses[phase_column(phase)] as i32),
        };
        // Standing still is the only thing that feeds the idle cycle: anything else resets it,
        // so the dance always starts from its first pose.
        self.stood_ms = if moment.climbing.is_some() || walking || flying || jump_pose.is_some() {
            0.0
        } else {
            self.stood_ms + moment.elapsed_ms.max(0.0)
        };
        // Turned the way it climbs or walks; standing still it keeps the way it faced.
        self.facing = get_player_facing(moment.direction).unwrap_or(self.facing);
        // Skidding, the feet pedal against the slide, backwards if the controls were let go.
        let pedal = match moment.motion {
            PlayerMotionType::Skidding if moment.direction.x == 0.0 && moment.direction.y == 0.0 => {
                -SKID_PEDAL
            }
            PlayerMotionType::Skidding => SKID_PEDAL,
            _ => 1.0,
        };
        self.walked = if moment.climbing.is_none() && walking {
            self.walked + moment.moved * pedal
        } else {
            0.0
        };
        let frame = select_player_frame(PlayerFrameInput {
            walk_frames: sheets.walk_poses.unwrap_or(1).max(1),
            walk_stride: WALK_STRIDE,
            climb_frames: sheets.climb_poses,
            idle: sheets.idle_poses.map(|frames| (frames, IDLE_PERIOD_MS)),
            jump_pose,
            climbing: moment.climbing,
            walking,
            flying,
            walked: self.walked,
            stood_ms: (self.stood_ms - IDLE_DELAY_MS).max(0.0),
            air_pose: Some(AIR_POSE),
        });
        self.pose(frame)
    }

    /// The name of the facing the player is drawn with, for the heads-up display.
    pub fn facing_name(&self) -> &'static str {
        PLAYER_FACINGS[self.facing % PLAYER_FACINGS.len()]
    }

    fn pose(&self, frame: PlayerFrame) -> PlayerPose {
        PlayerPose {
            sheet: frame.sheet,
            pose: frame.pose.max(0) as usize,
            facing: self.facing,
        }
    }
}

/// Which of the five jump columns a phase uses; `Ground` never reaches here and takes the
/// first, the same column a take-off shows.
fn phase_column(phase: PlayerJumpPhase) -> usize {
    match phase {
        PlayerJumpPhase::Ground | PlayerJumpPhase::Takeoff => 0,
        PlayerJumpPhase::Rise => 1,
        PlayerJumpPhase::Apex => 2,
        PlayerJumpPhase::Fall => 3,
        PlayerJumpPhase::Landing => 4,
    }
}

#[cfg(test)]
#[path = "player_view.test.rs"]
mod tests;
