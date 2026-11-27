//! The fall: a piece of a gathered entity as a body that obeys the terrain. It is thrown, falls
//! with gravity, bounces off the top of the column it lands on (a lower level, the sand, the
//! water), is turned back by a column taller than where it flies, and comes to rest. Stepped at a
//! fixed rate, so the same blast over the same ground always ends the same way.

use super::blast::{DEBRIS_BOUNCE, DEBRIS_GRAVITY, DEBRIS_SLIDE, Fragment};

/// Seconds of one step of the fall.
pub const FALL_STEP: f64 = 1.0 / 120.0;

/// Seconds after which a piece that has not settled is put to rest where it is.
pub const FALL_LIMIT: f64 = 4.0;

/// Blocks per second under which a bounce is not a bounce: the piece lies there.
pub const REST_SPEED: f64 = 0.9;

/// Share of its sideways speed a piece keeps when it hits a taller column and is turned back.
pub const WALL_BOUNCE: f64 = 0.35;

/// Share of its sideways speed a piece keeps when it lands in water, which takes it all but a
/// drift.
pub const WATER_DRAG: f64 = 0.15;

/// What the piece finds under one column: how high its top is and whether it is water.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Floor {
    /// Blocks above sea level of the column's top.
    pub top: f64,
    pub water: bool,
}

/// A piece in flight: columns along x and y and blocks above sea level, in the scene's own
/// coordinates (the tile `(i, j)` spans `i..i + 1`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Body {
    pub at: [f64; 3],
    pub velocity: [f64; 3],
    /// Whether it has come to rest.
    pub resting: bool,
    /// Whether it rests on water.
    pub afloat: bool,
    /// Seconds it has been falling.
    pub age: f64,
}

/// The column the point `(x, y)` is over.
fn cell(x: f64, y: f64) -> (i32, i32) {
    (x.floor() as i32, y.floor() as i32)
}

impl Body {
    /// The body of `fragment` thrown from the tile centred at `origin`, whose entity stood on the
    /// block `base`.
    pub fn thrown(fragment: &Fragment, origin: [f64; 2], base: f64) -> Self {
        Self {
            at: [
                origin[0] + fragment.start[0],
                origin[1] + fragment.start[1],
                base + fragment.start[2],
            ],
            velocity: fragment.velocity,
            resting: false,
            afloat: false,
            age: 0.0,
        }
    }

    /// Advances the fall by one [`FALL_STEP`] over `ground`, which tells what each column holds
    /// (`None` where the world is not there).
    pub fn step(&mut self, ground: &dyn Fn(i32, i32) -> Option<Floor>) {
        if self.resting {
            return;
        }
        self.age += FALL_STEP;
        let (i, j) = cell(self.at[0], self.at[1]);
        let Some(here) = ground(i, j) else {
            // Over a world that is not there: it lies where it is.
            self.settle(Floor {
                top: self.at[2],
                water: false,
            });
            return;
        };
        if self.at[2] < here.top {
            // Born inside a column taller than the piece's own: it is on top of it.
            self.at[2] = here.top;
        }
        self.velocity[2] -= DEBRIS_GRAVITY * FALL_STEP;
        for axis in 0..2 {
            let mut next = self.at;
            next[axis] += self.velocity[axis] * FALL_STEP;
            let (i, j) = cell(next[0], next[1]);
            let wall = ground(i, j).is_none_or(|floor| floor.top > self.at[2]);
            if wall {
                self.velocity[axis] = -self.velocity[axis] * WALL_BOUNCE;
            } else {
                self.at[axis] = next[axis];
            }
        }
        let (i, j) = cell(self.at[0], self.at[1]);
        let below = ground(i, j).unwrap_or(here);
        let height = self.at[2] + self.velocity[2] * FALL_STEP;
        if height > below.top || self.velocity[2] > 0.0 {
            self.at[2] = height.max(below.top);
        } else {
            self.at[2] = below.top;
            self.land(below);
        }
        if self.age >= FALL_LIMIT {
            self.settle(below);
        }
    }

    /// Hits the top of a column: water takes the piece, anything else bounces it once or twice.
    fn land(&mut self, floor: Floor) {
        if floor.water {
            self.velocity[0] *= WATER_DRAG;
            self.velocity[1] *= WATER_DRAG;
            self.settle(floor);
            return;
        }
        let rebound = -self.velocity[2] * DEBRIS_BOUNCE;
        self.velocity[0] *= DEBRIS_SLIDE;
        self.velocity[1] *= DEBRIS_SLIDE;
        if rebound < REST_SPEED {
            self.settle(floor);
        } else {
            self.velocity[2] = rebound;
        }
    }

    fn settle(&mut self, floor: Floor) {
        self.velocity = [0.0; 3];
        self.resting = true;
        self.afloat = floor.water;
    }
}

/// Lets `fragment` fly from the tile centred at `origin` (its entity on the block `base`) until it
/// comes to rest over `ground`, and returns where it lies.
pub fn settle(
    fragment: &Fragment,
    origin: [f64; 2],
    base: f64,
    ground: &dyn Fn(i32, i32) -> Option<Floor>,
) -> Body {
    let mut body = Body::thrown(fragment, origin, base);
    while !body.resting {
        body.step(ground);
    }
    body
}

#[cfg(test)]
#[path = "fall.test.rs"]
mod tests;
