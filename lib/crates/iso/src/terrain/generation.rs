//! Tunable first terrain generator. Saved chunks store results rather than relying on seed replay.

use super::columns::{TerrainColumn, TerrainMaterial};
use super::noise::value_noise;
use crate::grid::{ChunkCoord, WorldCoord, chunk_rect};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TerrainConfig {
    /// Repeats a chosen landscape for testing; saved worlds keep materialized chunks.
    pub seed: u64,
    /// Lowest and highest top elevation; zero is the shore, negative is water.
    pub min_elevation: i32,
    pub max_elevation: i32,
    /// Sampling distances in world columns.
    pub height_scale: f64,
    pub detail_scale: f64,
    /// Higher values produce fewer bare-ground patches.
    pub ground_threshold: f64,
}

impl Default for TerrainConfig {
    fn default() -> Self {
        Self {
            seed: 1337,
            min_elevation: -3,
            max_elevation: 4,
            height_scale: 48.0,
            detail_scale: 16.0,
            ground_threshold: 0.74,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InvalidTerrainConfig;

impl TerrainConfig {
    pub fn validate(self) -> Result<Self, InvalidTerrainConfig> {
        if self.min_elevation < -128
            || self.max_elevation > 128
            || self.min_elevation >= 0
            || self.max_elevation < 1
            || self.min_elevation >= self.max_elevation
            || !self.height_scale.is_finite()
            || self.height_scale < 1.0
            || !self.detail_scale.is_finite()
            || self.detail_scale < 1.0
            || !self.ground_threshold.is_finite()
            || !(0.0..=1.0).contains(&self.ground_threshold)
        {
            Err(InvalidTerrainConfig)
        } else {
            Ok(self)
        }
    }
}

pub struct TerrainGenerator {
    config: TerrainConfig,
}

impl TerrainGenerator {
    pub fn new(config: TerrainConfig) -> Result<Self, InvalidTerrainConfig> {
        Ok(Self {
            config: config.validate()?,
        })
    }

    /// Height at an absolute world column, independent of chunk traversal order.
    pub fn height_at(&self, coord: WorldCoord) -> i32 {
        let x = f64::from(coord.x);
        let y = f64::from(coord.y);
        let broad = value_noise(self.config.seed, x, y, self.config.height_scale);
        let detail = value_noise(
            self.config.seed ^ 0xa39e_51bf_0d27_6c42,
            x,
            y,
            self.config.detail_scale,
        );
        let value = (0.76 * broad + 0.24 * detail).clamp(0.0, 1.0);
        let span = f64::from(self.config.max_elevation - self.config.min_elevation + 1);
        (f64::from(self.config.min_elevation) + (value * span).floor()).clamp(
            f64::from(self.config.min_elevation),
            f64::from(self.config.max_elevation),
        ) as i32
    }

    pub fn column_at(&self, coord: WorldCoord) -> TerrainColumn {
        let elevation = self.height_at(coord);
        let surface = if elevation < 0 {
            TerrainMaterial::Water
        } else if elevation == 0
            || (elevation == 1
                && [(-1, 0), (1, 0), (0, -1), (0, 1)].iter().any(|(dx, dy)| {
                    self.height_at(WorldCoord {
                        x: coord.x.saturating_add(*dx),
                        y: coord.y.saturating_add(*dy),
                    }) < 0
                }))
        {
            TerrainMaterial::Sand
        } else if value_noise(
            self.config.seed ^ 0x70fa_c41e_392b_9d68,
            f64::from(coord.x),
            f64::from(coord.y),
            12.0,
        ) > self.config.ground_threshold
        {
            TerrainMaterial::Ground
        } else {
            TerrainMaterial::Grass
        };
        TerrainColumn {
            coord,
            elevation: elevation + self.shore_step(coord, elevation, surface),
            surface,
            walkable: surface != TerrainMaterial::Water,
        }
    }

    /// One extra block of sand under the last row of beach before the land steps up, or none.
    ///
    /// Sand is drawn as a shallow slab, about two thirds of a block below the plane its
    /// elevation names, so the first step up from a beach read as one and a half blocks and
    /// looked like a wall. This gives that row a second block of sand, splitting the climb in
    /// two: the beach stays a single block of sand and only the row against the step is double.
    ///
    /// Only where nothing around the row is lower, so the beach never grows a two-block cliff
    /// over the sea, and only from the raw heights, so a raised row never lifts the row behind
    /// it in turn.
    fn shore_step(&self, coord: WorldCoord, elevation: i32, surface: TerrainMaterial) -> i32 {
        if surface != TerrainMaterial::Sand {
            return 0;
        }
        let around = [(-1, 0), (1, 0), (0, -1), (0, 1)].map(|(dx, dy)| {
            self.height_at(WorldCoord {
                x: coord.x.saturating_add(dx),
                y: coord.y.saturating_add(dy),
            })
        });
        let steps_up = around.iter().any(|height| *height > elevation);
        let nothing_lower = around.iter().all(|height| *height >= elevation);
        i32::from(steps_up && nothing_lower)
    }

    /// Columns in x-major order, including chunk boundaries and signed coordinates.
    pub fn generate_chunk(&self, chunk: ChunkCoord) -> Vec<TerrainColumn> {
        let rect = chunk_rect(chunk);
        let mut columns = Vec::with_capacity(32 * 32);
        for x in rect.min_x..=rect.max_x {
            for y in rect.min_y..=rect.max_y {
                columns.push(self.column_at(WorldCoord { x, y }));
            }
        }
        columns
    }
}

#[cfg(test)]
#[path = "generation.test.rs"]
mod tests;
