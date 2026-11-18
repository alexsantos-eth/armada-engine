//! What tells one character from another: a tint over its fur and its size.

use super::wander::NpcKind;
use crate::player::DustRandom;

/// The tints a character's artwork is multiplied by, as `0xRRGGBB`: the monkey as drawn and
/// seven coats that darken or warm it. A multiply only ever darkens, so every coat stays below
/// white.
pub const NPC_TINTS: [u32; 8] = [
    0xff_ff_ff, 0xf4_dc_b4, 0xd6_b4_96, 0xc8_c4_cc, 0xff_d0_a0, 0xb0_98_88, 0xee_c0_b4, 0xd4_dc_b8,
];
/// The smallest and the largest a character is drawn, as a share of the player's size.
pub const NPC_SCALE_RANGE: (f64, f64) = (0.8, 1.15);
/// The tints of a crab's shell: as rendered, a sun-bleached one and a deeper red.
pub const CRAB_TINTS: [u32; 3] = [0xff_ff_ff, 0xff_e4_cc, 0xe4_b4_ac];
/// The smallest and the largest a crab is drawn, as a share of its sheet's size.
pub const CRAB_SCALE_RANGE: (f64, f64) = (0.8, 1.15);
/// Salt that keeps the look's stream apart from the one a character wanders with.
const LOOK_SALT: u64 = 0x6c6f_6f6b;

/// How one character looks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NpcLook {
    /// What its artwork is multiplied by, as `0xRRGGBB`.
    pub tint: u32,
    /// Its size as a share of the player's.
    pub scale: f64,
}

/// The look of the character `id`: always the same for the same character, so it comes back
/// looking as it did when its chunk is born again.
pub fn npc_look(id: u64) -> NpcLook {
    look_from(id, &NPC_TINTS, NPC_SCALE_RANGE)
}

/// The look of the character `id` of `kind`: a villager's coat and size, or a crab's shell and
/// its size against its own sheet.
pub fn kind_look(kind: NpcKind, id: u64) -> NpcLook {
    match kind {
        NpcKind::Villager => npc_look(id),
        NpcKind::Crab => look_from(id, &CRAB_TINTS, CRAB_SCALE_RANGE),
    }
}

fn look_from(id: u64, tints: &[u32], (small, large): (f64, f64)) -> NpcLook {
    let mut random = DustRandom::new(id ^ LOOK_SALT);
    let coat = ((random.roll() * tints.len() as f64) as usize).min(tints.len() - 1);
    NpcLook {
        tint: tints[coat],
        scale: small + (large - small) * random.roll(),
    }
}

#[cfg(test)]
#[path = "look.test.rs"]
mod tests;
