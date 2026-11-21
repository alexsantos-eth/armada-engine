//! Tests for the toolbelt: which tools the player carries and the best one of each kind.

use super::*;
use crate::items::catalog::tests::{catalog_json, entities};
use crate::items::{ItemCatalog, ToolKind, parse_items};

fn items() -> ItemCatalog {
    parse_items(catalog_json(), &entities()).unwrap()
}

#[test]
fn a_new_player_carries_the_starting_tools() {
    let belt = Toolbelt::starting(&items());
    assert_eq!(belt.tools(), ["flint_axe", "stone_pickaxe"]);
}

#[test]
fn the_best_tier_of_a_kind_wins() {
    let mut belt = Toolbelt::starting(&items());
    assert_eq!(belt.best_tier(ToolKind::Pickaxe, &items()), Some(1));
    assert!(belt.give("copper_pickaxe", &items()));
    assert_eq!(belt.best_tier(ToolKind::Pickaxe, &items()), Some(3));
    assert_eq!(belt.best_tier(ToolKind::Net, &items()), None);
}

#[test]
fn a_tool_is_carried_once_and_must_exist() {
    let mut belt = Toolbelt::starting(&items());
    assert!(!belt.give("flint_axe", &items()));
    assert!(!belt.give("laser", &items()));
    assert_eq!(belt.tools().len(), 2);
}

#[test]
fn restoring_forgets_tools_the_catalog_lacks() {
    let saved = vec!["flint_axe".to_owned(), "laser".to_owned()];
    let (belt, dropped) = Toolbelt::restore(saved, &items());
    assert_eq!(belt.tools(), ["flint_axe"]);
    assert_eq!(dropped, ["laser"]);
}
