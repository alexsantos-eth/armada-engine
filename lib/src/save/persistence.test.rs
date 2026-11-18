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
