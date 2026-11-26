//! Tests for which pieces of a felled entity stay as items.

use super::*;
use crate::debris::Part;
use crate::items::catalog::tests::{catalog_json, entities};
use crate::items::parse_items;

fn items() -> ItemCatalog {
    parse_items(catalog_json(), &entities()).unwrap()
}

fn parts(names: &[&str]) -> EntityParts {
    EntityParts {
        tiles: [1, 1, 2],
        parts: names
            .iter()
            .map(|name| Part {
                piece: (*name).to_owned(),
                at: [0.0, 0.0, 0.0],
                sprite: format!("debris/p_{name}"),
                shift: [0.0, 0.0],
            })
            .collect(),
    }
}

fn gain(item: &str, amount: u32) -> HarvestYield {
    HarvestYield {
        item: item.to_owned(),
        amount,
    }
}

#[test]
fn one_piece_per_unit_among_the_pieces_the_item_names() {
    let parts = parts(&["trunk", "leaf_block", "trunk", "branch", "trunk"]);
    let plan = plan_pieces(&parts, &[gain("wood", 3)], &items(), 1);
    assert_eq!(plan.picks.len(), 3);
    assert!(plan.rest.is_empty());
    let mut chosen = plan.parts();
    chosen.sort_unstable();
    chosen.dedup();
    assert_eq!(chosen.len(), 3, "no piece is picked twice");
    assert!(!chosen.contains(&1), "a leaf is not wood");
    assert!(plan.picks.iter().all(|pick| pick.amount == 1));
}

#[test]
fn the_same_seed_picks_the_same_pieces() {
    let parts = parts(&["trunk", "trunk", "trunk", "trunk", "branch", "branch"]);
    let first = plan_pieces(&parts, &[gain("wood", 2)], &items(), 9);
    assert_eq!(first, plan_pieces(&parts, &[gain("wood", 2)], &items(), 9));
}

#[test]
fn an_entity_with_two_logs_gives_two_even_if_the_harvest_says_five() {
    let parts = parts(&["trunk", "branch"]);
    let plan = plan_pieces(&parts, &[gain("wood", 5)], &items(), 4);
    assert_eq!(plan.picks.len(), 2);
    assert!(plan.picks.iter().all(|pick| pick.amount == 1));
    assert!(plan.rest.is_empty());
}

#[test]
fn the_limit_caps_the_pieces() {
    let parts = parts(&["trunk"; 20]);
    let plan = plan_pieces(&parts, &[gain("wood", 12)], &items(), 2);
    assert_eq!(plan.picks.len(), MAX_PIECE_DROPS);
}

#[test]
fn what_no_piece_stands_for_drops_as_plain_heaps() {
    let parts = parts(&["rock_s", "pebble_s"]);
    let plan = plan_pieces(&parts, &[gain("wood", 2), gain("stone", 1)], &items(), 5);
    assert_eq!(plan.rest, [gain("wood", 2)]);
    assert_eq!(
        plan.picks,
        [PiecePick {
            part: 0,
            item: "stone".into(),
            amount: 1
        }]
    );
}
