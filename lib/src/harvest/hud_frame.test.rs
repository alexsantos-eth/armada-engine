//! Tests for what the HUD is told about the harvest.

use super::*;
use iso::grid::WorldCoord;
use iso::harvest::{HarvestBlock, HarvestStatus, HarvestTarget};
use iso::inventory::Carried;
use iso::items::{ItemCatalog, ToolKind};

fn items() -> ItemCatalog {
    let entities: iso::entities::EntityCatalog =
        serde_json::from_str(include_str!("../../content/json/entities.json")).unwrap();
    iso::items::parse_items(include_str!("../../content/json/items.json"), &entities).unwrap()
}

fn target(blueprint: &str) -> HarvestTarget {
    HarvestTarget {
        id: format!("{blueprint}@1,0"),
        anchor: WorldCoord { x: 1, y: 0 },
        blueprint: blueprint.into(),
        elevation: 0,
        nearest: WorldCoord { x: 1, y: 0 },
        gap: 0.0,
        in_reach: true,
    }
}

fn carried(items: &ItemCatalog) -> Carried {
    let mut carried = Carried::starting(4, items);
    carried.inventory.add("wood", 7, items);
    carried
}

#[test]
fn the_frame_lists_every_slot_with_names() {
    let items = items();
    let frame = hud_frame(
        &carried(&items),
        &items,
        &HarvestStatus::Idle,
        None,
        false,
        None,
        false,
    );
    assert!(frame.visible);
    assert_eq!(frame.slots.len(), 4);
    let first = frame.slots[0].as_ref().unwrap();
    assert_eq!(
        (first.item.as_str(), first.name.as_str(), first.count),
        ("wood", "Tronco", 7)
    );
    assert!(frame.slots[1..].iter().all(Option::is_none));
    assert_eq!(frame.action, None);
    assert_eq!(frame.progress, None);
    assert_eq!(frame.progress_at, None);
    assert_eq!(frame.progress_name, None);
}

#[test]
fn a_tree_in_sight_is_felled_with_the_axe() {
    let items = items();
    let status = HarvestStatus::Ready {
        target: target("tree"),
    };
    let action = hud_frame(&carried(&items), &items, &status, None, false, None, false)
        .action
        .unwrap();
    assert_eq!(
        (action.verb.as_str(), action.tool.as_str()),
        ("Talar", "flint_axe")
    );
}

#[test]
fn work_under_way_reports_its_share_and_where_it_sits() {
    let items = items();
    let status = HarvestStatus::Working {
        target: target("rock_small"),
        progress: 1,
        total: 3,
    };
    let frame = hud_frame(
        &carried(&items),
        &items,
        &status,
        None,
        false,
        Some((10.0, 20.0)),
        false,
    );
    assert_eq!(frame.progress, Some(0.33));
    assert_eq!(frame.progress_at, Some((10.0, 20.0)));
    assert_eq!(frame.progress_name, Some("Roca".into()));
    let action = frame.action.unwrap();
    assert_eq!(
        (action.verb.as_str(), action.tool.as_str()),
        ("Picar", "stone_pickaxe")
    );
}

#[test]
fn what_is_gathered_by_hand_is_picked_up() {
    let items = items();
    let status = HarvestStatus::Ready {
        target: target("bush"),
    };
    let action = hud_frame(&carried(&items), &items, &status, None, false, None, false)
        .action
        .unwrap();
    assert_eq!(
        (action.verb.as_str(), action.tool.as_str()),
        ("Recoger", "hand")
    );
}

#[test]
fn a_missing_tool_shows_no_action() {
    let items = items();
    let status = HarvestStatus::Blocked {
        target: target("ore_vein"),
        reason: HarvestBlock::NeedsTool {
            kind: ToolKind::Pickaxe,
            tier: 3,
        },
    };
    let frame = hud_frame(&carried(&items), &items, &status, None, true, None, false);
    assert_eq!(frame.action, None);
    assert_eq!(frame.progress, None);
}

#[test]
fn only_the_full_inventory_note_reaches_the_kit() {
    let items = items();
    let full = hud_frame(
        &carried(&items),
        &items,
        &HarvestStatus::Idle,
        Some(crate::harvest::hotbar::FULL_NOTE),
        false,
        None,
        false,
    );
    assert_eq!(full.note.as_deref(), Some("Inventario lleno"));
    let gained = hud_frame(
        &carried(&items),
        &items,
        &HarvestStatus::Idle,
        Some("+3 Tronco"),
        false,
        None,
        false,
    );
    assert_eq!(gained.note, None);
}

#[test]
fn each_gain_flies_from_the_player() {
    let items = items();
    let yields = [
        StackGain {
            slot: 2,
            item: "copper_ore".into(),
            amount: 2,
        },
        StackGain {
            slot: 0,
            item: "stone".into(),
            amount: 1,
        },
    ];
    let gains = gains(&yields, &items, (0.5, 0.25));
    assert_eq!(gains.len(), 2);
    assert_eq!([gains[0].slot, gains[1].slot], [2, 0]);
    assert_eq!(
        (
            gains[0].item.as_str(),
            gains[0].name.as_str(),
            gains[0].amount
        ),
        ("copper_ore", "Cobre", 2)
    );
    assert_eq!((gains[1].x, gains[1].y), (0.5, 0.25));
}

#[test]
fn collecting_more_wood_keeps_a_full_stack_at_its_limit_during_the_flight() {
    let items = items();
    let mut carried = Carried::starting(4, &items);
    let limit = items.item("wood").unwrap().stack;
    carried.inventory.add("wood", limit, &items);
    let mut drops = iso::drops::Drops::default();
    let parts = iso::debris::EntityParts {
        tiles: [1, 1, 1],
        parts: vec![iso::debris::Part {
            piece: "trunk".into(),
            at: [0.0, 0.0, 0.0],
            sprite: "debris/p_test".into(),
            shift: [0.0, 0.0],
            collect: true,
        }],
    };
    drops.spawn_pieces(
        iso::drops::Felled {
            id: "tree@0,0",
            anchor: WorldCoord { x: 0, y: 0 },
            elevation: 0,
        },
        &parts,
        1,
        &[iso::drops::PiecePick {
            part: 0,
            item: "wood".into(),
            amount: 3,
        }],
        &|_, _| {
            Some(iso::debris::Floor {
                top: 0.0,
                water: false,
            })
        },
    );
    let picked = drops.collect(
        iso::harvest::Feet {
            at: iso::projection::GridPoint { x: 0.0, y: 0.0 },
            elevation: 0.0,
        },
        &mut carried.inventory,
        &items,
        iso::drops::PICKUP_DELAY_TICKS,
    );
    let frame = hud_frame(
        &carried,
        &items,
        &HarvestStatus::Idle,
        None,
        false,
        None,
        false,
    );
    let mut hud = crate::ui::ClayHud::default();
    hud.apply(
        &frame,
        &gains(&picked.stacks, &items, (0.5, 0.5)),
        (800.0, 600.0),
    );
    let full = frame.slots[0].as_ref().unwrap();
    let overflow = frame.slots[1].as_ref().unwrap();
    assert_eq!(hud.shown_count(0, full.count), limit);
    assert_eq!(hud.shown_count(1, overflow.count), 0);
    assert_eq!(hud.flights.len(), 1);
    assert_eq!(hud.flights[0].slot, 1);
    hud.advance(1_000.0);
    assert_eq!(hud.shown_count(0, full.count), limit);
    assert_eq!(hud.shown_count(1, overflow.count), 3);
    assert!(hud.bump_age(0).is_none());
    assert!(hud.bump_age(1).is_some());
}

#[test]
fn a_screen_point_becomes_a_share_of_the_screen() {
    assert_eq!(screen_share(400.0, 150.0, 800.0, 600.0), (0.5, 0.25));
    assert_eq!(screen_share(-20.0, 900.0, 800.0, 600.0), (0.0, 1.0));
    assert_eq!(screen_share(10.0, 10.0, 0.0, 0.0), (0.5, 0.5));
}

#[test]
fn next_to_a_market_the_action_button_trades() {
    let items = items();
    let status = HarvestStatus::Idle;
    let frame = hud_frame(&carried(&items), &items, &status, None, true, None, true);
    let action = frame.action.expect("the button shows next to a market");
    assert_eq!(action.verb, "Comerciar");
    assert_eq!(action.tool, "hand");
}

#[test]
fn the_action_shows_the_best_tool_carried_of_the_family() {
    let items = items();
    let mut held = carried(&items);
    held.toolbelt.give("copper_pickaxe", &items);
    let status = HarvestStatus::Ready {
        target: target("rock_small"),
    };
    let action = hud_frame(&held, &items, &status, None, false, None, false)
        .action
        .unwrap();
    assert_eq!(action.tool, "copper_pickaxe");
    let tools: Vec<_> = hud_frame(&held, &items, &status, None, false, None, false)
        .tools
        .into_iter()
        .map(|tool| tool.icon)
        .collect();
    assert_eq!(
        tools,
        ["flint_axe", "stone_pickaxe", "fiber_net", "copper_pickaxe"]
    );
}
