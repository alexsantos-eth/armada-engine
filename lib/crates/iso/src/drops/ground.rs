//! The items lying on the ground: the pieces of what was felled that stay floating where they
//! landed, picked up by walking over them, kept in their own part of a save.

use super::pieces::PiecePick;
use crate::debris::{EntityParts, Floor, blast, model_to_grid, settle};
use crate::grid::WorldCoord;
use crate::harvest::Feet;
use crate::inventory::Inventory;
use crate::items::{HarvestYield, ItemCatalog};
use crate::projection::GridPoint;

/// Farthest, in columns, a floating piece lies from the middle of what it came off.
pub const PIECE_SCATTER: f64 = 1.3;

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

/// One item on the ground: a piece of what was felled, floating where it landed.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Drop {
    /// Unique among the heaps of a world, never reused.
    pub id: u64,
    pub item: String,
    pub amount: u32,
    /// Where it lies, in columns (column centres are integers).
    pub at: GridPoint,
    /// The block it lies on: the top of the column it came to rest over.
    pub elevation: f64,
    /// The height it was knocked off at, for the view's toss down from there.
    #[serde(default)]
    pub from_elevation: f64,
    /// Where it was knocked off, for the view's toss from there.
    pub from: GridPoint,
    /// Fixed ticks left before it can be picked up.
    #[serde(default)]
    pub wait: u32,
    /// The voxel piece it is, drawn with its own sprite.
    pub piece: DropPiece,
}

/// What a floating piece looks like.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct DropPiece {
    /// The piece's sprite, `debris/p_<hash>`.
    pub sprite: String,
    /// Columns along x and y a wide piece's sprite was rendered off its foot (`iso::debris::Part`).
    #[serde(default)]
    pub shift: [f64; 2],
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

/// What a pick-up took by item and by destination slot, and whether something did not fit.
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

    /// Leaves each of `plan`'s picks floating where its piece of `parts` comes to rest when the
    /// blast of `seed` throws it over `ground`, carrying its units: it falls down to a lower
    /// level, floats where there is water and is stopped by a taller column. The throw is
    /// tempered so that on flat ground it lands within [`PIECE_SCATTER`] columns of the anchor.
    pub fn spawn_pieces(
        &mut self,
        felled: Felled<'_>,
        parts: &EntityParts,
        seed: u64,
        picks: &[PiecePick],
        ground: &dyn Fn(i32, i32) -> Option<Floor>,
    ) {
        let fragments = blast(parts, seed);
        let from = GridPoint {
            x: f64::from(felled.anchor.x),
            y: f64::from(felled.anchor.y),
        };
        for pick in picks {
            let (Some(fragment), Some(part)) =
                (fragments.get(pick.part), parts.parts.get(pick.part))
            else {
                continue;
            };
            let mut fragment = *fragment;
            // The blast is measured from the middle of the anchor tile.
            let origin = [
                f64::from(felled.anchor.x) + 0.5,
                f64::from(felled.anchor.y) + 0.5,
            ];
            let base = f64::from(felled.elevation);
            // Where it would lie on flat ground: if that is out of reach, throw it less far.
            let flat = |_: i32, _: i32| {
                Some(Floor {
                    top: base,
                    water: false,
                })
            };
            let level = settle(&fragment, origin, base, &flat);
            let from_start = [
                level.at[0] - origin[0] - fragment.start[0],
                level.at[1] - origin[1] - fragment.start[1],
            ];
            let length = (level.at[0] - origin[0]).hypot(level.at[1] - origin[1]);
            if length > PIECE_SCATTER {
                // The travel scales with the throw, the place it started from does not: the
                // share `k` of the travel that keeps it on the edge of the reach.
                let (sx, sy) = (fragment.start[0], fragment.start[1]);
                let a = from_start[0].powi(2) + from_start[1].powi(2);
                let b = sx * from_start[0] + sy * from_start[1];
                let c = sx * sx + sy * sy - PIECE_SCATTER * PIECE_SCATTER;
                let temper = if a > 1e-12 {
                    ((-b + (b * b - a * c).max(0.0).sqrt()) / a).clamp(0.0, 1.0)
                } else {
                    1.0
                };
                fragment.velocity[0] *= temper;
                fragment.velocity[1] *= temper;
            }
            let start = fragment.start;
            // The blast is measured from the middle of the anchor tile.
            let origin = [
                f64::from(felled.anchor.x) + 0.5,
                f64::from(felled.anchor.y) + 0.5,
            ];
            let landed = settle(&fragment, origin, f64::from(felled.elevation), ground);
            self.list.push(Drop {
                id: self.next_id,
                item: pick.item.clone(),
                amount: pick.amount,
                at: GridPoint {
                    x: landed.at[0] - 0.5,
                    y: landed.at[1] - 0.5,
                },
                elevation: landed.at[2],
                from_elevation: f64::from(felled.elevation) + start[2],
                from: GridPoint {
                    x: from.x + start[0],
                    y: from.y + start[1],
                },
                wait: PICKUP_DELAY_TICKS,
                piece: DropPiece {
                    sprite: part.sprite.clone(),
                    shift: model_to_grid_pair(part.shift),
                },
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
                if let Some(gain) = collected.stacks.iter_mut().find(|gain| gain.slot == slot) {
                    gain.amount += amount;
                } else {
                    collected.stacks.push(StackGain {
                        slot,
                        item: drop.item.clone(),
                        amount,
                    });
                }
            });
            let taken = drop.amount - left;
            if taken > 0 {
                if let Some(gain) = collected
                    .gained
                    .iter_mut()
                    .find(|gain| gain.item == drop.item)
                {
                    gain.amount = gain.amount.saturating_add(taken);
                } else {
                    collected.gained.push(HarvestYield {
                        item: drop.item.clone(),
                        amount: taken,
                    });
                }
            }
            collected.refused |= left > 0;
            drop.amount = left;
        }
        self.list.retain(|drop| drop.amount > 0);
        collected
    }
}

/// The columns a wide piece's `shift` (model voxels) moves its sprite by.
fn model_to_grid_pair(shift: [f64; 2]) -> [f64; 2] {
    let moved = model_to_grid(shift[0], shift[1]);
    [moved.x, moved.y]
}

#[derive(serde::Serialize, serde::Deserialize)]
struct RawPart {
    version: u32,
    next_id: u64,
    drops: Vec<serde_json::Value>,
}

/// `systems` with the drops' part written into it; other parts are kept as they are.
pub fn with_drops(mut systems: serde_json::Value, drops: &Drops) -> serde_json::Value {
    let part = RawPart {
        version: DROPS_PART_VERSION,
        next_id: drops.next_id,
        drops: drops
            .list
            .iter()
            .filter_map(|drop| serde_json::to_value(drop).ok())
            .collect(),
    };
    let value = serde_json::to_value(part).unwrap_or(serde_json::Value::Null);
    if let Some(object) = systems.as_object_mut() {
        object.insert(DROPS_PART.to_owned(), value);
        return systems;
    }
    serde_json::json!({ DROPS_PART: value })
}

/// The drops a save's `systems` records, leaving out those of items the catalog no longer has and
/// the plain heaps older saves wrote (they had no piece), or `None` when the save predates the part or carries a version this engine does not read.
pub fn saved_drops(systems: &serde_json::Value, items: &ItemCatalog) -> Option<Drops> {
    let part: RawPart = serde_json::from_value(systems.get(DROPS_PART)?.clone()).ok()?;
    if part.version != DROPS_PART_VERSION {
        return None;
    }
    let next_id = part
        .drops
        .iter()
        .filter_map(|drop| drop.get("id")?.as_u64())
        .map(|id| id + 1)
        .max()
        .unwrap_or(0)
        .max(part.next_id);
    Some(Drops {
        list: part
            .drops
            .into_iter()
            .filter_map(|drop| serde_json::from_value::<Drop>(drop).ok())
            .filter(|drop| drop.amount > 0 && items.item(&drop.item).is_some())
            .collect(),
        next_id,
    })
}

#[cfg(test)]
#[path = "ground.test.rs"]
mod tests;
