//! How the player floats, sinks and swims: the water's own numbers, kept apart from the
//! locomotion on land. The water has no floor in this world — a water column is water all the
//! way down — so the player never stands in it: it floats at the column's top, sunk by
//! [`PLAYER_FLOAT_DEPTH`], and a fall pushes it under before the water pushes it back up.

use crate::time::TICKS_PER_SECOND;

/// Swimming speed of the player, in columns per second of simulation: slower than a walk,
/// because the water holds it back.
pub const PLAYER_SWIM_SPEED: f64 = 2.0;

/// Most horizontal columns a swimming player covers in one tick.
pub const PLAYER_SWIM_STEP: f64 = PLAYER_SWIM_SPEED / TICKS_PER_SECOND as f64;

/// Swimming speed with the run key held, in columns per second: a faster crawl, still under a
/// run on land.
pub const PLAYER_SWIM_FAST_SPEED: f64 = 3.5;

/// Most horizontal columns a fast-swimming player covers in one tick.
pub const PLAYER_SWIM_FAST_STEP: f64 = PLAYER_SWIM_FAST_SPEED / TICKS_PER_SECOND as f64;

/// Horizontal velocity change per tick while starting or redirecting in the water: the water
/// gives less to push against than the ground, so it takes longer to get going.
pub const PLAYER_SWIM_ACCEL: f64 = 0.02;

/// Horizontal velocity removed per tick when movement is released in the water: it glides.
pub const PLAYER_SWIM_BRAKE: f64 = 0.012;

/// Blocks the body floats below the water's top when it is resting on the surface.
pub const PLAYER_FLOAT_DEPTH: f64 = 0.3;

/// How hard the water pushes the body back to [`PLAYER_FLOAT_DEPTH`], per block it is away from
/// it, in blocks per tick per tick. With [`PLAYER_WATER_DRAG`] this is a damped spring: a dive
/// comes back up and overshoots once, which is what bobbing back to the surface looks like.
pub const PLAYER_BUOYANCY: f64 = 0.1;

/// Share of its vertical speed the water takes from the body each tick.
pub const PLAYER_WATER_DRAG: f64 = 0.22;

/// Deepest the body goes under the water's top, however fast it fell in.
pub const PLAYER_PLUNGE_MAX: f64 = 1.5;

/// Blocks under [`PLAYER_FLOAT_DEPTH`] the body has to be for the head to count as submerged:
/// the swimmer is drawn diving and strokes no longer carry it.
pub const PLAYER_UNDER_DEPTH: f64 = 0.2;

/// Share of its speed a submerged swimmer keeps: it is still coming up, not swimming yet.
pub const PLAYER_UNDER_SPEED: f64 = 0.45;

/// Blocks the body may rise above the water's top: none. The water is the ceiling of a swim;
/// leaving it is a climb onto the shore, not a jump.
pub const PLAYER_SURFACE_DEPTH: f64 = 0.0;

/// Blocks higher than the water it is in the player pulls itself out onto: a lunge out of the
/// water reaches further than a step up on land ([`super::PLAYER_MAX_CLIMB`]).
pub const PLAYER_SWIM_EXIT_CLIMB: f64 = 2.0;

/// Ticks one rise and fall of a floating body takes: the swell carrying it, slow enough to read
/// as the water breathing under it.
pub const PLAYER_BOB_TICKS: f64 = 46.0;

/// Blocks the swell lifts and drops a floating body either side of its float depth.
pub const PLAYER_BOB_DEPTH: f64 = 0.07;

/// Share of that swell a swimmer on the move feels: it cuts through the water instead of being
/// carried by it.
pub const PLAYER_BOB_SWIMMING: f64 = 0.35;

/// Downward speed, in blocks per tick, under which going into the water raises no splash: a
/// swimmer sliding in off the sand barely disturbs it.
pub const PLAYER_SPLASH_MIN_SPEED: f64 = 0.04;

/// A swim in progress: the water it is in and where the body is in it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlayerSwim {
    /// Top of the water column the swimmer is in, in blocks.
    pub level: f64,
    /// Blocks the body is below that top; `0` is right at the surface.
    pub depth: f64,
    /// Blocks per tick the body is sinking (positive) or rising (negative).
    pub sink: f64,
    /// Ticks this swim has lasted, which is what the swell is read from.
    pub ticks: i32,
}

impl PlayerSwim {
    /// A swim just begun in water topped at `level`, entered at `sink` blocks per tick (`0` for
    /// sliding in off the shore) with the body already `depth` blocks under.
    pub fn entering(level: f64, depth: f64, sink: f64) -> Self {
        Self {
            level,
            depth: depth.clamp(0.0, PLAYER_PLUNGE_MAX),
            sink: sink.max(0.0),
            ticks: 0,
        }
    }
}

/// Whether a column topped at `top` is water the player swims in. Every water column is: the
/// water has no floor to wade on, so there is no shallow end.
pub fn is_swimmable(surface: crate::terrain::TerrainMaterial) -> bool {
    surface == crate::terrain::TerrainMaterial::Water
}

/// One tick of the water holding the body: the buoyancy spring towards [`PLAYER_FLOAT_DEPTH`]
/// with the water's drag on top, clamped to the surface and to [`PLAYER_PLUNGE_MAX`]. Answers
/// the body's new sinking speed and its new depth.
pub fn next_float(sink: f64, depth: f64) -> (f64, f64) {
    let pull = (PLAYER_FLOAT_DEPTH - depth) * PLAYER_BUOYANCY;
    let mut speed = (sink + pull) * (1.0 - PLAYER_WATER_DRAG);
    let mut next = depth + speed;
    if next >= PLAYER_PLUNGE_MAX {
        next = PLAYER_PLUNGE_MAX;
        speed = 0.0;
    }
    if next <= PLAYER_SURFACE_DEPTH {
        next = PLAYER_SURFACE_DEPTH;
        speed = 0.0;
    }
    (speed, next)
}

/// Whether a body `depth` blocks under the water's top counts as submerged.
pub fn is_under(depth: f64) -> bool {
    depth > PLAYER_FLOAT_DEPTH + PLAYER_UNDER_DEPTH
}

/// Most columns per tick a swimmer covers: its cruising speed, fast with the run key held, and
/// cut to [`PLAYER_UNDER_SPEED`] of it while it is still under the surface.
pub fn swim_step(fast: bool, depth: f64) -> f64 {
    let step = if fast {
        PLAYER_SWIM_FAST_STEP
    } else {
        PLAYER_SWIM_STEP
    };
    if is_under(depth) {
        step * PLAYER_UNDER_SPEED
    } else {
        step
    }
}

/// How far the swell lifts or drops a floating body on tick `ticks` of its swim, in blocks
/// added to its depth: nothing while it is still plunging or coming back up (`settled` is how
/// close the body is to its float depth, `1` right at it), the whole swell while it floats
/// still, and [`PLAYER_BOB_SWIMMING`] of it while it swims along.
pub fn float_bob(ticks: i32, settled: f64, moving: bool) -> f64 {
    let share = if moving { PLAYER_BOB_SWIMMING } else { 1.0 };
    let phase = std::f64::consts::TAU * f64::from(ticks) / PLAYER_BOB_TICKS;
    PLAYER_BOB_DEPTH * phase.sin() * settled.clamp(0.0, 1.0) * share
}

/// How settled on the surface a body `depth` blocks under the water's top is: `1` right at its
/// float depth and `0` a plunge away from it, which is what the swell is scaled by.
pub fn float_settle(depth: f64) -> f64 {
    (1.0 - (depth - PLAYER_FLOAT_DEPTH).abs() / PLAYER_UNDER_DEPTH).clamp(0.0, 1.0)
}

/// Whether going into the water at `sink` blocks per tick raises a splash.
pub fn splashes(sink: f64) -> bool {
    sink >= PLAYER_SPLASH_MIN_SPEED
}

#[cfg(test)]
#[path = "swim.test.rs"]
mod tests;
