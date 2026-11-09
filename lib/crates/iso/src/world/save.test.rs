use super::*;

#[test]
fn parses_an_empty_current_version_save() {
    let value = serde_json::json!({
        "format": SAVE_FORMAT,
        "schemaVersion": SAVE_SCHEMA_VERSION,
        "chunks": [],
        "player": {},
        "systems": {}
    });

    let save = parse_world_save(value).expect("current empty save parses");

    assert_eq!(save.format, SAVE_FORMAT);
    assert_eq!(save.schema_version, SAVE_SCHEMA_VERSION);
    assert!(save.chunks.is_empty());
}
