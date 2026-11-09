//! Presentation-only squash, stretch, and footfall bob for the player sprite.

use iso::player::{PLAYER_JUMP_SPEED, PlayerMotionType};

use crate::player::player_view::WALK_STRIDE;

/// Real milliseconds the body squashes after a landing.
pub const LANDING_SQUASH_MS: f64 = 180.0;
/// Real milliseconds the body stretches after a take-off.
pub const TAKEOFF_STRETCH_MS: f64 = 120.0;
/// Stretch of the body in air per block per tick of vertical speed.
pub const AIR_STRETCH_PER_SPEED: f64 = 0.25;
/// The greatest stretch the body can take in air.
pub const MAX_AIR_STRETCH: f64 = 0.12;
/// Stretch at the middle of a climb.
pub const CLIMB_STRETCH: f64 = 0.05;
/// Footfall bob per column per tick of ground speed.
pub const BOB_PER_SPEED: f64 = 0.2;

/// The scale of the body around its feet.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BodyScale {
    pub x: f64,
    pub y: f64,
}

/// Presentation data sampled from the player once per rendered frame.
#[derive(Clone, Copy, Debug)]
pub struct BodyMoment {
    pub motion: PlayerMotionType,
    pub speed: f64,
    pub walked: f64,
    pub vertical_speed: Option<f64>,
    pub climbing: Option<f64>,
    pub elapsed_ms: f64,
    pub jumps: i32,
    pub landings: i32,
    pub impact: f64,
}

/// Memory for short take-off and landing pulses.
#[derive(Clone, Copy, Debug)]
pub struct BodyMotion {
    seen_jumps: i32,
    seen_landings: i32,
    since_takeoff: f64,
    since_landing: f64,
    impact: f64,
}

impl Default for BodyMotion {
    fn default() -> Self {
        Self {
            seen_jumps: 0,
            seen_landings: 0,
            since_takeoff: f64::INFINITY,
            since_landing: f64::INFINITY,
            impact: 0.0,
        }
    }
}

impl BodyMotion {
    /// Advances the visual pulses and returns this frame's scale around the player's feet.
    pub fn advance(&mut self, moment: BodyMoment) -> BodyScale {
        let elapsed_ms = moment.elapsed_ms.max(0.0);
        self.since_takeoff += elapsed_ms;
        self.since_landing += elapsed_ms;
        if moment.jumps != self.seen_jumps {
            self.since_takeoff = 0.0;
        }
        if moment.landings != self.seen_landings {
            self.since_landing = 0.0;
            self.impact = moment.impact;
        }
        self.seen_jumps = moment.jumps;
        self.seen_landings = moment.landings;
        let shape = shape(moment);
        let squash = remaining(self.since_landing, LANDING_SQUASH_MS)
            * (self.impact / PLAYER_JUMP_SPEED).clamp(0.25, 1.5);
        let stretch = remaining(self.since_takeoff, TAKEOFF_STRETCH_MS);
        BodyScale {
            x: (1.0 + 0.1 * squash - 0.06 * stretch) * shape.x,
            y: (1.0 - 0.14 * squash + 0.1 * stretch) * shape.y,
        }
    }
}

fn remaining(ms: f64, duration: f64) -> f64 {
    (1.0 - ms.max(0.0) / duration).max(0.0)
}

fn shape(moment: BodyMoment) -> BodyScale {
    let stretch = if let Some(progress) = moment.climbing {
        CLIMB_STRETCH * (std::f64::consts::PI * progress.clamp(0.0, 1.0)).sin()
    } else if matches!(
        moment.motion,
        PlayerMotionType::Jumping | PlayerMotionType::Falling
    ) {
        (AIR_STRETCH_PER_SPEED * moment.vertical_speed.unwrap_or(0.0).abs()).min(MAX_AIR_STRETCH)
    } else if matches!(
        moment.motion,
        PlayerMotionType::Walking | PlayerMotionType::Running | PlayerMotionType::Skidding
    ) {
        BOB_PER_SPEED
            * moment.speed.max(0.0)
            * (4.0 * std::f64::consts::PI * moment.walked / WALK_STRIDE).sin()
    } else {
        0.0
    };
    BodyScale {
        x: 1.0 - stretch / 2.0,
        y: 1.0 + stretch,
    }
}

#[cfg(test)]
#[path = "body_motion.test.rs"]
mod tests;
