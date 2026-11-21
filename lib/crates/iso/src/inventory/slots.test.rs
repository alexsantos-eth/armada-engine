//! Tests for the slot inventory: stacking, overflow, taking and refusing what does not fit.

use super::*;
use crate::items::catalog::tests::{catalog_json, entities};
use crate::items::{HarvestYield, ItemCatalog, parse_items};

fn items() -> ItemCatalog {
    parse_items(catalog_json(), &entities()).unwrap()
}

fn yields(pairs: &[(&str, u32)]) -> Vec<HarvestYield> {
    pairs
        .iter()
        .map(|(item, amount)| HarvestYield {
            item: (*item).to_owned(),
            amount: *amount,
        })
        .collect()
}

#[test]
fn a_new_inventory_is_empty() {
    let inventory = Inventory::new(4);
    assert_eq!(inventory.capacity(), 4);
    assert!(inventory.slots().iter().all(Option::is_none));
    assert_eq!(inventory.count("wood"), 0);
}

#[test]
fn adding_fills_the_first_free_slot() {
    let mut inventory = Inventory::new(3);
    assert_eq!(inventory.add("wood", 3, &items()), 0);
    assert_eq!(
        inventory.slots()[0],
        Some(ItemStack {
            item: "wood".into(),
            count: 3
        })
    );
    assert_eq!(inventory.slots()[1], None);
}

#[test]
fn adding_tops_up_a_partial_stack_before_opening_a_new_one() {
    let mut inventory = Inventory::new(3);
    inventory.add("wood", 48, &items());
    inventory.add("stone", 1, &items());
    assert_eq!(inventory.add("wood", 5, &items()), 0);
    assert_eq!(inventory.slots()[0].as_ref().unwrap().count, 50);
    assert_eq!(inventory.slots()[1].as_ref().unwrap().item, "stone");
    assert_eq!(inventory.slots()[2].as_ref().unwrap().count, 3);
    assert_eq!(inventory.count("wood"), 53);
}

#[test]
fn what_does_not_fit_is_left_over() {
    let mut inventory = Inventory::new(2);
    assert_eq!(inventory.add("wood", 120, &items()), 20);
    assert_eq!(inventory.count("wood"), 100);
}

#[test]
fn an_unknown_item_is_never_taken() {
    let mut inventory = Inventory::new(2);
    assert_eq!(inventory.add("gold", 4, &items()), 4);
    assert_eq!(inventory.count("gold"), 0);
}

#[test]
fn fits_checks_every_yield_together() {
    let mut inventory = Inventory::new(2);
    inventory.add("wood", 50, &items());
    assert!(inventory.fits(&yields(&[("stone", 50)]), &items()));
    assert!(!inventory.fits(&yields(&[("stone", 2), ("fiber", 1)]), &items()));
    assert!(!inventory.fits(&yields(&[("stone", 51)]), &items()));
    assert_eq!(inventory.count("stone"), 0);
}

#[test]
fn taking_empties_slots_from_the_last_one() {
    let mut inventory = Inventory::new(3);
    inventory.add("wood", 60, &items());
    assert!(inventory.take("wood", 15));
    assert_eq!(inventory.count("wood"), 45);
    assert_eq!(inventory.slots()[1], None);
    assert!(!inventory.take("wood", 46));
    assert_eq!(inventory.count("wood"), 45);
}

#[test]
fn restoring_drops_stacks_of_unknown_items_and_trims_to_capacity() {
    let saved = vec![
        Some(ItemStack {
            item: "wood".into(),
            count: 70,
        }),
        Some(ItemStack {
            item: "gold".into(),
            count: 1,
        }),
        None,
        Some(ItemStack {
            item: "stone".into(),
            count: 2,
        }),
    ];
    let (inventory, dropped) = Inventory::restore(3, saved, &items());
    assert_eq!(dropped, ["gold"]);
    assert_eq!(inventory.capacity(), 3);
    assert_eq!(inventory.count("wood"), 50);
    assert_eq!(inventory.slots()[1], None);
    assert_eq!(inventory.count("stone"), 0);
}
