//! The `basic` logic: a simple animal (today, the beach crab). It scuttles sideways over level
//! ground and drops off a block, but never climbs nor takes a flight of stairs; faced with a
//! wall it turns back. It is born on the dry sand where the land meets the water.

use crate::ai::{NpcGait, NpcLogic};
use crate::grid::{CHUNK_SIZE, ChunkCoord, LocalCoord, cell_key, to_world_coord};
use crate::npc::wander::{Npc, can_npc_stand};
use crate::player::{DustRandom, PlayerGround};
use crate::terrain::{TerrainMaterial, derive_seed, noise::lattice_at};
use crate::time::TICKS_PER_SECOND;

/// How fast it scuttles, in columns per simulated second.
pub const SPEED: f64 = 1.8;
/// How many columns it strays from where it was born, along either axis.
pub const LEASH: i32 = 4;
/// The shortest and the longest rest between two scuttles, in ticks.
pub const REST_TICKS: (i32, i32) = (20, 90);
/// The fewest and the most cells one scuttle covers.
pub const STROLL_CELLS: (i32, i32) = (1, 3);

/// Side of its square at its sheet's size, in blocks: a low, wide shell.
pub const BODY_SIDE: f64 = 0.36;
/// Height of its body at its sheet's size, in blocks.
pub const BODY_HEIGHT: f64 = 0.25;

/// The tints of its shell: as rendered, a sun-bleached one and a deeper red.
pub const TINTS: [u32; 3] = [0xff_ff_ff, 0xff_e4_cc, 0xe4_b4_ac];
/// The smallest and the largest it is drawn, as a share of its sheet's size.
pub const SCALE_RANGE: (f64, f64) = (0.8, 1.15);

/// Label of the stream that decides where they are born, apart from everybody else's.
const SPAWN_LABEL: &str = "npc-crab-spawn";
/// Cells of a chunk that are tried as a home.
pub const SPAWN_TRIES: i32 = 48;
/// The most characters of this logic one chunk gives birth to.
pub const PER_CHUNK: usize = 3;
/// The share of the dry sand cells tried that do get one.
pub const CHANCE: f64 = 0.25;
/// Set on the id, so that it never shares one with another logic's character on the same cell.
pub const ID_BIT: u64 = 1 << 63;

/// How it moves.
pub fn gait() -> NpcGait {
    NpcGait {
        step: SPEED / TICKS_PER_SECOND as f64,
        leash: LEASH,
        rest_ticks: REST_TICKS,
        stroll_cells: STROLL_CELLS,
        climbs: false,
        sideways: true,
        turns_back: true,
    }
}

/// The characters of this logic born in `chunk`: a few, on dry sand. Drawn from a stream of
/// their own, so that other logics' births do not change with them.
pub fn spawn<G: PlayerGround>(seed: u64, chunk: ChunkCoord, ground: &G) -> Vec<Npc> {
    let stream = lattice_at(
        derive_seed(seed, SPAWN_LABEL),
        i64::from(chunk.cx),
        i64::from(chunk.cy),
    );
    let mut random = DustRandom::new(stream.to_bits());
    let mut born: Vec<Npc> = Vec::new();
    for _ in 0..SPAWN_TRIES {
        if born.len() >= PER_CHUNK {
            break;
        }
        let side = f64::from(CHUNK_SIZE);
        let local = LocalCoord {
            lx: ((random.roll() * side) as i32).min(CHUNK_SIZE - 1),
            ly: ((random.roll() * side) as i32).min(CHUNK_SIZE - 1),
        };
        let chance = random.roll();
        let home = to_world_coord(chunk, local);
        if chance >= CHANCE || born.iter().any(|npc| npc.home == home) {
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
        born.push(Npc::new(
            NpcLogic::Basic,
            key.as_u64() | ID_BIT,
            home,
            column.elevation,
        ));
    }
    born
}
