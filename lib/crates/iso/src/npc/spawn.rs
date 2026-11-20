//! Who is born in a chunk: a pure function of the seed, the chunk, its ground and the entity
//! catalog, which says which entities have NPC logic.

use super::wander::Npc;
use crate::ai::{NpcLogic, basic};
use crate::entities::EntityCatalog;
use crate::grid::ChunkCoord;
use crate::player::PlayerGround;

/// The NPC logics `catalog` uses, once each, in the order they first appear.
pub fn logics_in(catalog: &EntityCatalog) -> Vec<NpcLogic> {
    let mut found: Vec<NpcLogic> = Vec::new();
    for logic in catalog
        .entities
        .iter()
        .filter_map(|blueprint| blueprint.npc)
    {
        if !found.contains(&logic) {
            found.push(logic);
        }
    }
    found
}

/// The characters born in `chunk` of the world of `seed`: for each logic some entity of
/// `catalog` declares, the ones its birth rule gives. An entity without `npc` gives none. The
/// same seed, chunk, ground and catalog always give the same characters.
pub fn spawn_npcs<G: PlayerGround>(
    seed: u64,
    chunk: ChunkCoord,
    ground: &G,
    catalog: &EntityCatalog,
) -> Vec<Npc> {
    let mut born = Vec::new();
    for logic in logics_in(catalog) {
        match logic {
            NpcLogic::Basic => born.extend(basic::spawn(seed, chunk, ground)),
        }
    }
    born
}

#[cfg(test)]
#[path = "spawn.test.rs"]
mod tests;
