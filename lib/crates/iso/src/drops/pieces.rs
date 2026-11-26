//! Which pieces of a felled entity stay behind as the items to pick up: the same pieces of the
//! voxel kit that fly apart (`iso::debris`), as many as the harvest gave and up to a limit.

use crate::debris::EntityParts;
use crate::items::{HarvestYield, ItemCatalog};
use crate::player::DustRandom;

/// Most pieces one felling leaves floating.
pub const MAX_PIECE_DROPS: usize = 8;

/// One piece of an entity that becomes a drop.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PiecePick {
    /// The index of the piece in `EntityParts::parts`.
    pub part: usize,
    pub item: String,
    /// Units of the item collecting it gives (always one).
    pub amount: u32,
}

/// The pieces that stay and the yield they do not cover.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PiecePlan {
    pub picks: Vec<PiecePick>,
    /// Yield no piece of the entity stands for: dropped as plain heaps.
    pub rest: Vec<HarvestYield>,
}

impl PiecePlan {
    /// The indexes of the picked pieces.
    pub fn parts(&self) -> Vec<usize> {
        self.picks.iter().map(|pick| pick.part).collect()
    }
}

/// Picks, for each item of `yields`, up to as many pieces of `parts` as it has units (never more
/// than [`MAX_PIECE_DROPS`] in all) among the ones the item's `pieces` name, chosen by the stream
/// of `seed`; each is one unit, so the parts cap what an entity gives.
pub fn plan_pieces(
    parts: &EntityParts,
    yields: &[HarvestYield],
    items: &ItemCatalog,
    seed: u64,
) -> PiecePlan {
    let mut random = DustRandom::new(seed ^ 0x9e37_79b9_7f4a_7c15);
    let mut taken = vec![false; parts.parts.len()];
    let mut plan = PiecePlan::default();
    for gained in yields {
        let names = items
            .item(&gained.item)
            .map_or(&[][..], |item| &item.pieces[..]);
        let mut candidates: Vec<usize> = (0..parts.parts.len())
            .filter(|&index| {
                !taken[index] && names.iter().any(|name| *name == parts.parts[index].piece)
            })
            .collect();
        if candidates.is_empty() {
            // Nothing of it is built from what the item names: it drops as a plain heap.
            plan.rest.push(gained.clone());
            continue;
        }
        // Each piece is one unit, so an entity with two trunks gives two logs at most.
        let room = MAX_PIECE_DROPS.saturating_sub(plan.picks.len());
        let count = candidates.len().min(room).min(gained.amount as usize);
        // Partial shuffle: the first `count` are a fair draw of the candidates.
        for index in 0..count {
            let left = candidates.len() - index;
            let other = index + ((random.roll() * left as f64) as usize).min(left - 1);
            candidates.swap(index, other);
        }
        for &part in &candidates[..count] {
            taken[part] = true;
            plan.picks.push(PiecePick {
                part,
                item: gained.item.clone(),
                amount: 1,
            });
        }
    }
    plan
}

#[cfg(test)]
#[path = "pieces.test.rs"]
mod tests;
