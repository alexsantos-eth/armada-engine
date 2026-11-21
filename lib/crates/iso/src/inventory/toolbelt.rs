//! The tools the player carries: equipment kept apart from the slots, never lost on death.

use crate::items::{ItemCatalog, ToolKind};

/// The ids of the carried tools, in the order they were gained.
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
            if !belt.give(&id, items) && items.tool(&id).is_none() {
                dropped.push(id);
            }
        }
        (belt, dropped)
    }

    /// The carried tool ids.
    pub fn tools(&self) -> &[String] {
        &self.tools
    }

    /// Adds the tool `id`, and says whether it was new and declared.
    pub fn give(&mut self, id: &str, items: &ItemCatalog) -> bool {
        if items.tool(id).is_none() || self.tools.iter().any(|tool| tool == id) {
            return false;
        }
        self.tools.push(id.to_owned());
        true
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
