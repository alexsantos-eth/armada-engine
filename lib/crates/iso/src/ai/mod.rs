//! The kinds of NPC logic: how a character moves, how big it is and where it is born.
//!
//! An entity of the catalog opts in with `"npc": "<logic>"` in `entities.json`; without that
//! key it has no NPC behaviour. Every logic names its own [`NpcGait`] and its own body, look
//! and birth rule, while the stepping machinery in `wander.rs` is shared.

pub mod basic;

use serde::{Deserialize, Serialize};

/// Which logic drives an NPC: the value of the `npc` key of an entity.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NpcLogic {
    /// A simple animal: scuttles sideways over level ground, drops off a block but never
    /// climbs nor takes stairs, turns back at a wall, and is born on dry sand.
    #[default]
    Basic,
}

/// How a logic moves: its pace, its leash, its rests and its strolls, and what ground it may
/// take.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NpcGait {
    /// Columns advanced per tick.
    pub step: f64,
    pub leash: i32,
    pub rest_ticks: (i32, i32),
    pub stroll_cells: (i32, i32),
    /// Whether it climbs a block one higher or takes a flight of stairs: only ground of its
    /// own level or lower is open to one that cannot.
    pub climbs: bool,
    /// Whether it walks sideways (faces across its way) instead of looking where it goes.
    pub sideways: bool,
    /// Whether it turns back when it runs into a wall, the water or its leash.
    pub turns_back: bool,
}

/// How one character looks: tints and size range of its logic.
#[derive(Clone, Copy, Debug)]
pub struct NpcLookRule {
    pub tints: &'static [u32],
    pub scale: (f64, f64),
}

impl NpcLogic {
    /// How this logic moves.
    pub fn gait(self) -> NpcGait {
        match self {
            NpcLogic::Basic => basic::gait(),
        }
    }

    /// Side and height of the body of this logic at scale one.
    pub fn body_size(self) -> (f64, f64) {
        match self {
            NpcLogic::Basic => (basic::BODY_SIDE, basic::BODY_HEIGHT),
        }
    }

    /// The tints and the size range characters of this logic are drawn with.
    pub fn look_rule(self) -> NpcLookRule {
        match self {
            NpcLogic::Basic => NpcLookRule {
                tints: &basic::TINTS,
                scale: basic::SCALE_RANGE,
            },
        }
    }
}
