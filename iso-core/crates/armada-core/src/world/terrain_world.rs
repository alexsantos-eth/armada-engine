//! Discovered terrain remains owned by the world when a chunk leaves the view.

use std::collections::{HashMap, HashSet};

use crate::grid::{CHUNK_SIZE, ChunkCoord, WorldCoord, to_chunk_coord, to_local_coord};
use crate::terrain::{TerrainColumn, TerrainGenerator, TerrainMaterial};

/// An edit can only change a column that has already been materialized.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EditError {
    Undiscovered(ChunkCoord),
    InvalidSurface,
}

/// Owns discovered terrain independently from the set currently shown by a client.
pub struct TerrainWorld {
    generator: TerrainGenerator,
    discovered: HashMap<ChunkCoord, Vec<TerrainColumn>>,
    visible: HashSet<ChunkCoord>,
}

impl TerrainWorld {
    pub fn new(generator: TerrainGenerator) -> Self {
        Self {
            generator,
            discovered: HashMap::new(),
            visible: HashSet::new(),
        }
    }

    /// Injects a previously saved chunk's terrain, bypassing generation. Used when restoring
    /// a save. Returns true only when the chunk was not already discovered.
    pub fn load_chunk(&mut self, coord: ChunkCoord, columns: Vec<TerrainColumn>) -> bool {
        let newly_discovered = !self.discovered.contains_key(&coord);
        if newly_discovered {
            self.discovered.insert(coord, columns);
        }
        self.visible.insert(coord);
        newly_discovered
    }

    /// Materializes a chunk at most once. Returns true only for first discovery.
    pub fn show_chunk(&mut self, coord: ChunkCoord) -> bool {
        let newly_discovered = if self.discovered.contains_key(&coord) {
            false
        } else {
            self.discovered
                .insert(coord, self.generator.generate_chunk(coord));
            true
        };
        self.visible.insert(coord);
        newly_discovered
    }

    /// Removes presentation visibility without discarding discovered terrain.
    pub fn hide_chunk(&mut self, coord: ChunkCoord) {
        self.visible.remove(&coord);
    }

    pub fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]> {
        self.discovered.get(&coord).map(Vec::as_slice)
    }

    pub fn column_at(&self, coord: WorldCoord) -> Option<&TerrainColumn> {
        let local = to_local_coord(coord);
        let index = (local.lx * CHUNK_SIZE + local.ly) as usize;
        self.discovered
            .get(&to_chunk_coord(coord))
            .and_then(|chunk| chunk.get(index))
    }

    /// Whether a chunk has been discovered (materialized at least once).
    pub fn is_discovered(&self, coord: ChunkCoord) -> bool {
        self.discovered.contains_key(&coord)
    }

    /// Whether a chunk is currently visible.
    pub fn is_visible(&self, coord: ChunkCoord) -> bool {
        self.visible.contains(&coord)
    }

    /// Edits a discovered column; passability follows its surface material.
    pub fn edit_column(
        &mut self,
        coord: WorldCoord,
        elevation: i32,
        surface: TerrainMaterial,
    ) -> Result<(), EditError> {
        if (surface == TerrainMaterial::Water) != (elevation < 0) {
            return Err(EditError::InvalidSurface);
        }
        let chunk_coord = to_chunk_coord(coord);
        let chunk = self
            .discovered
            .get_mut(&chunk_coord)
            .ok_or(EditError::Undiscovered(chunk_coord))?;
        let local = to_local_coord(coord);
        let index = (local.lx * CHUNK_SIZE + local.ly) as usize;
        chunk[index] = TerrainColumn {
            coord,
            elevation,
            surface,
            walkable: surface != TerrainMaterial::Water,
        };
        Ok(())
    }

    pub fn discovered_count(&self) -> usize {
        self.discovered.len()
    }

    pub fn visible_count(&self) -> usize {
        self.visible.len()
    }

    /// Visible chunk coordinates in a stable order, regardless of discovery order.
    pub fn visible_chunks(&self) -> Vec<ChunkCoord> {
        let mut chunks: Vec<_> = self.visible.iter().copied().collect();
        chunks.sort_by_key(|coord| (coord.cx, coord.cy));
        chunks
    }

    /// All discovered chunk coordinates in a stable order.
    pub fn discovered_chunks(&self) -> Vec<ChunkCoord> {
        let mut chunks: Vec<_> = self.discovered.keys().copied().collect();
        chunks.sort_by_key(|coord| (coord.cx, coord.cy));
        chunks
    }
}

#[cfg(test)]
#[path = "terrain_world.test.rs"]
mod tests;
