//! Who is born in a chunk: a pure function of the seed, the chunk and its ground.

use super::wander::{Npc, NpcKind, can_npc_stand};
use crate::grid::{CHUNK_SIZE, ChunkCoord, LocalCoord, WorldCoord, cell_key, to_world_coord};
use crate::player::{DustRandom, PlayerGround};
use crate::terrain::{TerrainMaterial, derive_seed, noise::lattice_at};

/// Label of the stream that decides who is born where.
const SPAWN_LABEL: &str = "npc-spawn";
/// Label of the stream that decides where the crabs are born, apart from everybody else's.
const CRAB_LABEL: &str = "npc-crab-spawn";
/// Cells of a chunk that are tried as a crab's home.
pub const CRAB_SPAWN_TRIES: i32 = 48;
/// The most crabs one chunk gives birth to.
pub const CRABS_PER_CHUNK: usize = 3;
/// The share of the dry sand cells tried that do get a crab.
pub const CRAB_CHANCE: f64 = 0.25;
/// Set on a crab's id, so that it never shares one with a villager born on the same cell.
pub const CRAB_ID_BIT: u64 = 1 << 63;

/// Cells of a chunk that are tried as a home.
pub const NPC_SPAWN_TRIES: i32 = 96;
/// The most characters one chunk gives birth to inside a settlement.
pub const NPC_VILLAGERS_PER_CHUNK: usize = 20;
/// The most characters one chunk gives birth to out in the wild.
pub const NPC_WANDERERS_PER_CHUNK: usize = 1;
/// The share of standable wild cells tried that do get a wanderer.
pub const NPC_WANDERER_CHANCE: f64 = 0.05;

/// The characters born in `chunk` of the world of `seed`: villagers on the cells `in_village`
/// answers for, now and then a wanderer out in the wild, and crabs on the dry sand of the
/// beach. The same seed, chunk and ground
/// always give the same characters, whatever was loaded before.
pub fn spawn_npcs<G: PlayerGround>(
    seed: u64,
    chunk: ChunkCoord,
    ground: &G,
    in_village: impl Fn(i32, i32) -> bool,
) -> Vec<Npc> {
    let stream = lattice_at(
        derive_seed(seed, SPAWN_LABEL),
        i64::from(chunk.cx),
        i64::from(chunk.cy),
    );
    let mut random = DustRandom::new(stream.to_bits());
    let mut born: Vec<Npc> = Vec::new();
    let (mut villagers, mut wanderers) = (0usize, 0usize);
    for _ in 0..NPC_SPAWN_TRIES {
        let side = f64::from(CHUNK_SIZE);
        let local = LocalCoord {
            lx: ((random.roll() * side) as i32).min(CHUNK_SIZE - 1),
            ly: ((random.roll() * side) as i32).min(CHUNK_SIZE - 1),
        };
        let chance = random.roll();
        let home = to_world_coord(chunk, local);
        let village = in_village(home.x, home.y);
        let wanted = if village {
            villagers < NPC_VILLAGERS_PER_CHUNK
        } else {
            wanderers < NPC_WANDERERS_PER_CHUNK && chance < NPC_WANDERER_CHANCE
        };
        if !wanted || born.iter().any(|npc| npc.home == home) {
            continue;
        }
        let Some(npc) = npc_at(ground, home) else {
            continue;
        };
        born.push(npc);
        if village {
            villagers += 1;
        } else {
            wanderers += 1;
        }
    }
    born.extend(spawn_crabs(seed, chunk, ground));
    born
}

/// The crabs born in `chunk`: a few, on the dry sand of the beach, where the land meets
/// the water. Drawn from a stream of their own, so the
/// villagers and wanderers of a chunk do not change with them.
pub fn spawn_crabs<G: PlayerGround>(seed: u64, chunk: ChunkCoord, ground: &G) -> Vec<Npc> {
    let stream = lattice_at(
        derive_seed(seed, CRAB_LABEL),
        i64::from(chunk.cx),
        i64::from(chunk.cy),
    );
    let mut random = DustRandom::new(stream.to_bits());
    let mut born: Vec<Npc> = Vec::new();
    for _ in 0..CRAB_SPAWN_TRIES {
        if born.len() >= CRABS_PER_CHUNK {
            break;
        }
        let side = f64::from(CHUNK_SIZE);
        let local = LocalCoord {
            lx: ((random.roll() * side) as i32).min(CHUNK_SIZE - 1),
            ly: ((random.roll() * side) as i32).min(CHUNK_SIZE - 1),
        };
        let chance = random.roll();
        let home = to_world_coord(chunk, local);
        if chance >= CRAB_CHANCE || born.iter().any(|crab| crab.home == home) {
            continue;
        }
        let on_sand = ground
            .column_at(home.x, home.y)
            .is_some_and(|column| column.surface == TerrainMaterial::Sand);
        if !on_sand || !can_npc_stand(ground, home, None) {
            continue;
        }
        let (Some(column), Ok(key)) = (ground.column_at(home.x, home.y), cell_key(home)) else {
            continue;
        };
        born.push(Npc::of_kind(
            NpcKind::Crab,
            key.as_u64() | CRAB_ID_BIT,
            home,
            column.elevation,
        ));
    }
    born
}

/// A character at home on `home`, when that cell can be stood on.
fn npc_at<G: PlayerGround>(ground: &G, home: WorldCoord) -> Option<Npc> {
    if !can_npc_stand(ground, home, None) {
        return None;
    }
    let column = ground.column_at(home.x, home.y)?;
    let key = cell_key(home).ok()?;
    Some(Npc::new(key.as_u64(), home, column.elevation))
}

#[cfg(test)]
#[path = "spawn.test.rs"]
mod tests;
