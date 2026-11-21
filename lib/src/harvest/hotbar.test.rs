//! Tests for the hotbar's pure rules: where the slots sit, what each says and the gather prompt.

use super::*;
use iso::grid::WorldCoord;
use iso::harvest::{HarvestBlock, HarvestStatus, HarvestTarget};
use iso::inventory::ItemStack;
use iso::items::{HarvestYield, ItemCatalog, ToolKind};

fn items() -> ItemCatalog {
    let entities: iso::entities::EntityCatalog =
        serde_json::from_str(include_str!("../../content/json/entities.json")).unwrap();
    iso::items::parse_items(include_str!("../../content/json/items.json"), &entities).unwrap()
}

fn tree() -> HarvestTarget {
    HarvestTarget {
        id: "tree@1,0".into(),
        anchor: WorldCoord { x: 1, y: 0 },
        blueprint: "tree".into(),
        elevation: 0,
    }
}

#[test]
fn the_slots_sit_centred_along_the_bottom() {
    let rects = slot_rects(1280.0, 800.0, 12);
    assert_eq!(rects.len(), 12);
    let left = rects[0].x;
    let right = rects[11].x + rects[11].size;
    assert!(((left + right) / 2.0 - 640.0).abs() < 0.01);
    assert!(
        rects
            .iter()
            .all(|rect| rect.y + rect.size <= 800.0 - SLOT_MARGIN + 0.01)
    );
    assert!(rects[1].x > rects[0].x + rects[0].size);
}

#[test]
fn the_slots_shrink_to_fit_a_narrow_screen() {
    let rects = slot_rects(360.0, 640.0, 12);
    assert!(rects[0].x >= SLOT_MARGIN - 0.01);
    assert!(rects[11].x + rects[11].size <= 360.0 - SLOT_MARGIN + 0.01);
}

#[test]
fn a_slot_shows_its_item_s_name_and_count() {
    let stack = ItemStack {
        item: "wood".into(),
        count: 7,
    };
    assert_eq!(
        slot_label(&stack, &items()),
        ("Madera".to_owned(), "7".to_owned())
    );
}

#[test]
fn nothing_in_reach_prompts_nothing() {
    assert_eq!(prompt(&HarvestStatus::Idle, &items()), None);
}

#[test]
fn a_target_in_reach_tells_the_key_and_what_it_gives() {
    let ready = prompt(&HarvestStatus::Ready { target: tree() }, &items()).unwrap();
    assert_eq!(ready.text, "Manten E: Madera");
    assert_eq!(ready.progress, None);
}

#[test]
fn work_under_way_shows_its_share() {
    let working = prompt(
        &HarvestStatus::Working {
            target: tree(),
            progress: 100,
            total: 400,
        },
        &items(),
    )
    .unwrap();
    assert_eq!(working.progress, Some(0.25));
}

#[test]
fn a_blocked_target_says_why() {
    let tool = prompt(
        &HarvestStatus::Blocked {
            target: tree(),
            reason: HarvestBlock::NeedsTool {
                kind: ToolKind::Pickaxe,
                tier: 3,
            },
        },
        &items(),
    )
    .unwrap();
    assert_eq!(tool.text, "Necesitas pico nivel 3");
    let full = prompt(
        &HarvestStatus::Blocked {
            target: tree(),
            reason: HarvestBlock::InventoryFull,
        },
        &items(),
    )
    .unwrap();
    assert_eq!(full.text, "Inventario lleno");
}

#[test]
fn a_finished_harvest_reads_as_what_was_gained() {
    let yields = vec![
        HarvestYield {
            item: "copper_ore".into(),
            amount: 2,
        },
        HarvestYield {
            item: "stone".into(),
            amount: 1,
        },
    ];
    assert_eq!(gain_text(&yields, &items()), "+2 Cobre  +1 Piedra");
}
