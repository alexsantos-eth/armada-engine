//! What a following camera looks at while the player moves, and how it eases onto a new level.
//!
//! Mirrors the `ground()` closure of `createPlayerView()` in
//! `web/src/isometric/core/engine/player-view/player-view.ts`: the camera does not aim at the player's
//! feet from one frame to the next, because that moves the whole world by a full elevation step the
//! instant the player changes level. It aims at the top the player stands on, holds that level
//! while a jump arcs over it, follows the feet down a fall as they fall, and rises onto a higher
//! top it did not climb to on a climb's own curve ([`CAMERA_RISE_MS_PER_BLOCK`] per block,
//! [`get_climb_rise`]).
//!
//! The level is the whole of it: [`CameraFocus::advance`] keeps that one number, and the caller
//! decides what to do with it. [`CameraFocus::ground`] folds it into a ground point for a camera
//! that eases its centre with [`follow_camera`](crate::camera::follow_camera), which is what the
//! TypeScript client does; a caller that would rather not let that easing lag the level (a step up
//! then reads as the player bobbing against the ground it walks on) can ease only the player's
//! column and raise its own projection by the level instead.

use crate::camera::ground_point_below;
use crate::player::{
    PLAYER_CLIMB_MS, PlayerMotionType, PlayerRenderPosition, get_climb_rise,
};
use crate::projection::{GridPoint, ProjectionConfig};

/// Real milliseconds the camera takes to rise one block onto a higher top the player did not climb
/// (a jump onto it): as long as a climb of one block, on the same curve.
pub const CAMERA_RISE_MS_PER_BLOCK: f64 = PLAYER_CLIMB_MS;

/// How long the level a camera shows takes to settle on the level it aims at, in real
/// milliseconds: the time constant of a critically damped spring, so the motion has no corner at
/// either end and none at a frame rate either. Zero is no spring at all, the level itself.
///
/// It only ever trades one roughness for the other. The level a camera aims at is as abrupt as the
/// player's own feet, which accelerate under gravity and stop dead the frame it lands: the camera's
/// vertical speed then changes by 180 px a second in one frame stepping up a block and 437 stepping
/// down one, which reads as the view arriving with a knock. Smoothing takes that out, but the player
/// is drawn against the level, so whatever the smoothing is behind by is the player moving on screen
/// instead. The peak of each, measured over a step down, by the shape of the smoothing:
///
/// | smoothing            | player | sharpest knock |
/// |----------------------|--------|----------------|
/// | none                 | 0 px   | 437 px/s       |
/// | 30 ms half-life      | 27 px  | 169 px/s       |
/// | 45 ms half-life      | 40 px  | 124 px/s       |
/// | 50 ms spring         | 33 px  | 140 px/s       |
/// | 65 ms spring         | 43 px  | 116 px/s       |
/// | 100 ms spring        | 62 px  |  73 px/s       |
///
/// A spring beats a half-life chase at every drift, because a chase answers a change at full speed
/// and so puts a corner at the start of every move — which is what a short move is mostly made of,
/// and why half a block of sand read as a flick while a whole block read as smooth. 65 ms is slow
/// enough that a half-block step takes about 450 ms, and holds the player's own drift to a fifth of
/// a block over it. A clamp on that drift is not the answer: clamping is itself a corner, and it
/// took the knock back up to 430 px/s.
///
/// The TypeScript client has no smoothing of the level at all: its 90 ms is on the camera's whole
/// centre, which is where its player's hop comes from.
pub const CAMERA_LEVEL_SMOOTH_MS: f64 = 65.0;

/// Blocks under which the level a camera shows settles on the level it aims at, once it is barely
/// moving: a fiftieth of an elevation step, well under a pixel at any zoom this view uses.
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
        let top = at.elevation - at.inset;
        Self {
            aim: top,
            eased: top,
            shown: top,
            speed: 0.0,
            rise: None,
        }
    }

    /// The level it shows now, in blocks above elevation zero: what the last
    /// [`advance`](Self::advance) returned.
    pub fn level(&self) -> f64 {
        self.shown
    }

    /// The level it is heading for, before any chase: the top under the player, its feet while they
    /// are lower, or part way up a rise onto a higher top.
    pub fn aim_level(&self) -> f64 {
        self.eased
    }

    /// Whether it is still rising onto a higher top, so the camera has somewhere to go even on a
    /// frame where the player itself did not move.
    pub fn rising(&self) -> bool {
        self.rise.is_some()
    }

    /// The level to show for the player at `at`, `elapsed_ms` real milliseconds after the last
    /// frame, in blocks above elevation zero: the top it stands on, its feet while they are lower,
    /// or part way up a rise onto a higher top, which this call advances, smoothed over
    /// `smooth_ms` ([`CAMERA_LEVEL_SMOOTH_MS`]; zero, or no frame time, shows the level itself).
    pub fn advance(
        &mut self,
        at: &PlayerRenderPosition,
        motion: PlayerMotionType,
        elapsed_ms: f64,
        smooth_ms: f64,
    ) -> f64 {
        let top = at.elevation - at.inset;
        // Climbing or flying, it follows the feet up as they go; a jump does not bob it.
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
            let risen = get_climb_rise(rise.ms / ((rise.to - rise.from) * CAMERA_RISE_MS_PER_BLOCK));
            // Risen all the way: on the aim itself, so the next frame ends the rise.
            self.eased = if risen < 1.0 {
                rise.from + (rise.to - rise.from) * risen
            } else {
                self.aim
            };
            self.rise = Some(rise);
        }
        let smoothing = smooth_ms.is_finite()
            && smooth_ms > 0.0
            && elapsed_ms.is_finite()
            && elapsed_ms > 0.0;
        if smoothing {
            // One step of a critically damped spring, integrated exactly for this frame, so the
            // shown level leaves and arrives at the level it aims at with no corner, and the motion
            // is the same at any frame rate.
            let dt = elapsed_ms / 1000.0;
            let omega = 2.0 / (smooth_ms / 1000.0);
            let x = omega * dt;
            let decay = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
            let behind = self.shown - self.eased;
            let pull = (self.speed + omega * behind) * dt;
            self.speed = (self.speed - omega * pull) * decay;
            self.shown = self.eased + (behind + pull) * decay;
            // Settles instead of trailing the level by less than a pixel for ever.
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

    /// [`Self::advance`] as the ground point the TypeScript client's camera centres on: the
    /// player's column lifted by that level ([`ground_point_below`]). No smoothing, because that
    /// client eases its whole centre onto this point instead.
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
