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
    let original = ChunkArchive::new();
    let save = original.snapshot(serde_json::json!({ "health": 3 }), serde_json::json!({}));
    let restored = restore_archive(Some(save));

    assert_eq!(
        restored
            .snapshot(serde_json::json!({}), serde_json::json!({}))
            .chunks,
        Vec::<iso::world::SavedChunk>::new()
    );
}
