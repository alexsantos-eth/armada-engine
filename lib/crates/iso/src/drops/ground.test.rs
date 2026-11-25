//! Tests for the items lying on the ground: where a felling drops them, picking them up and
//! their part of a save.

use super::*;
use crate::inventory::Inventory;
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

fn felled() -> Felled<'static> {
    Felled {
        id: "tree@4,7",
        anchor: WorldCoord { x: 4, y: 7 },
        elevation: 2,
    }
}

#[test]
fn a_felling_drops_one_item_per_unit_around_where_it_stood() {
    let mut drops = Drops::default();
    drops.spawn(felled(), &yields(&[("wood", 3), ("stone", 1)]));
    assert_eq!(drops.list().len(), 4);
    for (index, drop) in drops.list().iter().enumerate() {
        let item = if index < 3 { "wood" } else { "stone" };
        assert_eq!((drop.item.as_str(), drop.amount), (item, 1));
        assert_eq!(drop.elevation, 2.0);
        assert_eq!(drop.from, GridPoint { x: 4.0, y: 7.0 });
        assert!((drop.at.x - 4.0).hypot(drop.at.y - 7.0) <= DROP_SCATTER + 1e-9);
        for previous in &drops.list()[..index] {
            assert_ne!(drop.at, previous.at);
            assert_ne!(drop.id, previous.id);
        }
    }
}

#[test]
fn the_same_felling_always_drops_in_the_same_places() {
    let mut one = Drops::default();
    let mut other = Drops::default();
    one.spawn(felled(), &yields(&[("wood", 3)]));
    other.spawn(felled(), &yields(&[("wood", 3)]));
    assert_eq!(one, other);
}

#[test]
fn walking_over_a_heap_picks_it_up() {
    let items = items();
    let mut drops = Drops::default();
    drops.spawn(felled(), &yields(&[("wood", 3)]));
    let at = GridPoint { x: 4.0, y: 7.0 };
    let mut inventory = Inventory::new(4);
    let far = drops.collect(
        Feet {
            at: GridPoint {
                x: at.x + 2.0,
                y: at.y,
            },
            elevation: 2.0,
        },
        &mut inventory,
        &items,
        PICKUP_DELAY_TICKS,
    );
    assert!(far.gained.is_empty());
    let near = drops.collect(
        Feet { at, elevation: 2.0 },
        &mut inventory,
        &items,
        PICKUP_DELAY_TICKS,
    );
    assert_eq!(near.gained, yields(&[("wood", 3)]));
    assert!(!near.refused);
    assert!(drops.list().is_empty());
    assert_eq!(inventory.count("wood"), 3);
}

#[test]
fn what_does_not_fit_stays_on_the_ground() {
    let items = items();
    let mut drops = Drops::default();
    drops.spawn(felled(), &yields(&[("wood", 60)]));
    let at = GridPoint { x: 4.0, y: 7.0 };
    let mut inventory = Inventory::new(1);
    let feet = Feet { at, elevation: 2.0 };
    let first = drops.collect(feet, &mut inventory, &items, PICKUP_DELAY_TICKS);
    assert_eq!(first.gained, yields(&[("wood", 50)]));
    assert_eq!(first.stacks[0].amount, 50);
    assert!(first.refused);
    assert_eq!(drops.list().len(), 10);
    assert!(drops.list().iter().all(|drop| drop.amount == 1));
    let again = drops.collect(feet, &mut inventory, &items, PICKUP_DELAY_TICKS);
    assert!(again.gained.is_empty());
    assert!(again.stacks.is_empty());
    assert!(again.refused);
}

#[test]
fn a_pickup_reports_the_partial_stack_and_new_slots_it_fills() {
    let items = items();
    let mut inventory = Inventory::new(4);
    inventory.add("wood", 48, &items);
    inventory.add("stone", 1, &items);
    let mut drops = Drops::default();
    drops.spawn(felled(), &yields(&[("wood", 55)]));
    let feet = Feet {
        at: GridPoint { x: 4.0, y: 7.0 },
        elevation: 2.0,
    };
    let picked = drops.collect(feet, &mut inventory, &items, PICKUP_DELAY_TICKS);
    assert_eq!(picked.gained, yields(&[("wood", 55)]));
    assert_eq!(
        picked.stacks,
        [(0, 2), (2, 50), (3, 3)].map(|(slot, amount)| StackGain {
            slot,
            item: "wood".into(),
            amount,
        }),
    );
    assert!(!picked.refused);
}

#[test]
fn a_heap_on_another_level_is_not_picked_up() {
    let items = items();
    let mut drops = Drops::default();
    drops.spawn(felled(), &yields(&[("wood", 3)]));
    let at = GridPoint { x: 4.0, y: 7.0 };
    let mut inventory = Inventory::new(4);
    let gained = drops.collect(
        Feet { at, elevation: 5.0 },
        &mut inventory,
        &items,
        PICKUP_DELAY_TICKS,
    );
    assert!(gained.gained.is_empty());
}

#[test]
fn the_heaps_read_back_from_a_save_as_they_were() {
    let items = items();
    let mut drops = Drops::default();
    drops.spawn(felled(), &yields(&[("wood", 3), ("gold", 1)]));
    let written = with_drops(crate::world::seed_systems(5), &drops);
    assert_eq!(crate::world::saved_seed(&written), Some(5));
    let restored = saved_drops(&written, &items).unwrap();
    assert_eq!(
        restored.list().len(),
        3,
        "an item the catalog lacks is left out"
    );
    assert_eq!(restored.list(), &drops.list()[..3]);
    let mut more = restored.clone();
    more.spawn(
        Felled {
            id: "rock@0,0",
            anchor: WorldCoord { x: 0, y: 0 },
            elevation: 0,
        },
        &yields(&[("stone", 1)]),
    );
    assert!(
        more.list()[3].id > drops.list()[3].id,
        "new heaps never reuse an id"
    );
    assert_eq!(saved_drops(&serde_json::json!({}), &items), None);
}

#[test]
fn a_new_heap_waits_a_moment_before_it_can_be_picked_up() {
    let items = items();
    let mut drops = Drops::default();
    drops.spawn(felled(), &yields(&[("wood", 3)]));
    let feet = Feet {
        at: GridPoint { x: 4.0, y: 7.0 },
        elevation: 2.0,
    };
    let mut inventory = Inventory::new(4);
    let early = drops.collect(feet, &mut inventory, &items, PICKUP_DELAY_TICKS - 1);
    assert!(early.gained.is_empty());
    let late = drops.collect(feet, &mut inventory, &items, 1);
    assert_eq!(late.gained, yields(&[("wood", 3)]));
}

#[test]
fn a_legacy_heap_keeps_its_amount_when_restored_and_picked_up() {
    let items = items();
    let systems = serde_json::json!({
        "drops": {
            "version": 1,
            "next_id": 1,
            "drops": [{
                "id": 0, "item": "wood", "amount": 3,
                "at": {"x": 4.0, "y": 7.0},
                "from": {"x": 4.0, "y": 7.0},
                "elevation": 2.0
            }]
        }
    });
    let mut drops = saved_drops(&systems, &items).unwrap();
    assert_eq!(drops.list()[0].amount, 3);
    let mut inventory = Inventory::new(1);
    let feet = Feet {
        at: drops.list()[0].at,
        elevation: 2.0,
    };
    assert_eq!(
        drops.collect(feet, &mut inventory, &items, 1).gained,
        yields(&[("wood", 3)])
    );
    assert!(drops.list().is_empty());
}
