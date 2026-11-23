//! How loud the world sounds from where the player stands: the fall-off with distance, the
//! mixing of several sources of one kind, the easing of a bed from one level to the next, and
//! the levels of the wind and the birds. Pure: the client gathers the sources and plays them.

use crate::ai::NpcKind;
use crate::lighting::BakePhase;
use crate::npc::Npc;
use crate::projection::GridPoint;

use super::audio::SoundEvent;

/// Columns within which a source sounds at its full volume.
pub const HEARING_NEAR: f64 = 1.5;
/// Columns beyond which a source is not heard at all.
pub const HEARING_FAR: f64 = 12.0;
/// Real milliseconds a bed takes to cover half the way to a new level, so that sources coming
/// on screen or a gust swell in instead of jumping.
pub const AMBIENT_EASE_HALF_LIFE_MS: f64 = 180.0;
/// What one tree adds to the birdsong at its full volume: a stand of trees sings, one tree
/// barely does.
pub const BIRDS_PER_TREE: f64 = 0.22;
/// Geyser level while it only steams, as a share of its level at the height of a burst.
pub const GEYSER_QUIET: f64 = 0.3;

/// How loud a source `distance` columns away sounds, from `1.0` within [`HEARING_NEAR`] down to
/// `0.0` at [`HEARING_FAR`], falling off with the square of the way left.
pub fn distance_gain(distance: f64) -> f64 {
    if !distance.is_finite() || distance >= HEARING_FAR {
        return 0.0;
    }
    if distance <= HEARING_NEAR {
        return 1.0;
    }
    let left = (HEARING_FAR - distance) / (HEARING_FAR - HEARING_NEAR);
    left * left
}

/// Columns between two points of the grid.
pub fn distance(a: GridPoint, b: GridPoint) -> f64 {
    (a.x - b.x).hypot(a.y - b.y)
}

/// The level of several sources of one kind heard together: each adds to the rest without the
/// sum ever passing `1.0` (`1 - Π(1 - g)`), so two fires are louder than one but ten are not
/// ten times louder.
pub fn combined(gains: impl IntoIterator<Item = f64>) -> f64 {
    1.0 - gains
        .into_iter()
        .map(|gain| 1.0 - gain.clamp(0.0, 1.0))
        .product::<f64>()
}

/// A bed's level `elapsed_ms` after it was at `current`, on its way to `target`.
pub fn ease_volume(current: f64, target: f64, elapsed_ms: f64) -> f64 {
    let keep = 0.5_f64.powf(elapsed_ms.max(0.0) / AMBIENT_EASE_HALF_LIFE_MS);
    target + (current - target) * keep
}

/// How loud the wind blows for a biome of `strength` (its `windStrength`, about 1.5 to 5), with
/// slow gusts over real time `time_ms`.
pub fn wind_level(strength: f64, time_ms: f64) -> f64 {
    let base = ((strength - 0.5) / 8.0).clamp(0.05, 0.5);
    let gust = 0.5 + 0.5 * (time_ms / 4100.0).sin() * (time_ms / 2300.0 + 1.3).sin();
    (base * (0.6 + 0.6 * gust)).clamp(0.0, 1.0)
}

/// How much the birds sing in `phase`: most at dawn, less through the day, a few at sunset and
/// none at night.
pub fn bird_level(phase: BakePhase) -> f64 {
    match phase {
        BakePhase::Dawn => 1.0,
        BakePhase::Day => 0.7,
        BakePhase::Sunset => 0.4,
        BakePhase::Night => 0.0,
    }
}

/// A geyser's level from its distance gain and how hard it is blowing (`0.0..=1.0`).
pub fn geyser_level(gain: f64, blow: f64) -> f64 {
    gain * (GEYSER_QUIET + (1.0 - GEYSER_QUIET) * blow.clamp(0.0, 1.0))
}

/// The sound an animal of `kind` makes when it sets a step down.
pub fn footfall_of(kind: NpcKind) -> SoundEvent {
    match kind {
        NpcKind::Rabbit => SoundEvent::RabbitHop,
        NpcKind::Crab => SoundEvent::CrabStep,
    }
}

/// The footfalls of the animals that set a step down since `before` (their ids and
/// [`Npc::footfalls`] then), heard from `listener`: one sound per kind, at the volume of the
/// nearest, so a crowd does not stack up into a roar. Ones out of hearing are left out.
pub fn footfall_sounds<'a>(
    before: &[(u64, u32)],
    npcs: impl IntoIterator<Item = &'a Npc>,
    listener: GridPoint,
) -> Vec<(SoundEvent, f64)> {
    let mut sounds: Vec<(SoundEvent, f64)> = Vec::new();
    for npc in npcs {
        let stepped = before
            .iter()
            .find(|(id, _)| *id == npc.id)
            .is_some_and(|(_, footfalls)| *footfalls != npc.footfalls);
        if !stepped {
            continue;
        }
        let gain = distance_gain(distance(npc.position(), listener));
        if gain <= 0.0 {
            continue;
        }
        let event = footfall_of(npc.kind);
        match sounds.iter_mut().find(|(known, _)| *known == event) {
            Some((_, loudest)) => *loudest = loudest.max(gain),
            None => sounds.push((event, gain)),
        }
    }
    sounds
}

#[cfg(test)]
#[path = "soundscape.test.rs"]
mod tests;
