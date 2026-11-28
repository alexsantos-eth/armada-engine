//! Who is born in a chunk: a pure function of the seed, the chunk, its ground and the entity
//! catalog, which says which entities have NPC logic.

use super::wander::Npc;
use crate::ai::{NpcKind, NpcLogic, basic, merchant};
use crate::entities::{Entity, EntityCatalog};
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

/// The animals `catalog` declares: every entity with an `npc` logic whose id names one the game
/// knows, once each, in the order they appear. An entity with `npc` but an unknown id gives none.
pub fn kinds_in(catalog: &EntityCatalog) -> Vec<NpcKind> {
    let mut found: Vec<NpcKind> = Vec::new();
    for kind in catalog
        .entities
        .iter()
        .filter(|blueprint| blueprint.npc.is_some())
        .filter_map(|blueprint| NpcKind::of_entity(&blueprint.id))
    {
        if !found.contains(&kind) {
            found.push(kind);
        }
    }
    found
}

/// The characters born in `chunk` of the world of `seed`: for each animal `catalog` declares,
/// the ones the birth rule of its logic gives. An entity without `npc` gives none. The same
/// seed, chunk, ground and catalog always give the same characters.
pub fn spawn_npcs<G: PlayerGround>(
    seed: u64,
    chunk: ChunkCoord,
    ground: &G,
    catalog: &EntityCatalog,
) -> Vec<Npc> {
    let mut born = Vec::new();
    for kind in kinds_in(catalog) {
        match kind.logic() {
            NpcLogic::Basic => born.extend(basic::spawn(seed, chunk, ground, kind)),
            // Born beside the stalls the chunk carries: see `spawn_merchants`.
            NpcLogic::Merchant => {}
        }
    }
    born
}

/// The merchants born in a chunk whose placed entities include `stalls` (the ones that trade):
/// none unless the catalog declares a merchant, otherwise one by each stall or cluster of stalls
/// (see [`merchant::spawn`]). The same stalls and ground always give the same merchants.
pub fn spawn_merchants<G: PlayerGround>(
    ground: &G,
    catalog: &EntityCatalog,
    stalls: &[&Entity],
) -> Vec<Npc> {
    if !kinds_in(catalog).contains(&NpcKind::Merchant) {
        return Vec::new();
    }
    merchant::spawn(ground, stalls)
}

#[cfg(test)]
#[path = "spawn.test.rs"]
mod tests;
