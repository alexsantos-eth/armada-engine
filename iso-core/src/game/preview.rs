//! A small, fixed world sample for reviewing the new terrain before streaming exists.

use std::collections::HashMap;

use armada_core::grid::{ChunkCoord, WorldCoord, to_chunk_coord};
use armada_core::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator};

/// Diagnostic area where the initial generator shows all four core materials.
pub const PREVIEW_CENTRE: WorldCoord = WorldCoord { x: 16, y: 88 };

pub struct PreviewWorld {
    columns: Vec<TerrainColumn>,
    heights: HashMap<WorldCoord, i32>,
}

impl PreviewWorld {
    pub fn new() -> Self {
        let generator = TerrainGenerator::new(TerrainConfig::default())
            .expect("default terrain configuration is valid");
        let mut columns = Vec::with_capacity(4 * 32 * 32);
        let centre_chunk = to_chunk_coord(PREVIEW_CENTRE);
        for cx in centre_chunk.cx..=centre_chunk.cx + 1 {
            for cy in centre_chunk.cy..=centre_chunk.cy + 1 {
                columns.extend(generator.generate_chunk(ChunkCoord { cx, cy }));
            }
        }
        // Farther columns are drawn first, so their near neighbours cover them.
        columns.sort_by(|a, b| {
            (b.coord.x + b.coord.y)
                .cmp(&(a.coord.x + a.coord.y))
                .then_with(|| a.coord.x.cmp(&b.coord.x))
        });
        let heights = columns
            .iter()
            .map(|column| (column.coord, column.elevation))
            .collect();
        Self { columns, heights }
    }

    pub fn columns(&self) -> &[TerrainColumn] {
        &self.columns
    }

    pub fn elevation_at(&self, point: WorldCoord) -> Option<i32> {
        self.heights.get(&point).copied()
    }
}

#[cfg(test)]
#[path = "preview.test.rs"]
mod tests;
