use super::*;

#[test]
fn absent_save_starts_with_an_empty_archive() {
    let archive = restore_archive(None);
    let snapshot = archive.snapshot(serde_json::json!({}), serde_json::json!({}));

    assert!(snapshot.chunks.is_empty());
    assert_eq!(snapshot.format, iso::world::SAVE_FORMAT);
    assert_eq!(snapshot.schema_version, iso::world::SAVE_SCHEMA_VERSION);
}

#[test]
fn restore_preserves_the_archive_snapshot() {
    let mut original = ChunkArchive::new();
    original.put(iso::world::SavedChunk {
        cx: 3,
        cy: -2,
        columns: vec![iso::world::SavedColumn {
            x: 1,
            y: 2,
            walkable: true,
            blocks: vec![],
        }],
        entities: vec![],
        changes: serde_json::json!({}),
    });
    let save = original.snapshot(serde_json::json!({ "health": 3 }), serde_json::json!({}));
    let restored = restore_archive(Some(save));

    assert_eq!(
        restored.get(3, -2).map(|chunk| chunk.columns.len()),
        Some(1),
        "the chunk survives the round trip"
    );
}

#[test]
fn a_saved_archive_records_the_world_seed() {
    let archive = ChunkArchive::new();
    let save = snapshot_of(&archive, 77, None);
    assert_eq!(iso::world::saved_seed(&save.systems), Some(77));
    assert!(save.systems.get(iso::inventory::INVENTORY_PART).is_none());
}

#[test]
fn a_saved_archive_records_what_the_player_carries() {
    let entities: iso::entities::EntityCatalog =
        serde_json::from_str(include_str!("../../content/json/entities.json")).unwrap();
    let items =
        iso::items::parse_items(include_str!("../../content/json/items.json"), &entities).unwrap();
    let mut carried = iso::inventory::Carried::starting(4, &items);
    carried.inventory.add("wood", 3, &items);
    let save = snapshot_of(&ChunkArchive::new(), 77, Some(&carried));
    let restored = iso::inventory::saved_carried(&save.systems, 4, &items).unwrap();
    assert_eq!(restored.carried, carried);
    assert_eq!(iso::world::saved_seed(&save.systems), Some(77));
}

#[test]
fn a_fresh_seed_note_reads_as_a_number_and_an_empty_note_as_none() {
    assert_eq!(parse_fresh_seed("12345"), Some(12345));
    assert_eq!(parse_fresh_seed(" 18446744073709551615 \n"), Some(u64::MAX));
    assert_eq!(parse_fresh_seed(""), None);
    assert_eq!(parse_fresh_seed("soon"), None);
}

#[test]
fn a_native_run_asks_for_a_fresh_world_with_its_flag() {
    let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    assert!(asks_for_fresh(args(&["iso-core", "--fresh"]).iter()));
    assert!(asks_for_fresh(
        args(&["iso-core", "--plain", "--fresh"]).iter()
    ));
    assert!(!asks_for_fresh(args(&["iso-core", "--plain"]).iter()));
}

#[test]
fn the_seed_a_world_boots_with_prefers_a_scene_then_a_fresh_draw_then_the_save() {
    assert_eq!(boot_seed(Some(5), Some(6), Some(7), 9), 5);
    assert_eq!(boot_seed(None, Some(6), Some(7), 9), 6);
    assert_eq!(boot_seed(None, None, Some(7), 9), 7);
    assert_eq!(boot_seed(None, None, None, 9), 9);
}
