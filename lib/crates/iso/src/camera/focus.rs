//! What a following camera looks at while the player moves, and how it eases onto a new level.

use crate::camera::ground_point_below;
use crate::player::{PLAYER_CLIMB_MS, PlayerMotionType, PlayerRenderPosition, get_climb_rise};
use crate::projection::{GridPoint, ProjectionConfig};

/// Real milliseconds the camera takes to rise one block onto a higher top the player did not climb
pub const CAMERA_RISE_MS_PER_BLOCK: f64 = PLAYER_CLIMB_MS;

/// How long the level a camera shows takes to settle on the level it aims at, in real
pub const CAMERA_LEVEL_SMOOTH_MS: f64 = 65.0;

/// Blocks under which the level a camera shows settles on the level it aims at, once it is barely
const LEVEL_SNAP: f64 = 0.002;

/// Blocks a second under which the spring counts as stopped, for the settle above.
const LEVEL_SNAP_SPEED: f64 = 0.05;

/// A rise onto a higher top in progress: from the level the camera was at, to the one it aims at.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Rise {
    from: f64,
    to: f64,
    ms: f64,
}

/// The level, in blocks above elevation zero, a following camera looks at.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CameraFocus {
    /// The level it wants to look at: the top under the player, or its feet while they are lower.
    aim: f64,
    /// The level it heads for: the aim, or part way up a [`Rise`] onto a higher one.
    eased: f64,
    /// The level it shows: [`Self::eased`], smoothed as the caller's spring says.
    shown: f64,
    /// Blocks a second the shown level is moving at, which is what keeps the spring cornerless.
    speed: f64,
    rise: Option<Rise>,
}

impl CameraFocus {
    /// A focus already settled on the top `at` stands on, so a session does not open with a swoop.
    pub fn new(at: &PlayerRenderPosition) -> Self {
        let top = at.elevation;
        Self {
            aim: top,
            eased: top,
            shown: top,
            speed: 0.0,
            rise: None,
        }
    }

    /// The level it shows now, in blocks above elevation zero: what the last
    pub fn level(&self) -> f64 {
        self.shown
    }

    /// The level it is heading for, before any chase: the top under the player, its feet while they
    pub fn aim_level(&self) -> f64 {
        self.eased
    }

    /// Whether it is still rising onto a higher top, so the camera has somewhere to go even on a
    pub fn rising(&self) -> bool {
        self.rise.is_some()
    }

    /// The level to show for the player at `at`, `elapsed_ms` real milliseconds after the last
    pub fn advance(
        &mut self,
        at: &PlayerRenderPosition,
        motion: PlayerMotionType,
        elapsed_ms: f64,
        smooth_ms: f64,
    ) -> f64 {
        let top = at.elevation;
        let following = matches!(
            motion,
            PlayerMotionType::Climbing | PlayerMotionType::Flying
        );
        self.aim = if following {
            top + at.height
        } else if at.height > 0.0 {
            self.aim.min(top + at.height)
        } else {
            top
        };
        if following || self.aim <= self.eased {
            self.eased = self.aim;
            self.rise = None;
        } else {
            let elapsed = if elapsed_ms.is_finite() && elapsed_ms > 0.0 {
                elapsed_ms
            } else {
                0.0
            };
            let mut rise = match self.rise {
                Some(rise) if rise.to == self.aim => rise,
                _ => Rise {
                    from: self.eased,
                    to: self.aim,
                    ms: 0.0,
                },
            };
            rise.ms += elapsed;
            let risen =
                get_climb_rise(rise.ms / ((rise.to - rise.from) * CAMERA_RISE_MS_PER_BLOCK));
            self.eased = if risen < 1.0 {
                rise.from + (rise.to - rise.from) * risen
            } else {
                self.aim
            };
            self.rise = Some(rise);
        }
        let smoothing =
            smooth_ms.is_finite() && smooth_ms > 0.0 && elapsed_ms.is_finite() && elapsed_ms > 0.0;
        if smoothing {
            let dt = elapsed_ms / 1000.0;
            let omega = 2.0 / (smooth_ms / 1000.0);
            let x = omega * dt;
            let decay = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
            let behind = self.shown - self.eased;
            let pull = (self.speed + omega * behind) * dt;
            self.speed = (self.speed - omega * pull) * decay;
            self.shown = self.eased + (behind + pull) * decay;
            if (self.eased - self.shown).abs() < LEVEL_SNAP && self.speed.abs() < LEVEL_SNAP_SPEED {
                self.shown = self.eased;
                self.speed = 0.0;
            }
        } else {
            self.shown = self.eased;
            self.speed = 0.0;
        }
        self.shown
    }

    /// [`Self::advance`] as the ground point the camera centres on: the
    pub fn ground(
        &mut self,
        at: &PlayerRenderPosition,
        motion: PlayerMotionType,
        elapsed_ms: f64,
        projection: ProjectionConfig,
    ) -> GridPoint {
        let level = self.advance(at, motion, elapsed_ms, 0.0);
        ground_point_below(GridPoint { x: at.x, y: at.y }, level, projection)
    }
}

#[cfg(test)]
#[path = "focus.test.rs"]
mod tests;
