//! The inventory's part of a save's `systems`: the slots and the tools, versioned on their own.

use crate::inventory::{Inventory, ItemStack, Toolbelt};
use crate::items::ItemCatalog;

/// The key of the inventory's part inside a save's `systems`.
pub const INVENTORY_PART: &str = "inventory";
/// The version of the inventory part this engine writes and reads.
pub const INVENTORY_PART_VERSION: u32 = 1;

/// Everything the player carries.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Carried {
    pub inventory: Inventory,
    pub toolbelt: Toolbelt,
}

impl Carried {
    /// What a new player lands with: empty slots and the starting tools.
    pub fn starting(capacity: usize, items: &ItemCatalog) -> Self {
        Self {
            inventory: Inventory::new(capacity),
            toolbelt: Toolbelt::starting(items),
        }
    }
}

/// A carried load read back from a save, with the ids it had to leave out.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RestoredCarried {
    pub carried: Carried,
    /// Items and tools the catalog no longer declares, in the order they were met.
    pub dropped: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct RawPart {
    version: u32,
    slots: Vec<Option<ItemStack>>,
    tools: Vec<String>,
}

/// `systems` with the inventory part written into it; other parts are kept as they are.
pub fn with_carried(mut systems: serde_json::Value, carried: &Carried) -> serde_json::Value {
    let part = RawPart {
        version: INVENTORY_PART_VERSION,
        slots: carried.inventory.slots().to_vec(),
        tools: carried.toolbelt.tools().to_vec(),
    };
    let value = serde_json::to_value(part).unwrap_or(serde_json::Value::Null);
    if let Some(object) = systems.as_object_mut() {
        object.insert(INVENTORY_PART.to_owned(), value);
        return systems;
    }
    serde_json::json!({ INVENTORY_PART: value })
}

/// The load a save's `systems` records, in an inventory of `capacity` slots, or `None` when the
/// save predates the part or carries a version this engine does not read.
pub fn saved_carried(
    systems: &serde_json::Value,
    capacity: usize,
    items: &ItemCatalog,
) -> Option<RestoredCarried> {
    let part: RawPart = serde_json::from_value(systems.get(INVENTORY_PART)?.clone()).ok()?;
    if part.version != INVENTORY_PART_VERSION {
        return None;
    }
    let (inventory, mut dropped) = Inventory::restore(capacity, part.slots, items);
    let (toolbelt, dropped_tools) = Toolbelt::restore(part.tools, items);
    dropped.extend(dropped_tools);
    Some(RestoredCarried {
        carried: Carried {
            inventory,
            toolbelt,
        },
        dropped,
    })
}

#[cfg(test)]
#[path = "part.test.rs"]
mod tests;
