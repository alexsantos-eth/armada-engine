//! The shadow the ground casts on itself and on everything standing on it.
//!
//! A sprite's shadow is its silhouette laid along the light ([`super::shadow`]). The ground has
//! no silhouette: it is a height field, and what matters at a point is only whether some column
//! between it and the sun stands high enough to hide it. So the ground is not laid out as a
//! caster at all. Instead a ray is walked back towards the sun from the receiving point, and the
//! highest thing it passes becomes a *horizon*: the elevation the point would have to reach to
//! see the sun again.
//!
//! One walk answers for every height at the same horizontal place, which is what makes this
//! cheap enough to ask per texel of a baked map and per corner of a sprite's lattice: a tree
//! standing in a cliff's shadow is shaded by the same horizon its ground is, read at the tree's
//! own heights.
//!
//! Ported from the TypeScript engine's `core/engine/lighting/terrain-shadow.ts`, including its
//! softening with distance and its surface bias.

use super::shadow::{ShadowProjection, block_height_in_tiles};

/// How far back along the light the ground is searched, in tiles.
///
/// The TypeScript client uses the same reach so that a ray leaves the chunk and takes in its
/// loaded neighbours. Past it a cliff tall enough to still matter would have to be more than
/// twelve tiles of shadow away, which at any authored sun is taller than the world gets.
pub const TERRAIN_RAY_REACH: f64 = 12.0;

/// How far under the horizon a surface has to be before it counts as shaded, in blocks.
///
/// Without it a flat field shades itself: every column is exactly at its own horizon, and the
/// rounding of the walk decides. A twenty-fifth of a block is below anything the eye resolves
/// and above anything the arithmetic produces.
const SURFACE_BIAS: f64 = 0.04;

/// What the ground between a point and the sun comes to.
///
/// `elevation` is the height, in blocks, a receiver at that horizontal point would need in order
/// to be lit; `width` is how many blocks below it the shadow takes to reach full strength, which
/// is what softens a far cliff's edge.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Horizon {
    pub elevation: f64,
    pub width: f64,
}

impl Horizon {
    /// A horizon that shades nothing, for a point the walk never found ground for.
    pub const CLEAR: Self = Self { elevation: f64::NEG_INFINITY, width: 0.1 };

    /// How shaded a receiver `elevation` blocks up is, in `[0, 1]`.
    pub fn coverage(&self, elevation: f64) -> f64 {
        if !self.elevation.is_finite() {
            return 0.0;
        }
        ((self.elevation - elevation - SURFACE_BIAS) / self.width).clamp(0.0, 1.0)
    }
}

/// The drawn heights of an area of ground, ready to be walked along a light ray.
///
/// It holds the area a bake covers plus [`TERRAIN_RAY_REACH`] of margin all round, because the
/// cliff that shades a chunk's edge usually stands in the next chunk.
#[derive(Clone, Debug)]
pub struct HeightField {
    min_x: i32,
    min_y: i32,
    width: i32,
    height: i32,
    /// Drawn top level of each column, or [`f64::NEG_INFINITY`] where there is no ground.
    levels: Vec<f64>,
    highest: f64,
}

impl HeightField {
    /// Reads every column of `min_x..=max_x` by `min_y..=max_y`, grown by the ray's reach.
    ///
    /// `level_at` answers in blocks with the level the column's top is *drawn* at, the same one
    /// a shadow lands on, and `None` where there is no ground at all.
    pub fn new(
        min_x: i32,
        min_y: i32,
        max_x: i32,
        max_y: i32,
        level_at: impl Fn(i32, i32) -> Option<f64>,
    ) -> Self {
        let reach = TERRAIN_RAY_REACH.ceil() as i32 + 1;
        let (min_x, min_y) = (min_x - reach, min_y - reach);
        let (width, height) = (max_x + reach - min_x + 1, max_y + reach - min_y + 1);
        let mut levels = Vec::with_capacity((width.max(0) * height.max(0)) as usize);
        let mut highest = f64::NEG_INFINITY;
        for y in 0..height {
            for x in 0..width {
                let level = level_at(min_x + x, min_y + y).unwrap_or(f64::NEG_INFINITY);
                highest = highest.max(level);
                levels.push(level);
            }
        }
        Self { min_x, min_y, width, height, levels, highest }
    }

    /// Whether no column of the field has any ground, so every walk would come back clear.
    pub fn is_empty(&self) -> bool {
        !self.highest.is_finite()
    }

    fn level(&self, x: i32, y: i32) -> f64 {
        if x < 0 || y < 0 || x >= self.width || y >= self.height {
            return f64::NEG_INFINITY;
        }
        self.levels[(y * self.width + x) as usize]
    }

    /// Walks back towards the sun from the cell under `(px, py)` and returns what it finds.
    ///
    /// `(px, py)` is in world tiles, where the cell `(x, y)` spans `x..x + 1`, so a cell centre
    /// is the half. That is the convention the rest of the lighting uses for a foot.
    ///
    /// The walk steps from one column boundary to the next rather than by a fixed distance:
    /// a fixed step misses the short crossings at a corner, and a shadow then jumps whenever the
    /// first column the ray hits changes between two samples. It stops as soon as even the
    /// tallest ground left could no longer beat what it has, which on open ground is the first
    /// step.
    pub fn horizon(&self, px: f64, py: f64, light: &ShadowProjection, box_height: f64, tile_width: f64) -> Horizon {
        let mut found = Horizon::CLEAR;
        if light.stretch <= 0.0 || self.is_empty() {
            return found;
        }
        // Towards the sun is back along the direction shadows fall.
        let (ray_x, ray_y) = (-light.dir_x, -light.dir_y);
        let (step_x, step_y) = (signum(ray_x), signum(ray_y));
        let mut x = px.floor() as i32 - self.min_x;
        let mut y = py.floor() as i32 - self.min_y;
        let delta_x = if step_x == 0 { f64::INFINITY } else { 1.0 / ray_x.abs() };
        let delta_y = if step_y == 0 { f64::INFINITY } else { 1.0 / ray_y.abs() };
        // The boundary the ray leaves this cell by: the far side going one way, the near
        // side going the other.
        let mut next_x = if step_x == 0 {
            f64::INFINITY
        } else {
            (f64::from(self.min_x + x + step_x.max(0)) - px) / ray_x
        };
        let mut next_y = if step_y == 0 {
            f64::INFINITY
        } else {
            (f64::from(self.min_y + y + step_y.max(0)) - py) / ray_y
        };
        // Blocks of height the light loses over a tile of ground.
        let per_tile = light.stretch * block_height_in_tiles(box_height, tile_width);
        if per_tile <= 0.0 {
            return found;
        }
        let mut distance = 0.0_f64;
        while distance <= TERRAIN_RAY_REACH {
            if x < 0 || y < 0 || x >= self.width || y >= self.height {
                break;
            }
            let elevation = self.level(x, y) - distance / per_tile;
            if elevation > found.elevation {
                // The further the occluder, the softer its edge: a cliff a tile away cuts a
                // hard line, one ten tiles away has a penumbra a fifth of a block deep.
                found = Horizon { elevation, width: 0.1 + distance * 0.02 };
            }
            distance = next_x.min(next_y);
            if self.highest - distance / per_tile <= found.elevation {
                break;
            }
            if next_x == distance {
                x += step_x;
                next_x += delta_x;
            }
            if next_y == distance {
                y += step_y;
                next_y += delta_y;
            }
        }
        found
    }
}

fn signum(value: f64) -> i32 {
    if value > 0.0 {
        1
    } else if value < 0.0 {
        -1
    } else {
        0
    }
}

/// A point in the world a shadow can fall on: a cell position and a height in blocks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShadowPoint {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
}

/// Where a pixel of an upright sprite is in the world, so the ground's horizon can be asked
/// about it.
///
/// The sprite is the same cut-out [`super::shadow::silhouette_matrix`] lays down: it stands on
/// `foot`, faces the sun, and a pixel across it moves across the light, not along world `x`. A
/// pixel above the sprite's own ground point is that much higher in blocks; one below it is on
/// the ground, since artwork drawn under the foot is the part resting on it.
pub fn receiver_point(
    foot: ShadowPoint,
    screen_foot: (f64, f64),
    screen: (f64, f64),
    light: &ShadowProjection,
    tile_width: f64,
    box_height: f64,
) -> ShadowPoint {
    let across = (screen.0 - screen_foot.0) * super::shadow::tiles_per_pixel_across(tile_width);
    ShadowPoint {
        x: foot.x + light.dir_y * across,
        y: foot.y - light.dir_x * across,
        elevation: foot.elevation + (screen_foot.1 - screen.1).max(0.0) / box_height,
    }
}

#[cfg(test)]
#[path = "terrain.test.rs"]
mod tests;
