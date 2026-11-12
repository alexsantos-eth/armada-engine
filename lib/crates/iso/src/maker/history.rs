//! What the edited chunk looked like before each stroke, so a stroke can be taken back.

use crate::entities::Entity;
use crate::grid::ChunkCoord;
use crate::maker::dressing::Dressing;
use crate::terrain::TerrainColumn;
use crate::world::ChunkManager;

/// Everything one chunk of an edited world holds.
#[derive(Clone)]
pub struct ChunkSnapshot {
    columns: Vec<TerrainColumn>,
    entities: Vec<Entity>,
    dressing: Dressing,
}

/// Reads the state of `coord`, or `None` when the world never loaded it.
pub fn snapshot(
    manager: &ChunkManager,
    dressing: &Dressing,
    coord: ChunkCoord,
) -> Option<ChunkSnapshot> {
    Some(ChunkSnapshot {
        columns: manager.terrain_chunk(coord)?.to_vec(),
        entities: manager.entities_chunk(coord).unwrap_or_default().to_vec(),
        dressing: dressing.clone(),
    })
}

/// Writes `step` back over `coord`, and says whether the world still held that chunk.
pub fn restore(
    manager: &mut ChunkManager,
    dressing: &mut Dressing,
    coord: ChunkCoord,
    step: ChunkSnapshot,
) -> bool {
    if !manager.is_discovered(coord) {
        return false;
    }
    manager.load_columns(coord, step.columns);
    manager.set_entities(coord, step.entities);
    *dressing = step.dressing;
    true
}

/// The steps taken so far, newest last, up to a limit.
pub struct History {
    steps: Vec<ChunkSnapshot>,
    limit: usize,
}

impl History {
    /// A history that keeps at most `limit` steps.
    pub fn new(limit: usize) -> Self {
        Self {
            steps: Vec::new(),
            limit,
        }
    }

    /// Keeps `step`, forgetting the oldest one once the limit is reached.
    pub fn record(&mut self, step: ChunkSnapshot) {
        if self.limit == 0 {
            return;
        }
        if self.steps.len() == self.limit {
            self.steps.remove(0);
        }
        self.steps.push(step);
    }

    /// Takes the newest step back off, or `None` when there is nothing to undo.
    pub fn undo(&mut self) -> Option<ChunkSnapshot> {
        self.steps.pop()
    }

    /// How many steps can still be taken back.
    pub fn len(&self) -> usize {
        self.steps.len()
    }

    /// Whether there is nothing left to undo.
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }
}

#[cfg(test)]
#[path = "history.test.rs"]
mod tests;
