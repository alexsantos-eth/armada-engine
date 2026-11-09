//! Chunk loading contract. The core requests chunks; the client provides them.

use crate::grid::ChunkCoord;
use crate::terrain::TerrainColumn;

/// Chunk loading contract. The core requests chunks; the client provides them from
pub trait ChunkLoader {
    /// Returns the columns of a discovered chunk, or `None` when not yet discovered.
    fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]>;
    /// Discovers a chunk if needed and returns its columns.
    fn discover(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>>;
}