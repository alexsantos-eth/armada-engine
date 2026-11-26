//! Tests for the items lying on the ground: where a felling drops them, picking them up and
//! their part of a save.

use super::*;
use crate::drops::plan_pieces;
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

/// One piece drop per unit of `gained`, all lying on the tile centre `(4, 7)` at level 2.
fn lay(drops: &mut Drops, gained: &[HarvestYield]) {
    for gain in gained {
        for _ in 0..gain.amount {
            drops.list.push(Drop {
                id: drops.next_id,
                item: gain.item.clone(),
                amount: 1,
                at: GridPoint { x: 4.0, y: 7.0 },
                elevation: 2.0,
                from: GridPoint { x: 4.0, y: 7.0 },
                wait: PICKUP_DELAY_TICKS,
                piece: DropPiece {
                    sprite: "debris/p_test".into(),
                    shift: [0.0, 0.0],
                },
            });
            drops.next_id += 1;
        }
    }
}

#[test]
fn walking_over_a_heap_picks_it_up() {
    let items = items();
    let mut drops = Drops::default();
    lay(&mut drops, &yields(&[("wood", 3)]));
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
    lay(&mut drops, &yields(&[("wood", 60)]));
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
    lay(&mut drops, &yields(&[("wood", 55)]));
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
    lay(&mut drops, &yields(&[("wood", 3)]));
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
    lay(&mut drops, &yields(&[("wood", 3), ("gold", 1)]));
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
    lay(&mut more, &yields(&[("stone", 1)]));
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
    lay(&mut drops, &yields(&[("wood", 3)]));
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
fn a_plain_heap_from_an_older_save_is_left_out_when_restored() {
    let items = items();
    let systems = serde_json::json!({
        "drops": {
            "version": 1,
            "next_id": 4,
            "drops": [{
                "id": 3, "item": "wood", "amount": 3,
                "at": {"x": 4.0, "y": 7.0},
                "from": {"x": 4.0, "y": 7.0},
                "elevation": 2.0
            }]
        }
    });
    let mut drops = saved_drops(&systems, &items).unwrap();
    assert!(drops.list().is_empty());
    lay(&mut drops, &yields(&[("wood", 1)]));
    assert_eq!(drops.list()[0].id, 4, "ids are never reused");
}

fn tree_parts() -> EntityParts {
    let part = |piece: &str, at: [f64; 3]| crate::debris::Part {
        piece: piece.to_owned(),
        at,
        sprite: format!("debris/p_{piece}"),
        shift: [0.0, 0.0],
        collect: true,
    };
    EntityParts {
        tiles: [1, 1, 2],
        parts: vec![
            part("trunk", [0.0, 0.0, 0.0]),
            part("trunk", [0.0, 0.0, 85.0]),
            part("branch", [30.0, 0.0, 85.0]),
            part("leaf_block", [0.0, 40.0, 170.0]),
        ],
    }
}

#[test]
fn a_piece_drop_floats_where_its_piece_lands_within_reach() {
    let parts = tree_parts();
    let plan = plan_pieces(&parts, &yields(&[("wood", 2)]), &items(), 11);
    let mut drops = Drops::default();
    drops.spawn_pieces(felled(), &parts, 11, &plan.picks);
    assert_eq!(drops.list().len(), 2);
    for drop in drops.list() {
        let piece = &drop.piece;
        assert!(piece.sprite.starts_with("debris/p_"));
        assert_eq!((drop.item.as_str(), drop.amount), ("wood", 1));
        let off = (drop.at.x - 4.0).hypot(drop.at.y - 7.0);
        assert!(off <= PIECE_SCATTER + 1e-9, "{off} columns is out of reach");
        assert_eq!(drop.wait, PICKUP_DELAY_TICKS);
    }
    let mut again = Drops::default();
    again.spawn_pieces(felled(), &parts, 11, &plan.picks);
    assert_eq!(
        again.list(),
        drops.list(),
        "the same felling lands the same"
    );
}

#[test]
fn a_piece_drop_is_saved_and_read_back_and_an_old_heap_still_loads() {
    let parts = tree_parts();
    let plan = plan_pieces(&parts, &yields(&[("wood", 1)]), &items(), 3);
    let mut drops = Drops::default();
    drops.spawn_pieces(felled(), &parts, 3, &plan.picks);
    lay(&mut drops, &yields(&[("stone", 1)]));
    let written = with_drops(serde_json::json!({}), &drops);
    assert_eq!(
        saved_drops(&written, &items()).unwrap().list(),
        drops.list()
    );
}
