//! The entity placement of a discovered chunk, computed off the frame's critical path.
//!
//! A chunk's entities and roads are deterministic functions of seed and terrain, so the work can
//! happen on a thread that the frame does not wait for: the next ticks apply the outcome through
//! `ChunkManager`'s job poll. On `wasm32` (and anywhere the placement is trivial) the same work
//! runs inline, producing the identical outcome.

#[cfg(not(target_arch = "wasm32"))]
use std::thread::JoinHandle;

use crate::biomes::field::WorldBiomes;
use crate::entities::{
    Entity, EntityCatalog, PlacementContent, PlacementRules, place_entities_with_content,
    wfc::WfcCatalog,
};
use crate::grid::ChunkCoord;
use crate::paths::pave;
use crate::settlements::WorldSettlements;
use crate::terrain::{TerrainColumn, TerrainMaterial, WORLD_SEED};

use super::terrain_world::connect_roads_into;
use crate::entities::decor::place_decor;

/// The outcome of one chunk's placement: the columns with any roads materialized, and its
/// entities in column order.
pub(crate) struct PlacementOutcome {
    pub(crate) columns: Vec<TerrainColumn>,
    pub(crate) entities: Vec<Entity>,
}

/// The content one chunk's placement reads: the world's biomes, its wfc weights and the
/// settlement zones that reshape them.
#[derive(Clone)]
pub(crate) struct ChunkContent {
    pub(crate) biomes: Option<WorldBiomes>,
    pub(crate) wfc: Option<WfcCatalog>,
    pub(crate) settlements: Option<WorldSettlements>,
}

/// Grows grass on the bare ground of every column `blocks` marks, so a village block on a dirt
/// patch can still raise its houses; returns how many columns it turfed.
fn turf(columns: &mut [TerrainColumn], blocks: &[bool]) -> usize {
    let mut turfed = 0;
    for (column, &block) in columns.iter_mut().zip(blocks) {
        if block && column.surface == TerrainMaterial::Ground {
            column.surface = TerrainMaterial::Grass;
            turfed += 1;
        }
    }
    turfed
}

/// Turfs the bare ground of the settlement blocks and paves the settlement streets of `columns`, places entities on them and materializes the
/// roads that join every building to the network, inline.
fn place(
    mut columns: Vec<TerrainColumn>,
    catalog: &EntityCatalog,
    content: &ChunkContent,
) -> PlacementOutcome {
    if let Some(settlements) = content.settlements.as_ref() {
        let coords: Vec<_> = columns.iter().map(|column| column.coord).collect();
        let _ = turf(&mut columns, &settlements.blocks_over(&coords));
        let _ = pave(&mut columns, &settlements.streets_over(&coords));
    }
    let result = place_entities_with_content(
        &columns,
        catalog,
        PlacementRules::default(),
        PlacementContent {
            biomes: content.biomes.as_ref(),
            wfc: content.wfc.as_ref(),
            settlements: content.settlements.as_ref(),
            seed: WORLD_SEED,
        },
    );
    let _ = connect_roads_into(&mut columns, &result.entities);
    let mut entities = result.entities;
    let mut index = result.index;
    entities.append(&mut place_decor(&columns, catalog, &mut index));
    PlacementOutcome { columns, entities }
}

/// One chunk's placement, listed from spawn until it is applied or dropped.
pub(crate) struct PlacementJob {
    pub(crate) coord: ChunkCoord,
    state: State,
}

enum State {
    /// Inline result, for the builds and platforms without threads.
    #[cfg(target_arch = "wasm32")]
    Inline(Option<PlacementOutcome>),
    #[cfg(not(target_arch = "wasm32"))]
    Thread(JoinHandle<PlacementOutcome>),
    /// Placeholder taken by [`PlacementJob::take_outcome`], which never leaves it behind.
    Taken,
}

impl PlacementJob {
    /// Spawns the placement of `columns` on a thread; on `wasm32` it is computed inline instead.
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn spawn(
        coord: ChunkCoord,
        columns: Vec<TerrainColumn>,
        catalog: EntityCatalog,
        content: ChunkContent,
    ) -> Self {
        let handle = std::thread::spawn(move || place(columns, &catalog, &content));
        Self {
            coord,
            state: State::Thread(handle),
        }
    }

    /// Computes the placement inline, for the builds and platforms without threads.
    #[cfg(target_arch = "wasm32")]
    pub(crate) fn spawn(
        coord: ChunkCoord,
        columns: Vec<TerrainColumn>,
        catalog: EntityCatalog,
        content: ChunkContent,
    ) -> Self {
        Self {
            coord,
            state: State::Inline(Some(place(columns, &catalog, &content))),
        }
    }

    /// Whether the outcome is ready, inline or not.
    pub(crate) fn is_finished(&self) -> bool {
        match &self.state {
            #[cfg(target_arch = "wasm32")]
            State::Inline(_) => true,
            #[cfg(not(target_arch = "wasm32"))]
            State::Thread(handle) => handle.is_finished(),
            State::Taken => true,
        }
    }

    /// Takes the outcome if it is ready, waiting for threads when `wait` is set. A join failure
    /// logs and yields no outcome — the chunk keeps its terrain and grows nothing.
    pub(crate) fn take_outcome(&mut self, wait: bool) -> Option<PlacementOutcome> {
        let _ = wait;
        let state = std::mem::replace(&mut self.state, State::Taken);
        match state {
            #[cfg(target_arch = "wasm32")]
            State::Inline(outcome) => outcome,
            #[cfg(not(target_arch = "wasm32"))]
            State::Thread(handle) => {
                if !wait && !handle.is_finished() {
                    self.state = State::Thread(handle);
                    return None;
                }
                match handle.join() {
                    Ok(outcome) => Some(outcome),
                    Err(_) => {
                        eprintln!(
                            "placement job panicked; the chunk keeps its terrain and grows no entities"
                        );
                        None
                    }
                }
            }
            State::Taken => None,
        }
    }
}

#[cfg(test)]
#[path = "placement_job.test.rs"]
mod tests;
