//! The `merchant` logic: a tradesman who minds a market stall. He is born beside the stalls the
//! chunk carries (one by each, or one by a cluster of them: stalls within [`SHARED_REACH`] of one
//! that already has its merchant share it), strolls a little on his leash and rests a long while,
//! and never leaves the stall's side. The stepping machinery is `wander.rs`'s, as for the animals
//! of [`basic`](crate::ai::basic); the trade itself stays with the stall (`economy`).

use crate::ai::basic::Animal;
use crate::ai::{NpcGait, NpcKind};
use crate::entities::{Entity, get_entity_footprint_for};
use crate::grid::{WorldCoord, cell_key};
use crate::npc::wander::{Npc, can_npc_stand};
use crate::player::PlayerGround;
use crate::terrain::TerrainMaterial;
use crate::time::TICKS_PER_SECOND;

/// How fast he strolls, in columns per simulated second.
pub const SPEED: f64 = 1.0;
/// How many columns he strays from where he was born, along either axis: his stall stays in view.
pub const LEASH: i32 = 3;
/// The shortest and the longest rest between two strolls, in ticks: he stands about a good while.
pub const REST_TICKS: (i32, i32) = (80, 260);
/// The fewest and the most cells one stroll covers.
pub const STROLL_CELLS: (i32, i32) = (1, 2);
/// Side of his square at his sheet's size, in blocks.
pub const BODY_SIDE: f64 = 0.4;
/// Height of his body at his sheet's size, in blocks (without the hat).
pub const BODY_HEIGHT: f64 = 0.85;
/// His coat as rendered: every merchant looks the same.
pub const TINTS: [u32; 1] = [0xff_ff_ff];
/// He is drawn at his sheet's size.
pub const SCALE_RANGE: (f64, f64) = (1.0, 1.0);
/// Set on a merchant's id.
pub const ID_BIT: u64 = 1 << 61;
/// Stalls this close (Chebyshev distance between their anchors, in columns) to one that already
/// has a merchant share him.
pub const SHARED_REACH: i32 = 6;
/// How far from the stall's footprint he may be born, in columns.
pub const HOME_REACH: i32 = 2;

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
        hop: None,
    },
    body: (BODY_SIDE, BODY_HEIGHT),
    tints: &TINTS,
    scale_range: SCALE_RANGE,
    // He is not born by the chunk's rule but beside a stall: the birth fields are not read.
    surface: TerrainMaterial::Grass,
    spawn_label: "npc-merchant-spawn",
    spawn_tries: 0,
    per_chunk: 0,
    chance: 0.0,
    id_bit: ID_BIT,
};

/// The cell beside `stall` where its merchant is born: the first one, by row and then column,
/// within [`HOME_REACH`] of its footprint that he can stand on at the stall's own level.
fn home_beside<G: PlayerGround>(ground: &G, stall: &Entity) -> Option<WorldCoord> {
    let footprint = get_entity_footprint_for(stall);
    let (x0, x1) = (
        footprint.iter().map(|cell| cell.x).min()? - HOME_REACH,
        footprint.iter().map(|cell| cell.x).max()? + HOME_REACH,
    );
    let (y0, y1) = (
        footprint.iter().map(|cell| cell.y).min()? - HOME_REACH,
        footprint.iter().map(|cell| cell.y).max()? + HOME_REACH,
    );
    // Nearest first: the ring of cells at distance one, then two.
    for reach in 1..=HOME_REACH {
        for y in y0..=y1 {
            for x in x0..=x1 {
                let cell = WorldCoord { x, y };
                let near = footprint
                    .iter()
                    .map(|own| (own.x - x).abs().max((own.y - y).abs()))
                    .min()
                    .unwrap_or(i32::MAX);
                if near == reach && can_npc_stand(ground, cell, Some(stall.elevation())) {
                    return Some(cell);
                }
            }
        }
    }
    None
}

/// The merchants of the stalls in one chunk: one for each stall that no merchant already minds
/// within [`SHARED_REACH`], taken in the order of the stalls' ids, so the same stalls always give
/// the same merchants whatever the order they come in.
pub fn spawn<G: PlayerGround>(ground: &G, stalls: &[&Entity]) -> Vec<Npc> {
    let mut ordered: Vec<&Entity> = stalls.to_vec();
    ordered.sort_by(|a, b| a.id().cmp(b.id()));
    let mut minded: Vec<(i32, i32)> = Vec::new();
    let mut born = Vec::new();
    for stall in ordered {
        let at = (stall.x(), stall.y());
        if minded
            .iter()
            .any(|own| (own.0 - at.0).abs().max((own.1 - at.1).abs()) <= SHARED_REACH)
        {
            continue;
        }
        let Some(home) = home_beside(ground, stall) else {
            continue;
        };
        let Ok(key) = cell_key(home) else {
            continue;
        };
        minded.push(at);
        born.push(Npc::new(
            NpcKind::Merchant,
            key.as_u64() | ID_BIT,
            home,
            stall.elevation(),
        ));
    }
    born
}

#[cfg(test)]
#[path = "merchant.test.rs"]
mod tests;
