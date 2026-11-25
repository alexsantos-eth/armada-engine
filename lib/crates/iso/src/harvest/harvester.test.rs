//! Tests for the harvest machine: work accumulates while the key is held on one target, the
//! tool decides whether and how fast, and a full inventory refuses.

use super::*;
use crate::grid::WorldCoord;
use crate::inventory::Carried;
use crate::items::catalog::tests::{catalog_json, entities};
use crate::items::{ItemCatalog, ToolKind, parse_items};

fn items() -> ItemCatalog {
    parse_items(catalog_json(), &entities()).unwrap()
}

fn target(blueprint: &str, x: i32) -> HarvestTarget {
    HarvestTarget {
        id: format!("{blueprint}@{x},0"),
        anchor: WorldCoord { x, y: 0 },
        blueprint: blueprint.to_owned(),
        elevation: 0,
        nearest: WorldCoord { x: 1, y: 0 },
        gap: 0.0,
        in_reach: true,
    }
}

fn step(
    harvester: &mut Harvester,
    held: bool,
    target: Option<&HarvestTarget>,
    carried: &Carried,
    ticks: u32,
) -> HarvestStatus {
    harvester.step(
        HarvestInput {
            held,
            target,
            ticks,
        },
        carried,
        &items(),
    )
}

#[test]
fn nothing_in_reach_is_idle() {
    let carried = Carried::starting(4, &items());
    let mut harvester = Harvester::default();
    assert_eq!(
        step(&mut harvester, true, None, &carried, 5),
        HarvestStatus::Idle
    );
}

#[test]
fn a_target_in_reach_is_ready_until_the_key_is_held() {
    let carried = Carried::starting(4, &items());
    let tree = target("tree", 1);
    let mut harvester = Harvester::default();
    assert_eq!(
        step(&mut harvester, false, Some(&tree), &carried, 5),
        HarvestStatus::Ready {
            target: tree.clone()
        }
    );
}

#[test]
fn holding_the_key_finishes_after_the_rule_s_work() {
    let carried = Carried::starting(4, &items());
    let tree = target("tree", 1);
    let mut harvester = Harvester::default();
    assert_eq!(
        step(&mut harvester, true, Some(&tree), &carried, 39),
        HarvestStatus::Working {
            target: tree.clone(),
            progress: 390,
            total: 400,
        }
    );
    let done = step(&mut harvester, true, Some(&tree), &carried, 1);
    let HarvestStatus::Done { target, yields } = done else {
        panic!("expected the tree to fall, got {done:?}");
    };
    assert_eq!(target, tree);
    assert_eq!(yields[0].item, "wood");
    assert_eq!(yields[0].amount, 3);
    assert_eq!(
        step(&mut harvester, true, None, &carried, 1),
        HarvestStatus::Idle
    );
}

#[test]
fn letting_go_pauses_the_work_on_the_same_target() {
    let carried = Carried::starting(4, &items());
    let tree = target("tree", 1);
    let mut harvester = Harvester::default();
    step(&mut harvester, true, Some(&tree), &carried, 30);
    assert!(matches!(
        step(&mut harvester, false, Some(&tree), &carried, 5),
        HarvestStatus::Working { progress: 300, .. }
    ));
    assert!(matches!(
        step(&mut harvester, true, Some(&tree), &carried, 1),
        HarvestStatus::Working { progress: 310, .. }
    ));
}

#[test]
fn changing_or_losing_the_target_starts_over() {
    let carried = Carried::starting(4, &items());
    let tree = target("tree", 1);
    let other = target("tree", -1);
    let mut harvester = Harvester::default();
    step(&mut harvester, true, Some(&tree), &carried, 30);
    assert!(matches!(
        step(&mut harvester, true, Some(&other), &carried, 1),
        HarvestStatus::Working { progress: 10, .. }
    ));
    step(&mut harvester, true, None, &carried, 1);
    assert!(matches!(
        step(&mut harvester, true, Some(&other), &carried, 1),
        HarvestStatus::Working { progress: 10, .. }
    ));
}

#[test]
fn a_better_tool_gathers_faster() {
    let items = items();
    let mut carried = Carried::starting(4, &items);
    carried.toolbelt.give("copper_pickaxe", &items);
    let rock = target("rock_small", 1);
    let mut harvester = Harvester::default();
    assert!(matches!(
        step(&mut harvester, true, Some(&rock), &carried, 2),
        HarvestStatus::Working {
            progress: 70,
            total: 300,
            ..
        }
    ));
}

#[test]
fn without_the_right_tool_the_target_is_blocked() {
    let carried = Carried::starting(4, &items());
    let vein = target("ore_vein", 1);
    let mut harvester = Harvester::default();
    assert_eq!(
        step(&mut harvester, true, Some(&vein), &carried, 5),
        HarvestStatus::Blocked {
            target: vein,
            reason: HarvestBlock::NeedsTool {
                kind: ToolKind::Pickaxe,
                tier: 3
            }
        }
    );
}

#[test]
fn a_hand_rule_needs_no_tool() {
    let items = items();
    let carried = Carried {
        inventory: crate::inventory::Inventory::new(1),
        toolbelt: crate::inventory::Toolbelt::default(),
    };
    let grass = target("tall_grass", 1);
    let mut harvester = Harvester::default();
    let status = harvester.step(
        HarvestInput {
            held: true,
            target: Some(&grass),
            ticks: 10,
        },
        &carried,
        &items,
    );
    assert!(matches!(status, HarvestStatus::Done { .. }));
}

#[test]
fn a_full_inventory_does_not_stop_the_harvest() {
    let items = items();
    let mut carried = Carried::starting(1, &items);
    carried.inventory.add("stone", 1, &items);
    let tree = target("tree", 1);
    let mut harvester = Harvester::default();
    assert!(matches!(
        step(&mut harvester, true, Some(&tree), &carried, 50),
        HarvestStatus::Done { .. }
    ));
}

#[test]
fn blows_land_on_the_beat_of_the_swing() {
    let items = items();
    let carried = Carried::starting(4, &items);
    let tree = target("tree", 1);
    let mut harvester = Harvester::default();
    step(&mut harvester, true, Some(&tree), &carried, 2);
    assert_eq!(harvester.strikes(), 0);
    assert_eq!(harvester.swing(), 2);
    step(&mut harvester, true, Some(&tree), &carried, 1);
    assert_eq!(harvester.strikes(), 1);
    assert_eq!(harvester.swing(), HARVEST_STRIKE_AT);
    step(&mut harvester, true, Some(&tree), &carried, 5);
    assert_eq!(harvester.strikes(), 1);
    assert!(matches!(
        step(&mut harvester, true, Some(&tree), &carried, 1),
        HarvestStatus::Working {
            progress: 90,
            total: 400,
            ..
        }
    ));
    assert_eq!(harvester.strikes(), 2);
    assert_eq!(harvester.swing(), HARVEST_STRIKE_AT);
}

#[test]
fn letting_go_starts_the_next_swing_from_the_top_but_keeps_the_count() {
    let carried = Carried::starting(4, &items());
    let tree = target("tree", 1);
    let mut harvester = Harvester::default();
    step(
        &mut harvester,
        true,
        Some(&tree),
        &carried,
        HARVEST_STRIKE_AT + 2,
    );
    step(&mut harvester, false, Some(&tree), &carried, 1);
    assert_eq!(harvester.swing(), 0);
    assert_eq!(harvester.strikes(), 1);
}

#[test]
fn every_status_but_idle_names_its_target() {
    let tree = target("tree", 1);
    assert_eq!(HarvestStatus::Idle.target(), None);
    assert_eq!(
        HarvestStatus::Ready {
            target: tree.clone()
        }
        .target(),
        Some(&tree)
    );
    assert_eq!(
        HarvestStatus::Working {
            target: tree.clone(),
            progress: 1,
            total: 2
        }
        .target(),
        Some(&tree)
    );
}

#[test]
fn holding_the_key_on_a_target_out_of_reach_walks_up_to_it_first() {
    let carried = Carried::starting(4, &items());
    let far = HarvestTarget {
        in_reach: false,
        ..target("tree", 3)
    };
    let mut harvester = Harvester::default();
    assert_eq!(
        step(&mut harvester, true, Some(&far), &carried, 10),
        HarvestStatus::Approaching {
            target: far.clone()
        }
    );
    assert_eq!(harvester.strikes(), 0);
    let near = HarvestTarget {
        gap: 0.0,
        in_reach: true,
        ..far
    };
    assert!(matches!(
        step(&mut harvester, true, Some(&near), &carried, 1),
        HarvestStatus::Working { progress: 10, .. }
    ));
}
