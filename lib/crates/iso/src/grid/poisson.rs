//! Blue-noise scatter over the world's columns: a Poisson disk sampling that no order can change.
//!
//! The world is cut into blocks of `step` columns; every block carries one candidate column and
//! one priority, both derived from its own coordinates. A candidate survives when no stronger
//! candidate stands within the radius the caller asks for. Nothing depends on which area was
//! asked for, so a chunk scatters the same alone as beside its neighbours.
//!
//! The radius is the distance the scatter keeps clear, not the distance it aims for: a kept
//! sample is a local maximum of priority inside its own radius, so the samples thin out to
//! roughly one per circle of that radius instead of packing against each other. That is the
//! price of deciding every column on its own, and it is what keeps a chunk self-contained.

use crate::grid::{WorldCoord, WorldRect};
use crate::terrain::{derive_seed, noise::lattice_at};

/// A deterministic blue-noise scatter of columns.
#[derive(Clone, Debug)]
pub struct PoissonScatter {
    candidate: u64,
    priority: u64,
    step: i32,
    max_radius: f64,
}

/// One block's candidate: the column it offers and how strongly it holds it.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Candidate {
    at: WorldCoord,
    priority: f64,
}

impl PoissonScatter {
    /// A scatter of the world of `seed` on the stream `label`, offering one candidate per block
    /// of `step` columns and never letting a sample reach farther than `max_radius`.
    pub fn new(seed: u64, label: &str, step: i32, max_radius: f64) -> Self {
        Self {
            candidate: derive_seed(seed, &format!("{label}:candidate")),
            priority: derive_seed(seed, &format!("{label}:priority")),
            step: step.max(1),
            max_radius: max_radius.max(1.0),
        }
    }

    /// The candidate column of the block `(bx, by)`.
    fn candidate_of(&self, bx: i32, by: i32) -> Candidate {
        let key_x = i64::from(bx);
        let key_y = i64::from(by);
        let span = f64::from(self.step);
        let offset =
            |stream: u64, salt: i64| (lattice_at(stream, key_x + salt, key_y) * span) as i32;
        Candidate {
            at: WorldCoord {
                x: bx * self.step + offset(self.candidate, 0).min(self.step - 1),
                y: by * self.step + offset(self.candidate, 7_919).min(self.step - 1),
            },
            priority: lattice_at(self.priority, key_x, key_y),
        }
    }

    /// Whether `one` yields to `other`: the stronger priority wins, and a tie is broken by the
    /// column itself so that two blocks never both yield or both stand.
    fn yields_to(one: &Candidate, other: &Candidate) -> bool {
        (other.priority, other.at.x, other.at.y) > (one.priority, one.at.x, one.at.y)
    }

    /// Every column of `area` the scatter keeps, in block order. `radius_at` is the spacing the
    /// caller demands around a column, or `None` for a column it refuses altogether: a refused
    /// column is no candidate, so it neither stands nor pushes its neighbours away. A pair is
    /// kept apart by the wider of their two radii, so the rule reads the same from either side.
    pub fn samples_in(
        &self,
        area: WorldRect,
        radius_at: impl Fn(WorldCoord) -> Option<f64>,
    ) -> Vec<WorldCoord> {
        let reach = (self.max_radius / f64::from(self.step)).ceil() as i32 + 1;
        let first_x = area.min_x.div_euclid(self.step);
        let last_x = area.max_x.div_euclid(self.step);
        let first_y = area.min_y.div_euclid(self.step);
        let last_y = area.max_y.div_euclid(self.step);
        let mut kept = Vec::new();
        for bx in first_x..=last_x {
            for by in first_y..=last_y {
                let candidate = self.candidate_of(bx, by);
                if candidate.at.x < area.min_x
                    || candidate.at.x > area.max_x
                    || candidate.at.y < area.min_y
                    || candidate.at.y > area.max_y
                {
                    continue;
                }
                if self.stands(candidate, reach, &radius_at) {
                    kept.push(candidate.at);
                }
            }
        }
        kept
    }

    /// Whether the candidate survives every stronger candidate around it.
    fn stands(
        &self,
        candidate: Candidate,
        reach: i32,
        radius_at: &impl Fn(WorldCoord) -> Option<f64>,
    ) -> bool {
        let Some(own_radius) = radius_at(candidate.at) else {
            return false;
        };
        let block_x = candidate.at.x.div_euclid(self.step);
        let block_y = candidate.at.y.div_euclid(self.step);
        for dx in -reach..=reach {
            for dy in -reach..=reach {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let other = self.candidate_of(block_x + dx, block_y + dy);
                if !Self::yields_to(&candidate, &other) {
                    continue;
                }
                let Some(other_radius) = radius_at(other.at) else {
                    continue;
                };
                let distance = f64::from(candidate.at.x - other.at.x)
                    .hypot(f64::from(candidate.at.y - other.at.y));
                if distance < own_radius.max(other_radius) {
                    return false;
                }
            }
        }
        true
    }
}

#[cfg(test)]
#[path = "poisson.test.rs"]
mod tests;
