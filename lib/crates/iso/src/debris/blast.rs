//! The blast: every piece of a gathered entity is thrown out from the middle of it, falls, bounces
//! once and lies there until it fades. Everything is a closed-form function of the time since the
//! blast, so the view needs no state beyond that clock, and the same entity always breaks the
//! same way.

use super::parts::{EntityParts, VOXELS_PER_BLOCK, VOXELS_PER_TILE, model_to_grid};
use crate::player::DustRandom;

/// Real milliseconds from the blast until the last piece is gone.
pub const DEBRIS_MS: f64 = 1900.0;

/// Real milliseconds from the blast at which the pieces start to fade and shrink.
pub const DEBRIS_FADE_AT_MS: f64 = 1300.0;

/// Smallest share of its size a piece shrinks to as it goes.
pub const DEBRIS_MIN_SCALE: f64 = 0.55;

/// Blocks per second squared the pieces fall at.
pub const DEBRIS_GRAVITY: f64 = 22.0;

/// Share of its speed a piece keeps when it first hits the ground.
pub const DEBRIS_BOUNCE: f64 = 0.3;

/// Share of its sideways speed a piece keeps through that bounce.
pub const DEBRIS_SLIDE: f64 = 0.4;

/// Columns per second the pieces fly out at, slowest and fastest.
pub const DEBRIS_SPEED: (f64, f64) = (0.8, 2.2);

/// Blocks per second the pieces are thrown up at, lowest and highest; the higher a piece stood,
/// the more it adds.
pub const DEBRIS_THROW: (f64, f64) = (2.4, 4.4);

/// Blocks per second of throw added for each block of height a piece stood at.
pub const DEBRIS_THROW_PER_BLOCK: f64 = 0.35;

/// One piece of an entity in flight: where it stood and how it was thrown. Columns are measured
/// from the centre of the entity's anchor tile, heights in blocks above its base.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fragment {
    /// The index of the piece in `EntityParts::parts`.
    pub part: usize,
    pub start: [f64; 3],
    /// Columns per second along x and y, blocks per second up.
    pub velocity: [f64; 3],
}

/// Where a fragment is and how it looks `ms` after the blast.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pose {
    /// Columns from the anchor's centre and blocks above the base, where the piece stands.
    pub at: [f64; 3],
    /// Share of its size it is drawn at, `1` down to [`DEBRIS_MIN_SCALE`].
    pub scale: f64,
    /// How opaque it is, `1` down to `0`.
    pub alpha: f64,
}

/// The middle of the volume an entity fills, in columns from its anchor tile's centre.
fn middle(parts: &EntityParts) -> (f64, f64) {
    let reach = |tiles: u32| f64::from(tiles.saturating_sub(1)) * VOXELS_PER_TILE / 2.0;
    let point = model_to_grid(reach(parts.tiles[0]), reach(parts.tiles[1]));
    (point.x, point.y)
}

/// Throws every piece of `parts` out from the middle of the entity, scattered by the stream of
/// `seed`.
pub fn blast(parts: &EntityParts, seed: u64) -> Vec<Fragment> {
    let (mid_x, mid_y) = middle(parts);
    let mut random = DustRandom::new(seed);
    let turn = random.roll();
    let count = parts.parts.len().max(1) as f64;
    parts
        .parts
        .iter()
        .enumerate()
        .map(|(index, part)| {
            let ground = model_to_grid(part.at[0], part.at[1]);
            let height = part.at[2] / VOXELS_PER_BLOCK;
            let (mut across, mut up) = (ground.x - mid_x, ground.y - mid_y);
            let length = across.hypot(up);
            // A piece in the very middle goes any way: spread them round so they do not stack.
            let wander = ((index as f64 + turn) / count) * std::f64::consts::TAU;
            if length < 0.05 {
                (across, up) = (wander.cos(), wander.sin());
            } else {
                // A little off straight out, so pieces side by side do not fly in step.
                let skew = (random.roll() - 0.5) * 0.7;
                let (sin, cos) = skew.sin_cos();
                (across, up) = (
                    (across * cos - up * sin) / length,
                    (across * sin + up * cos) / length,
                );
            }
            let speed = DEBRIS_SPEED.0 + (DEBRIS_SPEED.1 - DEBRIS_SPEED.0) * random.roll();
            let throw = DEBRIS_THROW.0
                + (DEBRIS_THROW.1 - DEBRIS_THROW.0) * random.roll()
                + DEBRIS_THROW_PER_BLOCK * height;
            Fragment {
                part: index,
                start: [ground.x, ground.y, height],
                velocity: [across * speed, up * speed, throw],
            }
        })
        .collect()
}

/// Seconds from the blast to the piece first touching the ground, and to its bounce ending.
fn flights(fragment: &Fragment) -> (f64, f64) {
    let [_, _, height] = fragment.start;
    let throw = fragment.velocity[2];
    let first = (throw + (throw * throw + 2.0 * DEBRIS_GRAVITY * height).sqrt()) / DEBRIS_GRAVITY;
    let rebound = (throw - DEBRIS_GRAVITY * first).abs() * DEBRIS_BOUNCE;
    (first, 2.0 * rebound / DEBRIS_GRAVITY)
}

/// Where `fragment` ends up lying, in columns from the anchor's centre: where its bounce ends.
pub fn rest_of(fragment: &Fragment) -> [f64; 2] {
    let (first, second) = flights(fragment);
    let [x, y, _] = fragment.start;
    let [vx, vy, _] = fragment.velocity;
    [
        x + vx * first + vx * DEBRIS_SLIDE * second,
        y + vy * first + vy * DEBRIS_SLIDE * second,
    ]
}

/// How `fragment` looks `ms` after the blast; `None` once it is gone.
pub fn pose_at(fragment: &Fragment, ms: f64) -> Option<Pose> {
    if !(0.0..DEBRIS_MS).contains(&ms) {
        return None;
    }
    let t = ms / 1000.0;
    let [x, y, height] = fragment.start;
    let [vx, vy, throw] = fragment.velocity;
    let (first, second) = flights(fragment);
    let at = if t < first {
        [
            x + vx * t,
            y + vy * t,
            height + throw * t - 0.5 * DEBRIS_GRAVITY * t * t,
        ]
    } else {
        let lands = [x + vx * first, y + vy * first];
        let rebound = (throw - DEBRIS_GRAVITY * first).abs() * DEBRIS_BOUNCE;
        let s = (t - first).min(second);
        [
            lands[0] + vx * DEBRIS_SLIDE * s,
            lands[1] + vy * DEBRIS_SLIDE * s,
            (rebound * s - 0.5 * DEBRIS_GRAVITY * s * s).max(0.0),
        ]
    };
    let (scale, alpha) = look_at(ms)?;
    Some(Pose { at, scale, alpha })
}

/// The share of its size a piece is drawn at and how opaque it is `ms` after the blast; `None`
/// once it is gone.
pub fn look_at(ms: f64) -> Option<(f64, f64)> {
    if !(0.0..DEBRIS_MS).contains(&ms) {
        return None;
    }
    let fade = ((ms - DEBRIS_FADE_AT_MS) / (DEBRIS_MS - DEBRIS_FADE_AT_MS)).clamp(0.0, 1.0);
    Some((1.0 - (1.0 - DEBRIS_MIN_SCALE) * fade, 1.0 - fade))
}

#[cfg(test)]
#[path = "blast.test.rs"]
mod tests;
