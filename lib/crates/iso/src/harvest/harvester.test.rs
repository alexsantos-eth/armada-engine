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
fn a_full_inventory_refuses_the_harvest() {
    let items = items();
    let mut carried = Carried::starting(1, &items);
    carried.inventory.add("stone", 1, &items);
    let tree = target("tree", 1);
    let mut harvester = Harvester::default();
    assert_eq!(
        step(&mut harvester, true, Some(&tree), &carried, 50),
        HarvestStatus::Blocked {
            target: tree,
            reason: HarvestBlock::InventoryFull
        }
    );
}
