//! The shadow the ground casts on itself and on everything standing on it.

use super::shadow::{ShadowProjection, block_height_in_tiles};

/// How far back along the light the ground is searched, in tiles.
pub const TERRAIN_RAY_REACH: f64 = 12.0;

/// How far under the horizon a surface has to be before it counts as shaded, in blocks.
const SURFACE_BIAS: f64 = 0.04;

/// What the ground between a point and the sun comes to.
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
    pub fn horizon(&self, px: f64, py: f64, light: &ShadowProjection, box_height: f64, tile_width: f64) -> Horizon {
        let mut found = Horizon::CLEAR;
        if light.stretch <= 0.0 || self.is_empty() {
            return found;
        }
        let (ray_x, ray_y) = (-light.dir_x, -light.dir_y);
        let (step_x, step_y) = (signum(ray_x), signum(ray_y));
        let mut x = px.floor() as i32 - self.min_x;
        let mut y = py.floor() as i32 - self.min_y;
        let delta_x = if step_x == 0 { f64::INFINITY } else { 1.0 / ray_x.abs() };
        let delta_y = if step_y == 0 { f64::INFINITY } else { 1.0 / ray_y.abs() };
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
