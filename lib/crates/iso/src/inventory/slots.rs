//! The player's slot inventory: a fixed number of slots, each holding one stack of one item.

use crate::items::{HarvestYield, ItemCatalog};

/// Slots a player lands with, before any suit adds pockets.
pub const STARTING_SLOTS: usize = 12;

/// Units of one item in one slot.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ItemStack {
    pub item: String,
    pub count: u32,
}

/// A fixed row of slots; an empty slot is `None`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Inventory {
    slots: Vec<Option<ItemStack>>,
}

impl Inventory {
    /// An empty inventory of `capacity` slots.
    pub fn new(capacity: usize) -> Self {
        Self {
            slots: vec![None; capacity],
        }
    }

    /// Rebuilds a saved inventory of `capacity` slots: stacks past the capacity are lost, a stack
    /// of an item the catalog no longer has is emptied and its id returned, and a stack above its
    /// item's limit is cut down to it.
    pub fn restore(
        capacity: usize,
        saved: Vec<Option<ItemStack>>,
        items: &ItemCatalog,
    ) -> (Self, Vec<String>) {
        let mut inventory = Self::new(capacity);
        let mut dropped = Vec::new();
        for (slot, stack) in inventory.slots.iter_mut().zip(saved) {
            let Some(mut stack) = stack else { continue };
            match items.item(&stack.item) {
                Some(def) if stack.count > 0 => {
                    stack.count = stack.count.min(def.stack);
                    *slot = Some(stack);
                }
                Some(_) => {}
                None => dropped.push(stack.item),
            }
        }
        (inventory, dropped)
    }

    /// Number of slots.
    pub fn capacity(&self) -> usize {
        self.slots.len()
    }

    /// The slots in order.
    pub fn slots(&self) -> &[Option<ItemStack>] {
        &self.slots
    }

    /// Units of `item` across every slot.
    pub fn count(&self, item: &str) -> u32 {
        self.slots
            .iter()
            .flatten()
            .filter(|stack| stack.item == item)
            .map(|stack| stack.count)
            .sum()
    }

    /// Puts up to `amount` units of `item` away, topping up its stacks before opening empty
    /// slots, and returns the units that did not fit. An item the catalog lacks never fits.
    pub fn add(&mut self, item: &str, amount: u32, items: &ItemCatalog) -> u32 {
        self.add_with_slots(item, amount, items, |_, _| {})
    }

    /// Like [Self::add], reporting each slot and the number of units that went into it.
    pub(crate) fn add_with_slots(
        &mut self,
        item: &str,
        amount: u32,
        items: &ItemCatalog,
        mut placed: impl FnMut(usize, u32),
    ) -> u32 {
        let Some(limit) = items.item(item).map(|def| def.stack) else {
            return amount;
        };
        let mut left = amount;
        for (slot, stack) in self.slots.iter_mut().enumerate() {
            if left == 0 {
                break;
            }
            if let Some(stack) = stack
                && stack.item == item
                && stack.count < limit
            {
                let moved = left.min(limit - stack.count);
                stack.count += moved;
                left -= moved;
                placed(slot, moved);
            }
        }
        for (index, slot) in self.slots.iter_mut().enumerate() {
            if left == 0 {
                break;
            }
            if slot.is_none() {
                let moved = left.min(limit);
                *slot = Some(ItemStack {
                    item: item.to_owned(),
                    count: moved,
                });
                left -= moved;
                placed(index, moved);
            }
        }
        left
    }

    /// Whether every one of `yields` fits at once.
    pub fn fits(&self, yields: &[HarvestYield], items: &ItemCatalog) -> bool {
        let mut trial = self.clone();
        yields
            .iter()
            .all(|y| trial.add(&y.item, y.amount, items) == 0)
    }

    /// Takes `amount` units of `item`, from the last slots first, and says whether there were
    /// enough; when there were not, nothing is taken.
    pub fn take(&mut self, item: &str, amount: u32) -> bool {
        if self.count(item) < amount {
            return false;
        }
        let mut left = amount;
        for slot in self.slots.iter_mut().rev() {
            if left == 0 {
                break;
            }
            if let Some(stack) = slot
                && stack.item == item
            {
                let moved = left.min(stack.count);
                stack.count -= moved;
                left -= moved;
                if stack.count == 0 {
                    *slot = None;
                }
            }
        }
        true
    }
}

#[cfg(test)]
#[path = "slots.test.rs"]
mod tests;
