//! Tests for what the HTML HUD is told about the harvest.

use super::*;
use iso::grid::WorldCoord;
use iso::harvest::{HarvestBlock, HarvestStatus, HarvestTarget};
use iso::inventory::Carried;
use iso::items::{HarvestYield, ItemCatalog, ToolKind};

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
    let frame = hud_frame(&carried(&items), &items, &HarvestStatus::Idle, None, false);
    assert!(frame.visible);
    assert_eq!(frame.slots.len(), 4);
    let first = frame.slots[0].as_ref().unwrap();
    assert_eq!(
        (first.item.as_str(), first.name.as_str(), first.count),
        ("wood", "Madera", 7)
    );
    assert!(frame.slots[1..].iter().all(Option::is_none));
    assert_eq!(frame.prompt, None);
}

#[test]
fn a_tree_in_sight_is_felled_with_the_axe() {
    let items = items();
    let status = HarvestStatus::Ready {
        target: target("tree"),
    };
    let prompt = hud_frame(&carried(&items), &items, &status, None, false)
        .prompt
        .unwrap();
    assert_eq!(prompt.text, "Madera");
    assert_eq!((prompt.verb, prompt.tool), ("Talar", "axe"));
    assert_eq!(prompt.progress, None);
    assert!(!prompt.blocked);
}

#[test]
fn work_under_way_reports_its_share_in_hundredths() {
    let items = items();
    let status = HarvestStatus::Working {
        target: target("rock_small"),
        progress: 1,
        total: 3,
    };
    let prompt = hud_frame(&carried(&items), &items, &status, None, false)
        .prompt
        .unwrap();
    assert_eq!((prompt.verb, prompt.tool), ("Picar", "pickaxe"));
    assert_eq!(prompt.progress, Some(0.33));
}

#[test]
fn what_is_gathered_by_hand_is_picked_up() {
    let items = items();
    let status = HarvestStatus::Ready {
        target: target("bush"),
    };
    let prompt = hud_frame(&carried(&items), &items, &status, None, false)
        .prompt
        .unwrap();
    assert_eq!((prompt.verb, prompt.tool), ("Recoger", "hand"));
}

#[test]
fn a_missing_tool_blocks_the_prompt() {
    let items = items();
    let status = HarvestStatus::Blocked {
        target: target("ore_vein"),
        reason: HarvestBlock::NeedsTool {
            kind: ToolKind::Pickaxe,
            tier: 3,
        },
    };
    let prompt = hud_frame(&carried(&items), &items, &status, None, true)
        .prompt
        .unwrap();
    assert!(prompt.blocked);
    assert_eq!(prompt.text, "Necesitas pico nivel 3");
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
    );
    assert_eq!(full.note.as_deref(), Some("Inventario lleno"));
    let gained = hud_frame(
        &carried(&items),
        &items,
        &HarvestStatus::Idle,
        Some("+3 Madera"),
        false,
    );
    assert_eq!(gained.note, None);
}

#[test]
fn each_gain_flies_from_the_player() {
    let items = items();
    let yields = [
        HarvestYield {
            item: "copper_ore".into(),
            amount: 2,
        },
        HarvestYield {
            item: "stone".into(),
            amount: 1,
        },
    ];
    let gains = gains(&yields, &items, (0.5, 0.25));
    assert_eq!(gains.len(), 2);
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
fn a_screen_point_becomes_a_share_of_the_screen() {
    assert_eq!(screen_share(400.0, 150.0, 800.0, 600.0), (0.5, 0.25));
    assert_eq!(screen_share(-20.0, 900.0, 800.0, 600.0), (0.0, 1.0));
    assert_eq!(screen_share(10.0, 10.0, 0.0, 0.0), (0.5, 0.5));
}
