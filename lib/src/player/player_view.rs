//! Which pose of which sheet the player is drawn with, and which way it faces.

use iso::player::{PLAYER_FACINGS, PlayerJumpPhase, PlayerMotionType, get_player_facing};
use iso::projection::GridPoint;
use iso::scene_order::{PlayerFrame, PlayerFrameInput, PlayerSheet, select_player_frame};

/// Columns walked per cycle of the walk sheet:
pub const WALK_STRIDE: f64 = 1.4;

/// Real milliseconds one cycle of the idle sheet lasts: two beats of the monkey's dance.
pub const IDLE_PERIOD_MS: f64 = 900.0;

/// Milliseconds the player stands still before its idle cycle starts, so that stopping for an
pub const IDLE_DELAY_MS: f64 = 300.0;

/// The walk pose used in the air when there is no jump sheet: the legs furthest apart, a leap.
pub const AIR_POSE: i32 = 3;

/// How fast the feet pedal while the player skids: twice walking pace, and backwards when it
pub const SKID_PEDAL: f64 = 2.0;

/// The facing the player starts with, before it has walked anywhere: towards the camera, which
pub const START_FACING: usize = 12;

/// Real milliseconds the figure spends on each facing it passes through while it turns.
pub const TURN_MS_PER_FACING: f64 = 35.0;

/// What one frame does to the animation: where the player is going, what it is doing, and how
#[derive(Clone, Copy, Debug)]
pub struct PlayerMoment {
    /// How far into a climb the player is, or `None` if it is not climbing.
    pub climbing: Option<f64>,
    pub motion: PlayerMotionType,
    /// The way the player is heading: where it climbs to, or the direction it is walking in.
    pub direction: GridPoint,
    /// Columns covered since the frame before, for the walk cycle.
    pub moved: f64,
    pub jump_phase: PlayerJumpPhase,
    /// Milliseconds of real time since the frame before, for the idle cycle.
    pub elapsed_ms: f64,
}

/// How many poses each of the player's sheets holds, read from the manifest once.
#[derive(Clone, Copy, Debug, Default)]
pub struct PlayerSheets {
    pub walk_poses: Option<i32>,
    pub idle_poses: Option<i32>,
    pub climb_poses: Option<i32>,
    /// The column of each jump phase, in the order `takeoff rise apex fall landing`.
    pub jump_poses: Option<[usize; 5]>,
}

/// The columns of the five jump phases in a sheet that names its columns (`data-poses`).
pub fn jump_poses(poses: &[String], columns: usize) -> Option<[usize; 5]> {
    const PHASES: [&str; 5] = ["takeoff", "rise", "apex", "fall", "landing"];
    let mut found = [0usize; 5];
    for (index, (slot, phase)) in found.iter_mut().zip(PHASES).enumerate() {
        *slot = poses.iter().position(|pose| pose == phase).unwrap_or(index);
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
    /// Milliseconds banked towards the next facing of a turn in progress.
    turning_ms: f64,
    walked: f64,
    stood_ms: f64,
}

impl Default for PlayerAnimation {
    fn default() -> Self {
        Self {
            facing: START_FACING,
            turning_ms: 0.0,
            walked: 0.0,
            stood_ms: 0.0,
        }
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
        self.stood_ms = if moment.climbing.is_some() || walking || flying || jump_pose.is_some() {
            0.0
        } else {
            self.stood_ms + moment.elapsed_ms.max(0.0)
        };
        let target = get_player_facing(moment.direction).unwrap_or(self.facing);
        self.turn_towards(target, moment.elapsed_ms);
        let pedal = match moment.motion {
            PlayerMotionType::Skidding
                if moment.direction.x == 0.0 && moment.direction.y == 0.0 =>
            {
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

    /// Steps the facing towards `target` by the shorter way round, one facing per
    fn turn_towards(&mut self, target: usize, elapsed_ms: f64) {
        let facings = PLAYER_FACINGS.len();
        if target == self.facing {
            self.turning_ms = 0.0;
            return;
        }
        self.turning_ms += elapsed_ms.max(0.0);
        let steps = (self.turning_ms / TURN_MS_PER_FACING).floor();
        if steps < 1.0 {
            return;
        }
        self.turning_ms -= steps * TURN_MS_PER_FACING;
        let half = (facings / 2) as i32;
        let apart = (target as i32 - self.facing as i32 + half).rem_euclid(facings as i32) - half;
        let step = (steps as i32).min(apart.abs()) * apart.signum();
        self.facing = (self.facing as i32 + step).rem_euclid(facings as i32) as usize;
        if self.facing == target {
            self.turning_ms = 0.0;
        }
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
