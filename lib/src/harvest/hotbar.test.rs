//! Tests for the hotbar's pure rules: where the slots sit, what each says and the progress.

use super::*;
use iso::grid::WorldCoord;
use iso::harvest::{HarvestStatus, HarvestTarget};
use iso::inventory::ItemStack;
use iso::items::{HarvestYield, ItemCatalog};

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
        nearest: WorldCoord { x: 1, y: 0 },
        gap: 0.0,
        in_reach: true,
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
fn nothing_in_reach_shows_no_progress() {
    assert_eq!(prompt(&HarvestStatus::Idle), None);
}

#[test]
fn a_target_in_reach_shows_no_progress_bar() {
    assert_eq!(prompt(&HarvestStatus::Ready { target: tree() }), None);
}

#[test]
fn work_under_way_shows_its_share() {
    let prompt = prompt(&HarvestStatus::Working {
        target: tree(),
        progress: 100,
        total: 400,
    })
    .unwrap();
    assert_eq!(prompt.progress, 0.25);
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
