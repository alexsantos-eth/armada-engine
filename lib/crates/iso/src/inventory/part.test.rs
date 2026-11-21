//! Tests for the inventory's part of a save: written next to the world part and read back.

use super::*;
use crate::items::catalog::tests::{catalog_json, entities};
use crate::items::{ItemCatalog, parse_items};

fn items() -> ItemCatalog {
    parse_items(catalog_json(), &entities()).unwrap()
}

fn carried() -> Carried {
    let items = items();
    let mut inventory = Inventory::new(4);
    inventory.add("wood", 7, &items);
    inventory.add("stone", 2, &items);
    let mut toolbelt = Toolbelt::starting(&items);
    toolbelt.give("copper_pickaxe", &items);
    Carried {
        inventory,
        toolbelt,
    }
}

#[test]
fn the_part_sits_beside_the_other_systems() {
    let systems = crate::world::seed_systems(9);
    let written = with_carried(systems, &carried());
    assert_eq!(crate::world::saved_seed(&written), Some(9));
    assert_eq!(written[INVENTORY_PART]["version"], INVENTORY_PART_VERSION);
}

#[test]
fn what_is_written_reads_back_the_same() {
    let written = with_carried(serde_json::json!({}), &carried());
    let restored = saved_carried(&written, 4, &items()).unwrap();
    assert_eq!(restored.carried, carried());
    assert!(restored.dropped.is_empty());
}

#[test]
fn a_save_without_the_part_has_nothing_carried() {
    assert_eq!(saved_carried(&serde_json::json!({}), 4, &items()), None);
}

#[test]
fn a_part_of_another_version_is_not_read() {
    let mut written = with_carried(serde_json::json!({}), &carried());
    written[INVENTORY_PART]["version"] = 99.into();
    assert_eq!(saved_carried(&written, 4, &items()), None);
}

#[test]
fn unknown_items_and_tools_are_reported_and_left_out() {
    let mut written = with_carried(serde_json::json!({}), &carried());
    written[INVENTORY_PART]["slots"][0]["item"] = "gold".into();
    written[INVENTORY_PART]["tools"][0] = "laser".into();
    let restored = saved_carried(&written, 4, &items()).unwrap();
    assert_eq!(restored.dropped, ["gold", "laser"]);
    assert_eq!(restored.carried.inventory.count("wood"), 0);
    assert_eq!(
        restored.carried.toolbelt.tools(),
        ["stone_pickaxe", "copper_pickaxe"]
    );
}
