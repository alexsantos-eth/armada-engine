//! The items lying on the ground: what a felling drops around where it stood, picked up by
//! walking over them, kept in their own part of a save.

use crate::grid::WorldCoord;
use crate::harvest::Feet;
use crate::inventory::Inventory;
use crate::items::{HarvestYield, ItemCatalog};
use crate::projection::GridPoint;
use crate::terrain::derive_seed;

/// Farthest, in columns along either axis, a heap lands from the centre of what dropped it.
pub const DROP_SCATTER: f64 = 0.35;

/// Farthest the player's feet may be from a heap, in columns, to pick it up.
pub const PICKUP_REACH: f64 = 0.55;

/// Fixed ticks a new heap lies on the ground before it can be picked up: long enough to see it
/// land, so a player standing by what it felled does not take it out of the air.
pub const PICKUP_DELAY_TICKS: u32 = 10;

/// Most blocks between a heap and the player's feet for it to be picked up.
pub const PICKUP_LEVEL_REACH: f64 = 1.5;

/// The key of the drops' part inside a save's `systems`.
pub const DROPS_PART: &str = "drops";
/// The version of the drops' part this engine writes and reads.
pub const DROPS_PART_VERSION: u32 = 1;

/// One heap of one item on the ground.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Drop {
    /// Unique among the heaps of a world, never reused.
    pub id: u64,
    pub item: String,
    pub amount: u32,
    /// Where it lies, in columns (column centres are integers).
    pub at: GridPoint,
    /// The block it lies on.
    pub elevation: f64,
    /// Where it was knocked off, for the view's toss from there.
    pub from: GridPoint,
    /// Fixed ticks left before it can be picked up.
    #[serde(default)]
    pub wait: u32,
}

/// What was gathered, as the drop needs it.
#[derive(Clone, Copy, Debug)]
pub struct Felled<'a> {
    /// The entity's instance id, which seeds where its heaps land.
    pub id: &'a str,
    pub anchor: WorldCoord,
    pub elevation: i32,
}

/// Units accepted into one inventory slot while collecting a heap.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StackGain {
    pub slot: usize,
    pub item: String,
    pub amount: u32,
}

/// What a pick-up took by heap and by destination slot, and whether something did not fit.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Collected {
    pub gained: Vec<HarvestYield>,
    pub stacks: Vec<StackGain>,
    pub refused: bool,
}

/// Every heap on the ground.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Drops {
    list: Vec<Drop>,
    next_id: u64,
}

impl Drops {
    /// The heaps, oldest first.
    pub fn list(&self) -> &[Drop] {
        &self.list
    }

    /// Drops one heap per yield of a felling, scattered around its anchor by a stream seeded from
    /// its id, so the same felling always lands in the same places.
    pub fn spawn(&mut self, felled: Felled<'_>, yields: &[HarvestYield]) {
        let from = GridPoint {
            x: f64::from(felled.anchor.x),
            y: f64::from(felled.anchor.y),
        };
        let count = yields.len().max(1) as f64;
        let turn = unit(derive_seed(0, &format!("drop@{}", felled.id)));
        for (index, gained) in yields.iter().enumerate() {
            let reach =
                0.55 + 0.45 * unit(derive_seed(index as u64, &format!("drop@{}", felled.id)));
            let angle = std::f64::consts::TAU * (turn + index as f64 / count);
            let along = |value: f64| (value * reach).clamp(-1.0, 1.0) * DROP_SCATTER;
            self.list.push(Drop {
                id: self.next_id,
                item: gained.item.clone(),
                amount: gained.amount,
                at: GridPoint {
                    x: from.x + along(angle.cos()),
                    y: from.y + along(angle.sin()),
                },
                elevation: f64::from(felled.elevation),
                from,
                wait: PICKUP_DELAY_TICKS,
            });
            self.next_id += 1;
        }
    }

    /// Lets `ticks` fixed ticks pass, then picks up every heap within [`PICKUP_REACH`] of `feet`
    /// that is done waiting into `inventory`, as much of each as fits; what does not fit stays
    /// on the ground.
    pub fn collect(
        &mut self,
        feet: Feet,
        inventory: &mut Inventory,
        items: &ItemCatalog,
        ticks: u32,
    ) -> Collected {
        let mut collected = Collected::default();
        for drop in &mut self.list {
            drop.wait = drop.wait.saturating_sub(ticks);
            if drop.wait > 0 {
                continue;
            }
            let near = (drop.at.x - feet.at.x).hypot(drop.at.y - feet.at.y) <= PICKUP_REACH
                && (drop.elevation - feet.elevation).abs() <= PICKUP_LEVEL_REACH;
            if !near {
                continue;
            }
            let left = inventory.add_with_slots(&drop.item, drop.amount, items, |slot, amount| {
                collected.stacks.push(StackGain {
                    slot,
                    item: drop.item.clone(),
                    amount,
                });
            });
            let taken = drop.amount - left;
            if taken > 0 {
                collected.gained.push(HarvestYield {
                    item: drop.item.clone(),
                    amount: taken,
                });
            }
            collected.refused |= left > 0;
            drop.amount = left;
        }
        self.list.retain(|drop| drop.amount > 0);
        collected
    }
}

/// A 64-bit hash as a share of one, `0.0..1.0`.
fn unit(hash: u64) -> f64 {
    (hash >> 11) as f64 / (1u64 << 53) as f64
}

#[derive(serde::Serialize, serde::Deserialize)]
struct RawPart {
    version: u32,
    next_id: u64,
    drops: Vec<Drop>,
}

/// `systems` with the drops' part written into it; other parts are kept as they are.
pub fn with_drops(mut systems: serde_json::Value, drops: &Drops) -> serde_json::Value {
    let part = RawPart {
        version: DROPS_PART_VERSION,
        next_id: drops.next_id,
        drops: drops.list.clone(),
    };
    let value = serde_json::to_value(part).unwrap_or(serde_json::Value::Null);
    if let Some(object) = systems.as_object_mut() {
        object.insert(DROPS_PART.to_owned(), value);
        return systems;
    }
    serde_json::json!({ DROPS_PART: value })
}

/// The heaps a save's `systems` records, leaving out those of items the catalog no longer has,
/// or `None` when the save predates the part or carries a version this engine does not read.
pub fn saved_drops(systems: &serde_json::Value, items: &ItemCatalog) -> Option<Drops> {
    let part: RawPart = serde_json::from_value(systems.get(DROPS_PART)?.clone()).ok()?;
    if part.version != DROPS_PART_VERSION {
        return None;
    }
    let next_id = part
        .drops
        .iter()
        .map(|drop| drop.id + 1)
        .max()
        .unwrap_or(0)
        .max(part.next_id);
    Some(Drops {
        list: part
            .drops
            .into_iter()
            .filter(|drop| drop.amount > 0 && items.item(&drop.item).is_some())
            .collect(),
        next_id,
    })
}

#[cfg(test)]
#[path = "ground.test.rs"]
mod tests;
