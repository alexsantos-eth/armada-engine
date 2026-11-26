//! How a heap on the ground is shown: tossed out of what dropped it in a short arc, then bobbing
//! over its shadow until it is picked up. View state only; the heaps themselves are
//! `iso::drops`.
//!
//! The motion is pure and tested in `drop_view.test.rs`; `Game::collect_drops` draws it.

use std::collections::HashMap;

use iso::drops::Drop;
use iso::projection::GridPoint;

/// Real milliseconds a heap flies from what dropped it to where it lands.
pub(crate) const TOSS_MS: f64 = 380.0;
/// Blocks the toss rises at its top.
pub(crate) const TOSS_HEIGHT: f64 = 0.6;
/// Blocks a landed heap bobs up to.
pub(crate) const BOB_LIFT: f64 = 0.08;
/// Real milliseconds of one bob.
pub(crate) const BOB_MS: f64 = 1400.0;
/// Blocks a floating voxel piece hovers above the ground: it stays up in the air, unlike a heap.
pub(crate) const PIECE_HOVER: f64 = 0.3;

/// Where a heap is drawn: its point on the ground and how far above it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct DropPose {
    pub(crate) at: GridPoint,
    pub(crate) lift: f64,
}

/// The pose of `drop` `age_ms` after it was dropped.
pub(crate) fn toss(age_ms: f64, drop: &Drop) -> DropPose {
    if age_ms < TOSS_MS {
        let t = (age_ms / TOSS_MS).max(0.0);
        return DropPose {
            at: GridPoint {
                x: drop.from.x + (drop.at.x - drop.from.x) * t,
                y: drop.from.y + (drop.at.y - drop.from.y) * t,
            },
            lift: 4.0 * TOSS_HEIGHT * t * (1.0 - t),
        };
    }
    let hover = if drop.piece.is_some() {
        PIECE_HOVER
    } else {
        0.0
    };
    let phase = (drop.id % 7) as f64 / 7.0;
    let wave = ((age_ms - TOSS_MS) / BOB_MS + phase) * std::f64::consts::TAU;
    DropPose {
        at: drop.at,
        lift: hover + BOB_LIFT * (0.5 - 0.5 * wave.cos()),
    }
}

/// How long each heap on show has been on the ground, in real milliseconds.
#[derive(Clone, Debug, Default)]
pub(crate) struct DropViews {
    ages: HashMap<u64, f64>,
}

impl DropViews {
    /// Views of heaps that were already lying there (a save reopened): none of them flies in.
    pub(crate) fn landed(drops: &[Drop]) -> Self {
        Self {
            ages: drops.iter().map(|drop| (drop.id, TOSS_MS)).collect(),
        }
    }

    /// Ages the heaps in `drops` by `elapsed_ms`; a new one starts its toss, a gone one is
    /// forgotten. Returns how many heaps ended their toss on the ground in this call, for the
    /// sound of them landing.
    pub(crate) fn advance(&mut self, elapsed_ms: f64, drops: &[Drop]) -> usize {
        self.ages
            .retain(|id, _| drops.iter().any(|drop| drop.id == *id));
        let mut landed = 0;
        for drop in drops {
            let age = self.ages.entry(drop.id).or_insert(-elapsed_ms);
            let before = *age;
            *age += elapsed_ms.max(0.0);
            if before < TOSS_MS && *age >= TOSS_MS {
                landed += 1;
            }
        }
        landed
    }

    /// How long heap `id` has been on the ground; `0.0` for one it does not hold.
    pub(crate) fn age(&self, id: u64) -> f64 {
        self.ages.get(&id).copied().unwrap_or(0.0)
    }
}

#[cfg(test)]
#[path = "drop_view.test.rs"]
mod tests;
