//! The tools the player carries: equipment kept apart from the slots, never lost on death.

use crate::items::{ItemCatalog, ToolDef, ToolKind};

/// The carried tools, one id per unit, in the order they were gained. A tool can be bought
/// again: each unit is one more entry, and `owned` counts them like an item's stack.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Toolbelt {
    tools: Vec<String>,
}

impl Toolbelt {
    /// The tools a new player lands with.
    pub fn starting(items: &ItemCatalog) -> Self {
        Self {
            tools: items.starting_tools().to_vec(),
        }
    }

    /// Rebuilds a saved toolbelt, forgetting the tools the catalog lacks and returning their ids.
    pub fn restore(saved: Vec<String>, items: &ItemCatalog) -> (Self, Vec<String>) {
        let mut belt = Self::default();
        let mut dropped = Vec::new();
        for id in saved {
            if !belt.give(&id, items) {
                dropped.push(id);
            }
        }
        (belt, dropped)
    }

    /// The carried tool ids, once per unit.
    pub fn tools(&self) -> &[String] {
        &self.tools
    }

    /// How many units of the tool `id` are carried.
    pub fn count(&self, id: &str) -> u32 {
        self.tools.iter().filter(|tool| *tool == id).count() as u32
    }

    /// The distinct tools carried with how many of each, in the order each was first gained.
    pub fn owned(&self) -> Vec<(&str, u32)> {
        let mut owned: Vec<(&str, u32)> = Vec::new();
        for id in &self.tools {
            match owned.iter_mut().find(|(have, _)| have == id) {
                Some((_, count)) => *count += 1,
                None => owned.push((id, 1)),
            }
        }
        owned
    }

    /// Adds one unit of the tool `id`, and says whether the catalog declares it.
    pub fn give(&mut self, id: &str, items: &ItemCatalog) -> bool {
        if items.tool(id).is_none() {
            return false;
        }
        self.tools.push(id.to_owned());
        true
    }

    /// The best tool carried of `kind`: the highest tier, the one gained first among equals.
    pub fn best<'a>(&self, kind: ToolKind, items: &'a ItemCatalog) -> Option<&'a ToolDef> {
        self.tools
            .iter()
            .filter_map(|id| items.tool(id))
            .filter(|tool| tool.kind == kind)
            .fold(None, |best: Option<&'a ToolDef>, tool| match best {
                Some(held) if held.tier >= tool.tier => Some(held),
                _ => Some(tool),
            })
    }

    /// The highest tier carried of `kind`.
    pub fn best_tier(&self, kind: ToolKind, items: &ItemCatalog) -> Option<u8> {
        self.tools
            .iter()
            .filter_map(|id| items.tool(id))
            .filter(|tool| tool.kind == kind)
            .map(|tool| tool.tier)
            .max()
    }
}

#[cfg(test)]
#[path = "toolbelt.test.rs"]
mod tests;
