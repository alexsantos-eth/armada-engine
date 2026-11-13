//! Presentation-only squash, stretch, footfall bob, lean and roll for the player sprite.

use iso::assets::SpriteLayout;
use iso::player::{PLAYER_JUMP_SPEED, PlayerMotionType};
use iso::projection::GridPoint;

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
/// Lean of the body, in radians, per column per tick it drifts across the screen: a walk (0.15)
/// leans about 3 degrees, a run (0.25) about 5.
pub const LEAN_PER_SPEED: f64 = 0.35;
/// Lean, in radians, per column per tick squared it speeds up across the screen: it leans into a
/// start and back against a stop, like a body with weight.
pub const LEAN_PER_ACCEL: f64 = 1.2;
/// Lean back, in radians per column per tick, while it skids: heels dug in against the slide.
pub const SKID_LEAN_PER_SPEED: f64 = 0.8;
/// Most the body ever leans on the ground, in radians (about 9 degrees).
pub const MAX_LEAN: f64 = 0.16;
/// Roll of the whole body while it flies, in radians per column per tick it drifts across the
/// screen: head first, feet rising behind it, pulled along by the jetpack.
pub const FLY_ROLL_PER_SPEED: f64 = 2.3;
/// Roll while it flies, in radians per column per tick squared it speeds up across the screen.
pub const FLY_ROLL_PER_ACCEL: f64 = 4.0;
/// Most the body turns while it flies, in radians (about 34 degrees).
pub const MAX_FLY_ROLL: f64 = 0.6;
/// Blocks over its feet the middle of the body is, which it turns about while it flies.
pub const ROLL_PIVOT: f64 = 0.28;
/// Longest step, in real milliseconds, the lean spring takes at once: a long frame takes several.
const LEAN_STEP_MS: f64 = 16.0;
/// How a lean follows its target: the angular frequency and the damping ratio of a spring.
#[derive(Clone, Copy, Debug)]
pub struct LeanSpring {
    pub stiffness: f64,
    pub damping: f64,
}

/// The spring of the lean on foot: under-damped, so a stop overshoots into a short wobble.
pub const LEAN_SPRING: LeanSpring = LeanSpring {
    stiffness: 18.0,
    damping: 0.45,
};

/// The spring of the roll while it flies: slower and floatier than the lean on foot, the body
/// swinging under its jetpack into a turn and settling back upright when it stops.
pub const FLY_ROLL_SPRING: LeanSpring = LeanSpring {
    stiffness: 8.0,
    damping: 0.5,
};

/// Where a lean is and how fast it turns, in radians and radians per second: a spring's state.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct BodyLean {
    pub angle: f64,
    pub speed: f64,
}

/// How far across the screen a ground velocity drifts, in columns per tick: right (`+x -y`) is
/// positive, towards or away from the camera nothing, so only a sideways move leans.
pub fn screen_drift(velocity: GridPoint) -> f64 {
    (velocity.x - velocity.y) / std::f64::consts::SQRT_2
}

/// The angle the body leans towards on the ground: forward with its speed, further while it
/// speeds up and back while it brakes, never past [`MAX_LEAN`]. Skidding it leans back against
/// its slide instead of into it.
pub fn lean_target(velocity: GridPoint, acceleration: GridPoint, skidding: bool) -> f64 {
    let per_speed = if skidding {
        -SKID_LEAN_PER_SPEED
    } else {
        LEAN_PER_SPEED
    };
    let target = per_speed * screen_drift(velocity) + LEAN_PER_ACCEL * screen_drift(acceleration);
    target.clamp(-MAX_LEAN, MAX_LEAN)
}

/// The angle the whole body turns towards while it flies: head first into where it goes across
/// the screen, its feet rising behind it, never past [`MAX_FLY_ROLL`]; upright standing still.
pub fn roll_target(velocity: GridPoint, acceleration: GridPoint) -> f64 {
    let target = FLY_ROLL_PER_SPEED * screen_drift(velocity)
        + FLY_ROLL_PER_ACCEL * screen_drift(acceleration);
    target.clamp(-MAX_FLY_ROLL, MAX_FLY_ROLL)
}

/// Moves `lean` towards `target` for `ms` of real time along the damped `spring`, in steps of at
/// most [`LEAN_STEP_MS`] so that a long frame does not blow it up. Once it rests on a target of
/// `0` it is exactly `0`, so an upright body stops costing anything.
pub fn step_body_lean(lean: &mut BodyLean, target: f64, ms: f64, spring: LeanSpring) {
    let mut left = ms.max(0.0);
    while left > 0.0 {
        let dt = left.min(LEAN_STEP_MS) / 1000.0;
        left -= LEAN_STEP_MS;
        let pull = spring.stiffness * spring.stiffness * (target - lean.angle);
        let drag = 2.0 * spring.damping * spring.stiffness * lean.speed;
        lean.speed += (pull - drag) * dt;
        lean.angle += lean.speed * dt;
    }
    if target == 0.0 && lean.angle.abs() < 1e-4 && lean.speed.abs() < 1e-3 {
        lean.angle = 0.0;
        lean.speed = 0.0;
    }
}

/// The four screen corners the body's artwork is drawn into, clockwise from its top left: the
/// rectangle `layout`, leant `tilt` radians about the line its feet stand on (the head to the
/// right when positive) and then turned `turned` radians about the middle of the body,
/// [`ROLL_PIVOT`] blocks of `box_height` over `feet`.
pub fn body_quad(
    layout: SpriteLayout,
    feet: (f64, f64),
    tilt: f64,
    turned: f64,
    box_height: f64,
) -> [(f64, f64); 4] {
    let (sin, cos) = tilt.sin_cos();
    let lean = |(x, y): (f64, f64)| {
        let above = feet.1 - y;
        (x + above * sin, feet.1 - above * cos)
    };
    let (roll_sin, roll_cos) = turned.sin_cos();
    let pivot = (feet.0, feet.1 - ROLL_PIVOT * box_height);
    let roll = |(x, y): (f64, f64)| {
        let (dx, dy) = (x - pivot.0, y - pivot.1);
        (
            pivot.0 + dx * roll_cos - dy * roll_sin,
            pivot.1 + dx * roll_sin + dy * roll_cos,
        )
    };
    let (left, right) = (layout.x, layout.x + layout.width);
    let (top, bottom) = (layout.y, layout.y + layout.height);
    [(left, top), (right, top), (right, bottom), (left, bottom)].map(|corner| roll(lean(corner)))
}

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
    /// Its horizontal velocity, in columns per tick, which is what it leans into.
    pub velocity: GridPoint,
    /// How much that velocity changed over the last tick, in columns per tick squared.
    pub acceleration: GridPoint,
    /// Whether it is sliding to a stop, which leans it back instead of forward.
    pub skidding: bool,
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
    /// The lean on foot and the roll in flight, each following its own spring.
    lean: BodyLean,
    roll: BodyLean,
}

/// How the body is drawn this frame: its scale about its feet, the lean about the line it
/// stands on and the roll about the middle of its body.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BodyPose {
    pub scale: BodyScale,
    pub tilt: f64,
    pub turned: f64,
}

impl Default for BodyMotion {
    fn default() -> Self {
        Self {
            seen_jumps: 0,
            seen_landings: 0,
            since_takeoff: f64::INFINITY,
            since_landing: f64::INFINITY,
            impact: 0.0,
            lean: BodyLean::default(),
            roll: BodyLean::default(),
        }
    }
}

impl BodyMotion {
    /// Advances the visual pulses and the two leans, and answers with how the body is drawn
    /// this frame. Flying, the whole body turns into where it goes instead of leaning, and the
    /// lean lets go; out of the air it turns back upright, each along its own spring.
    pub fn advance(&mut self, moment: BodyMoment) -> BodyPose {
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
        let flying = moment.motion == PlayerMotionType::Flying;
        step_body_lean(
            &mut self.roll,
            if flying {
                roll_target(moment.velocity, moment.acceleration)
            } else {
                0.0
            },
            elapsed_ms,
            FLY_ROLL_SPRING,
        );
        step_body_lean(
            &mut self.lean,
            if flying {
                0.0
            } else {
                lean_target(moment.velocity, moment.acceleration, moment.skidding)
            },
            elapsed_ms,
            LEAN_SPRING,
        );
        BodyPose {
            scale: BodyScale {
                x: (1.0 + 0.1 * squash - 0.06 * stretch) * shape.x,
                y: (1.0 - 0.14 * squash + 0.1 * stretch) * shape.y,
            },
            tilt: self.lean.angle,
            turned: self.roll.angle,
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
