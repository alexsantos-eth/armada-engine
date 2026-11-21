//! The kinds of NPC logic: how a character moves, how big it is and where it is born.
//!
//! An entity of the catalog opts in with `"npc": "<logic>"` in `entities.json`; without that
//! key it has no NPC behaviour. The entity's id names the animal ([`NpcKind`]): it brings its
//! own [`NpcGait`], body, look and birth rule, while the stepping machinery in `wander.rs` is
//! shared.

pub mod basic;

use serde::{Deserialize, Serialize};

/// Which logic drives an NPC: the value of the `npc` key of an entity.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NpcLogic {
    /// A simple animal: wanders over level ground near home, never climbs nor takes stairs and
    /// turns back at a wall. Which animal ([`NpcKind`]) decides the rest.
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
    /// Whether it walks off a block onto ground one lower.
    pub drops: bool,
    /// Whether it walks sideways (faces across its way) instead of looking where it goes.
    pub sideways: bool,
    /// Whether it turns back when it runs into a wall, the water or its leash.
    pub turns_back: bool,
    /// The bigger hop it takes now and then over level ground, if it hops at all.
    pub hop: Option<NpcHop>,
}

/// A hop off the ground over level ground, only for show: the step lands where a walk would.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NpcHop {
    /// The share of the steps over level ground it takes off on.
    pub chance: f64,
    /// How high its feet go at the top, in blocks.
    pub height: f64,
}

/// How one character looks: tints and size range of its logic.
#[derive(Clone, Copy, Debug)]
pub struct NpcLookRule {
    pub tints: &'static [u32],
    pub scale: (f64, f64),
}

/// Which animal an NPC is: the entity of the catalog that declares it, driven by its logic.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum NpcKind {
    /// The beach crab (`"crab"`), of the `basic` logic.
    Crab,
    /// The meadow rabbit (`"rabbit"`), of the `basic` logic.
    Rabbit,
}

impl NpcKind {
    /// The animal the catalog entity `id` stands for, if the game knows one by that name.
    pub fn of_entity(id: &str) -> Option<Self> {
        match id {
            "crab" => Some(NpcKind::Crab),
            "rabbit" => Some(NpcKind::Rabbit),
            _ => None,
        }
    }

    /// The logic that drives it.
    pub fn logic(self) -> NpcLogic {
        match self {
            NpcKind::Crab | NpcKind::Rabbit => NpcLogic::Basic,
        }
    }

    /// Everything that tells it from the other animals of its logic.
    pub fn animal(self) -> basic::Animal {
        match self {
            NpcKind::Crab => basic::crab::ANIMAL,
            NpcKind::Rabbit => basic::rabbit::ANIMAL,
        }
    }

    /// How it moves.
    pub fn gait(self) -> NpcGait {
        self.animal().gait
    }

    /// Side and height of its body at scale one.
    pub fn body_size(self) -> (f64, f64) {
        self.animal().body
    }

    /// The tints and the size range it is drawn with.
    pub fn look_rule(self) -> NpcLookRule {
        let animal = self.animal();
        NpcLookRule {
            tints: animal.tints,
            scale: animal.scale_range,
        }
    }
}
