//! A small, fixed world sample for reviewing the new terrain before streaming exists.

use armada_core::grid::{ChunkCoord, WorldCoord, to_chunk_coord};
use armada_core::scene_order::{DrawKey, LengthAxis, compare_draw_keys, get_draw_depth};
use armada_core::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator};
use armada_core::world::TerrainWorld;

/// Diagnostic area where the initial generator shows all four core materials.
pub const PREVIEW_CENTRE: WorldCoord = WorldCoord { x: 16, y: 88 };
/// Tile height used by the diagnostic projection and its draw-depth keys.
pub const PREVIEW_TILE_HEIGHT: f64 = 40.0;

pub struct PreviewWorld {
    columns: Vec<TerrainColumn>,
    world: TerrainWorld,
}

impl PreviewWorld {
    pub fn new() -> Self {
        let generator = TerrainGenerator::new(TerrainConfig::default())
            .expect("default terrain configuration is valid");
        let mut world = TerrainWorld::new(generator);
        let centre_chunk = to_chunk_coord(PREVIEW_CENTRE);
        for cx in centre_chunk.cx..=centre_chunk.cx + 1 {
            for cy in centre_chunk.cy..=centre_chunk.cy + 1 {
                world.show_chunk(ChunkCoord { cx, cy });
            }
        }
        let mut columns: Vec<_> = world
            .visible_chunks()
            .into_iter()
            .flat_map(|coord| world.chunk(coord).unwrap().iter().copied())
            .collect();
        // Use the same pure depth rule as the TypeScript scene.
        columns.sort_by(|a, b| {
            let key = |column: &TerrainColumn| DrawKey {
                depth: get_draw_depth(
                    -(PREVIEW_TILE_HEIGHT / 2.0) * f64::from(column.coord.x + column.coord.y + 1),
                    f64::from(column.elevation),
                    f64::from(column.coord.x),
                    PREVIEW_TILE_HEIGHT,
                    0,
                    LengthAxis::X,
                ),
                layer: 0,
            };
            compare_draw_keys(&key(a), &key(b))
        });
        Self { columns, world }
    }

    pub fn columns(&self) -> &[TerrainColumn] {
        &self.columns
    }

    pub fn elevation_at(&self, point: WorldCoord) -> Option<i32> {
        self.world.column_at(point).map(|column| column.elevation)
    }
}

#[cfg(test)]
#[path = "preview.test.rs"]
mod tests;
