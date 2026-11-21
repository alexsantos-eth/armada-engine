//! The `basic` logic: a simple animal. It wanders over level ground near where it was born,
//! never climbs nor takes a flight of stairs, and turns back at a wall. Which animal it is
//! ([`NpcKind`]) sets the rest: its pace, its body, its coat, where it is born, whether it walks
//! sideways, drops off a block or hops now and then.
//!
//! - [`crab`]: scuttles sideways on the dry sand where the land meets the water, and drops off a
//!   block like anybody.
//! - [`rabbit`]: hops about the grass, now and then with a bigger hop off the ground, but never
//!   leaves its own level: a block up or down closes its way.

use crate::ai::{NpcGait, NpcHop, NpcKind};
use crate::grid::{CHUNK_SIZE, ChunkCoord, LocalCoord, cell_key, to_world_coord};
use crate::npc::wander::{Npc, can_npc_stand};
use crate::player::{DustRandom, PlayerGround};
use crate::terrain::{TerrainMaterial, derive_seed, noise::lattice_at};
use crate::time::TICKS_PER_SECOND;

/// Everything that tells one animal of the `basic` logic from another.
#[derive(Clone, Copy, Debug)]
pub struct Animal {
    pub gait: NpcGait,
    /// Side of its square and height of its body at its sheet's size, in blocks.
    pub body: (f64, f64),
    /// The tints of its coat, as `0xRRGGBB`; the first one is the artwork as rendered.
    pub tints: &'static [u32],
    /// The smallest and the largest it is drawn, as a share of its sheet's size.
    pub scale_range: (f64, f64),
    /// The ground it is born on.
    pub surface: TerrainMaterial,
    /// Label of the stream that decides where it is born, apart from everybody else's.
    pub spawn_label: &'static str,
    /// Cells of a chunk that are tried as a home.
    pub spawn_tries: i32,
    /// The most of them one chunk gives birth to.
    pub per_chunk: usize,
    /// The share of the cells tried, on its ground, that do get one.
    pub chance: f64,
    /// Set on the id, so that it never shares one with another animal born on the same cell.
    pub id_bit: u64,
}

/// The beach crab.
pub mod crab {
    use super::*;

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
    /// The most crabs one chunk gives birth to.
    pub const PER_CHUNK: usize = 3;
    /// Set on a crab's id.
    pub const ID_BIT: u64 = 1 << 63;

    pub const ANIMAL: Animal = Animal {
        gait: NpcGait {
            step: SPEED / TICKS_PER_SECOND as f64,
            leash: LEASH,
            rest_ticks: REST_TICKS,
            stroll_cells: STROLL_CELLS,
            climbs: false,
            drops: true,
            sideways: true,
            turns_back: true,
            hop: None,
        },
        body: (BODY_SIDE, BODY_HEIGHT),
        tints: &TINTS,
        scale_range: SCALE_RANGE,
        surface: TerrainMaterial::Sand,
        spawn_label: "npc-crab-spawn",
        spawn_tries: 48,
        per_chunk: PER_CHUNK,
        chance: 0.25,
        id_bit: ID_BIT,
    };
}

/// The meadow rabbit.
pub mod rabbit {
    use super::*;

    /// How fast it hops along, in columns per simulated second.
    pub const SPEED: f64 = 1.6;
    /// How many columns it strays from where it was born, along either axis.
    pub const LEASH: i32 = 5;
    /// The shortest and the longest rest between two runs, in ticks: it sits about a while.
    pub const REST_TICKS: (i32, i32) = (30, 150);
    /// The fewest and the most cells one run covers.
    pub const STROLL_CELLS: (i32, i32) = (1, 4);
    /// The bigger hop: the share of the steps over level ground it takes off on, and how high
    /// its feet go, in blocks. Only for show: it lands on the cell it was heading for, on the
    /// same level, and a block up or down stays closed to it.
    pub const HOP: NpcHop = NpcHop {
        chance: 0.3,
        height: 0.2,
        per_step: 2,
    };
    /// Side of its square at its sheet's size, in blocks.
    pub const BODY_SIDE: f64 = 0.3;
    /// Height of its body at its sheet's size, in blocks (without the ears).
    pub const BODY_HEIGHT: f64 = 0.35;
    /// The tints of its coat: the pale fawn as rendered, a wild brown, a grey and a dark one.
    pub const TINTS: [u32; 4] = [0xff_ff_ff, 0xd6_b8_94, 0xbd_b8_b0, 0x9c_86_70];
    /// The smallest and the largest it is drawn, as a share of its sheet's size.
    pub const SCALE_RANGE: (f64, f64) = (0.85, 1.1);
    /// The most rabbits one chunk gives birth to.
    pub const PER_CHUNK: usize = 2;
    /// Set on a rabbit's id.
    pub const ID_BIT: u64 = 1 << 62;

    pub const ANIMAL: Animal = Animal {
        gait: NpcGait {
            step: SPEED / TICKS_PER_SECOND as f64,
            leash: LEASH,
            rest_ticks: REST_TICKS,
            stroll_cells: STROLL_CELLS,
            climbs: false,
            drops: false,
            sideways: false,
            turns_back: true,
            hop: Some(HOP),
        },
        body: (BODY_SIDE, BODY_HEIGHT),
        tints: &TINTS,
        scale_range: SCALE_RANGE,
        surface: TerrainMaterial::Grass,
        spawn_label: "npc-rabbit-spawn",
        spawn_tries: 48,
        per_chunk: PER_CHUNK,
        chance: 0.08,
        id_bit: ID_BIT,
    };
}

/// The animals of `kind` born in `chunk`: a few, on their ground. Drawn from a stream of their
/// own, so that other animals' births do not change with them.
pub fn spawn<G: PlayerGround>(seed: u64, chunk: ChunkCoord, ground: &G, kind: NpcKind) -> Vec<Npc> {
    let animal = kind.animal();
    let stream = lattice_at(
        derive_seed(seed, animal.spawn_label),
        i64::from(chunk.cx),
        i64::from(chunk.cy),
    );
    let mut random = DustRandom::new(stream.to_bits());
    let mut born: Vec<Npc> = Vec::new();
    for _ in 0..animal.spawn_tries {
        if born.len() >= animal.per_chunk {
            break;
        }
        let side = f64::from(CHUNK_SIZE);
        let local = LocalCoord {
            lx: ((random.roll() * side) as i32).min(CHUNK_SIZE - 1),
            ly: ((random.roll() * side) as i32).min(CHUNK_SIZE - 1),
        };
        let chance = random.roll();
        let home = to_world_coord(chunk, local);
        if chance >= animal.chance || born.iter().any(|npc| npc.home == home) {
            continue;
        }
        let on_ground = ground
            .column_at(home.x, home.y)
            .is_some_and(|column| column.surface == animal.surface);
        if !on_ground || !can_npc_stand(ground, home, None) {
            continue;
        }
        let (Some(column), Ok(key)) = (ground.column_at(home.x, home.y), cell_key(home)) else {
            continue;
        };
        born.push(Npc::new(
            kind,
            key.as_u64() | animal.id_bit,
            home,
            column.elevation,
        ));
    }
    born
}
