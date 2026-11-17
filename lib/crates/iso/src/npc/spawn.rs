//! Who is born in a chunk: a pure function of the seed, the chunk and its ground.

use super::wander::{Npc, can_npc_stand};
use crate::grid::{CHUNK_SIZE, ChunkCoord, LocalCoord, WorldCoord, cell_key, to_world_coord};
use crate::player::{DustRandom, PlayerGround};
use crate::terrain::{derive_seed, noise::lattice_at};

/// Label of the stream that decides who is born where.
const SPAWN_LABEL: &str = "npc-spawn";
/// Cells of a chunk that are tried as a home.
pub const NPC_SPAWN_TRIES: i32 = 96;
/// The most characters one chunk gives birth to inside a settlement.
pub const NPC_VILLAGERS_PER_CHUNK: usize = 20;
/// The most characters one chunk gives birth to out in the wild.
pub const NPC_WANDERERS_PER_CHUNK: usize = 1;
/// The share of standable wild cells tried that do get a wanderer.
pub const NPC_WANDERER_CHANCE: f64 = 0.05;

/// The characters born in `chunk` of the world of `seed`: villagers on the cells `in_village`
/// answers for, and now and then a wanderer out in the wild. The same seed, chunk and ground
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
