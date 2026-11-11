//! Wind: the horizontal lean of a swaying sprite (a tree's canopy) as a pure function of
//! real time, its own parameters and the strength of the wind over its column.

use crate::entities::EntitySway;
use crate::terrain::derive_seed;

/// Strength of the wind when nothing else says (no biomes content loaded): every sway at its
/// authored amplitude amplified like the old default (1.5×).
pub const DEFAULT_WIND_STRENGTH: f64 = 1.5;

/// Weight of the second, faster wave in [`sway_offset`]: what keeps a sway from ticking like
/// a metronome.
pub const SWAY_GUST_WEIGHT: f64 = 0.3;

/// How much faster the second wave of [`sway_offset`] is than the first.
pub const SWAY_GUST_RATE: f64 = 2.3;

/// Phase (radians, in `[0, 2π)`) of the swaying entity with this instance id: a hash of it, so
/// two neighbouring trees do not lean together and an entity leans the same way whenever it is
/// shown. View state: never saved, never affects the world.
pub fn sway_phase(id: &str) -> f64 {
    let hash = derive_seed(0, &format!("sway@{id}"));
    (hash as f64 / 18_446_744_073_709_551_616.0) * 2.0 * std::f64::consts::PI
}

/// How far the top of a swaying sprite leans sideways, in world pixels (positive to the right),
/// at `time_ms`: a main wave of `sway.period` plus [`SWAY_GUST_WEIGHT`] of another wave
/// [`SWAY_GUST_RATE`] times faster, shifted by `phase` ([`sway_phase`]), never past
/// `sway.amplitude × strength`. Pure: the same arguments give the same lean.
pub fn sway_offset(sway: &EntitySway, phase: f64, time_ms: f64, strength: f64) -> f64 {
    let angle = 2.0 * std::f64::consts::PI * time_ms / sway.period + phase;
    let wave = (1.0 - SWAY_GUST_WEIGHT) * angle.sin()
        + SWAY_GUST_WEIGHT * (SWAY_GUST_RATE * angle + phase).sin();
    sway.amplitude * strength * wave
}

#[cfg(test)]
#[path = "wind.test.rs"]
mod tests;
