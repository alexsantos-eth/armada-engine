//! What tells one character from another: a tint over its artwork and its size.

use crate::ai::NpcLogic;
use crate::player::DustRandom;

/// Salt that keeps the look's stream apart from the one a character wanders with.
const LOOK_SALT: u64 = 0x6c6f_6f6b;

/// How one character looks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NpcLook {
    /// What its artwork is multiplied by, as `0xRRGGBB`.
    pub tint: u32,
    /// Its size as a share of its sheet's.
    pub scale: f64,
}

/// The look of the character `id` of `logic`: always the same for the same character, so it
/// comes back looking as it did when its chunk is born again. The tints and the size range are
/// the logic's.
pub fn npc_look(logic: NpcLogic, id: u64) -> NpcLook {
    let rule = logic.look_rule();
    let (small, large) = rule.scale;
    let mut random = DustRandom::new(id ^ LOOK_SALT);
    let coat = ((random.roll() * rule.tints.len() as f64) as usize).min(rule.tints.len() - 1);
    NpcLook {
        tint: rule.tints[coat],
        scale: small + (large - small) * random.roll(),
    }
}

#[cfg(test)]
#[path = "look.test.rs"]
mod tests;
