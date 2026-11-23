//! What a blow does to the view: the struck entity shakes for a moment, and chips burst where
//! the hands land; a felling throws a bigger burst. View state only: nothing here is saved or
//! reaches the simulation.
//!
//! Everything here is pure and tested in `impact.test.rs`; the scene reads the shake when it lays
//! the entities out and hands the bursts to the dust (`DustPuffs::chip`).

use iso::grid::WorldCoord;
use iso::harvest::HarvestTarget;

/// Real milliseconds a struck entity shakes for.
pub(crate) const SHAKE_MS: f64 = 260.0;
/// Widest the shake throws the sprite sideways, as a share of the tile's width.
pub(crate) const SHAKE_AMPLITUDE: f64 = 0.05;
/// Swings to and fro the shake makes before it dies.
pub(crate) const SHAKE_SWINGS: f64 = 3.0;

/// A burst of chips the dust is due to raise.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Burst {
    pub(crate) anchor: WorldCoord,
    pub(crate) elevation: i32,
    /// The colour of the item it yields, if it declares one.
    pub(crate) color: Option<u32>,
    /// Whether this is the last blow, the target giving way.
    pub(crate) felled: bool,
}

/// What a step's blow did, for the sound it makes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Blow {
    /// A new blow landed on what is being struck.
    Strike,
    /// What was being struck gave way.
    Felled,
}

/// The shakes and bursts in flight.
#[derive(Clone, Debug, Default)]
pub(crate) struct Impacts {
    seen_strikes: u64,
    shake: Option<(String, f64)>,
    bursts: Vec<Burst>,
}

/// Sideways offset of a shaking sprite with `left_ms` of its shake to go, as a share of the
/// tile's width: a sine that starts and ends still and dies away as it goes.
pub(crate) fn shake_offset(left_ms: f64) -> f64 {
    let left = (left_ms / SHAKE_MS).clamp(0.0, 1.0);
    let gone = 1.0 - left;
    SHAKE_AMPLITUDE * left * (gone * SHAKE_SWINGS * std::f64::consts::TAU).sin()
}

impl Impacts {
    /// Takes the harvester's count of blows landed, what is being struck, what was felled this
    /// step and the colour of what it yields; a new blow shakes the target and queues a burst.
    /// Returns the blow it noticed, if any.
    pub(crate) fn notice(
        &mut self,
        strikes: u64,
        struck: Option<&HarvestTarget>,
        felled: Option<&HarvestTarget>,
        color: Option<u32>,
    ) -> Option<Blow> {
        let landed = strikes > self.seen_strikes;
        self.seen_strikes = strikes;
        if let Some(target) = felled {
            self.bursts.push(Burst {
                anchor: target.anchor,
                elevation: target.elevation,
                color,
                felled: true,
            });
            self.shake = None;
            return Some(Blow::Felled);
        }
        if let (true, Some(target)) = (landed, struck) {
            self.shake = Some((target.id.clone(), SHAKE_MS));
            self.bursts.push(Burst {
                anchor: target.anchor,
                elevation: target.elevation,
                color,
                felled: false,
            });
            return Some(Blow::Strike);
        }
        None
    }

    /// Ages the shake by `elapsed_ms` of real time.
    pub(crate) fn advance(&mut self, elapsed_ms: f64) {
        if let Some((_, left)) = self.shake.as_mut() {
            *left -= elapsed_ms.max(0.0);
        }
        if self.shake.as_ref().is_some_and(|(_, left)| *left <= 0.0) {
            self.shake = None;
        }
    }

    /// The sideways offset of entity `id`, as a share of the tile's width, while it shakes.
    pub(crate) fn shake_of(&self, id: &str) -> Option<f64> {
        self.shake
            .as_ref()
            .filter(|(shaking, _)| shaking == id)
            .map(|(_, left)| shake_offset(*left))
    }

    /// The bursts due, emptied out.
    pub(crate) fn take_bursts(&mut self) -> Vec<Burst> {
        std::mem::take(&mut self.bursts)
    }
}

#[cfg(test)]
#[path = "impact.test.rs"]
mod tests;
