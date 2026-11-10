use super::*;
use crate::grid::WorldCoord;
use crate::terrain::TerrainColumn;

fn chunk(cx: i32, cy: i32) -> SavedChunk {
    SavedChunk {
        cx,
        cy,
        columns: vec![SavedColumn {
            x: cx * 32,
            y: cy * 32,
            walkable: true,
            blocks: vec![
                SavedBlock {
                    elevation: -1,
                    material: TerrainMaterial::Ground,
                },
                SavedBlock {
                    elevation: 0,
                    material: TerrainMaterial::Sand,
                },
            ],
        }],
        entities: vec![SavedEntity {
            instance_id: "tree-1".to_owned(),
            blueprint_id: "tree".to_owned(),
            x: cx * 32,
            y: cy * 32,
            elevation: 0,
            state: serde_json::json!({ "health": 5 }),
        }],
        changes: serde_json::json!({ "mined": ["stone-1"] }),
    }
}

fn world_save(chunks: Vec<SavedChunk>) -> WorldSave {
    WorldSave {
        format: SAVE_FORMAT.to_owned(),
        schema_version: SAVE_SCHEMA_VERSION,
        chunks,
        player: serde_json::json!({}),
        systems: serde_json::json!({}),
    }
}

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

#[test]
fn a_generated_chunk_is_stored_and_not_generated_again() {
    let mut archive = ChunkArchive::new();
    let mut calls = 0usize;
    archive
        .get_or_generate(-1, 2, |cx, cy| {
            calls += 1;
            chunk(cx, cy)
        })
        .unwrap();
    assert_eq!(
        archive.get(-1, 2).unwrap().columns[0].blocks[0].material,
        TerrainMaterial::Ground
    );
    let again = archive
        .get_or_generate(-1, 2, |cx, cy| {
            calls += 1;
            chunk(cx, cy)
        })
        .unwrap();
    assert_eq!(again.entities[0].instance_id, "tree-1");
    assert_eq!(calls, 1);
}

#[test]
fn snapshot_carries_the_player_and_the_systems() {
    let archive = ChunkArchive::new();
    let saved = archive.snapshot(
        serde_json::json!({ "x": 3, "y": 4, "inventory": ["axe"] }),
        serde_json::json!({ "clock": { "tick": 42 } }),
    );
    assert_eq!(
        saved.player,
        serde_json::json!({ "x": 3, "y": 4, "inventory": ["axe"] })
    );
    assert_eq!(
        saved.systems,
        serde_json::json!({ "clock": { "tick": 42 } })
    );
}

#[test]
fn a_save_round_trip_restores_the_archive() {
    let mut archive = ChunkArchive::new();
    archive.put(chunk(-1, 2));
    let saved = archive.snapshot(serde_json::json!({}), serde_json::json!({}));
    let value = serde_json::to_value(&saved).unwrap();
    let mut reopened = ChunkArchive::restore(&parse_world_save(value).unwrap());
    assert_eq!(reopened.get(-1, 2), Some(chunk(-1, 2)));
    assert_eq!(reopened.get(0, 0), None);
    assert_eq!(reopened.get_or_generate(0, 0, chunk).unwrap(), chunk(0, 0));
}

#[test]
fn rejects_a_generator_that_produces_different_coordinates() {
    let mut archive = ChunkArchive::new();
    let result = archive.get_or_generate(0, 0, |_, _| chunk(1, 0));
    assert!(matches!(result, Err(SaveError::InvalidStructure { .. })));
}

#[test]
fn snapshots_chunks_in_stable_order() {
    let mut archive = ChunkArchive::new();
    archive.put(chunk(2, 1));
    archive.put(chunk(3, 0));
    archive.put(chunk(-1, 0));
    let order: Vec<(i32, i32)> = archive
        .snapshot(serde_json::Value::Null, serde_json::Value::Null)
        .chunks
        .iter()
        .map(|c| (c.cx, c.cy))
        .collect();
    assert_eq!(order, vec![(-1, 0), (3, 0), (2, 1)]);
}

#[test]
fn rejects_an_invalid_save_header() {
    let cases: Vec<(serde_json::Value, &str)> = vec![
        (serde_json::json!(null), "object"),
        (serde_json::json!([]), "object"),
        (serde_json::json!({ "version": 7 }), "format"),
        (
            serde_json::json!({ "format": "iso-engine-2", "schemaVersion": 2 }),
            "version",
        ),
        (
            serde_json::json!({ "format": "iso-engine-2", "schemaVersion": 1, "chunks": {}, "player": {}, "systems": {} }),
            "structure",
        ),
        (
            serde_json::json!({ "format": "iso-engine-2", "schemaVersion": 1, "chunks": [], "player": [], "systems": {} }),
            "structure",
        ),
    ];
    for (value, message) in cases {
        let err = parse_world_save(value).unwrap_err();
        assert!(
            err.to_string().contains(message),
            "expected '{message}' in '{err}'"
        );
    }
}

#[test]
fn rejects_duplicate_chunks() {
    let value = serde_json::to_value(world_save(vec![chunk(-1, 2), chunk(-1, 2)])).unwrap();
    assert!(matches!(
        parse_world_save(value).unwrap_err(),
        SaveError::DuplicateChunk { cx: -1, cy: 2 }
    ));
}

#[test]
fn accepts_a_column_at_negative_coordinates_in_its_chunk() {
    let mut saved = chunk(-1, -1);
    saved.columns[0].x = -5;
    saved.columns[0].y = -5;
    let value = serde_json::to_value(world_save(vec![saved])).unwrap();
    parse_world_save(value).expect("div_euclid(-5, 32) == -1, so the column belongs to (-1, -1)");
}

#[test]
fn rejects_a_column_at_negative_coordinates_outside_its_chunk() {
    let mut saved = chunk(0, 2);
    saved.columns[0].x = -5;
    saved.columns[0].y = 64;
    let value = serde_json::to_value(world_save(vec![saved])).unwrap();
    assert!(matches!(
        parse_world_save(value).unwrap_err(),
        SaveError::InvalidColumn { .. }
    ));
}

#[test]
fn rejects_a_column_outside_its_chunk() {
    let mut bad = chunk(-1, 2);
    bad.columns[0].x = 0;
    let value = serde_json::to_value(world_save(vec![bad])).unwrap();
    assert!(matches!(
        parse_world_save(value).unwrap_err(),
        SaveError::InvalidColumn { .. }
    ));
}

#[test]
fn rejects_a_column_without_blocks() {
    let mut bad = chunk(-1, 2);
    bad.columns[0].blocks = vec![];
    let value = serde_json::to_value(world_save(vec![bad])).unwrap();
    assert!(matches!(
        parse_world_save(value).unwrap_err(),
        SaveError::InvalidColumn { .. }
    ));
}

#[test]
fn rejects_an_unknown_block_material() {
    let value = serde_json::json!({
        "format": SAVE_FORMAT,
        "schemaVersion": SAVE_SCHEMA_VERSION,
        "chunks": [{
            "cx": -1,
            "cy": 2,
            "columns": [{
                "x": -32,
                "y": 64,
                "walkable": true,
                "blocks": [{ "elevation": 0, "material": "lava" }]
            }],
            "entities": [],
            "changes": {}
        }],
        "player": {},
        "systems": {}
    });
    assert!(matches!(
        parse_world_save(value).unwrap_err(),
        SaveError::InvalidColumn { .. }
    ));
}

#[test]
fn rejects_an_empty_instance_id() {
    let mut bad = chunk(-1, 2);
    bad.entities[0].instance_id = String::new();
    let value = serde_json::to_value(world_save(vec![bad])).unwrap();
    assert!(matches!(
        parse_world_save(value).unwrap_err(),
        SaveError::InvalidEntity { .. }
    ));
}

#[test]
fn rejects_a_non_object_entity_state() {
    let mut bad = chunk(-1, 2);
    bad.entities[0].state = serde_json::json!([1, 2, 3]);
    let value = serde_json::to_value(world_save(vec![bad])).unwrap();
    assert!(matches!(
        parse_world_save(value).unwrap_err(),
        SaveError::InvalidEntity { .. }
    ));
}

/// A column is written as one block and comes back whole: the save stores what a column is
#[test]
fn a_column_survives_a_round_trip_through_one_saved_block() {
    for (elevation, surface, walkable) in [
        (0, TerrainMaterial::Grass, true),
        (4, TerrainMaterial::Path, true),
        (-2, TerrainMaterial::Water, false),
        (1, TerrainMaterial::Sand, true),
    ] {
        let column = TerrainColumn {
            coord: WorldCoord { x: 7, y: -3 },
            elevation,
            surface,
            walkable,
        };
        let saved = terrain_column_to_saved(&column);
        assert_eq!(saved.blocks.len(), 1, "only the surface block is written");
        assert_eq!(saved_to_terrain_column(&saved), column);
    }
}

/// Saves written before the format stopped storing the whole stack still load, and still
#[test]
fn a_save_carrying_the_whole_stack_still_loads() {
    let old = SavedColumn {
        x: 7,
        y: -3,
        walkable: true,
        blocks: vec![
            SavedBlock {
                elevation: -3,
                material: TerrainMaterial::Ground,
            },
            SavedBlock {
                elevation: -2,
                material: TerrainMaterial::Ground,
            },
            SavedBlock {
                elevation: -1,
                material: TerrainMaterial::Ground,
            },
            SavedBlock {
                elevation: 0,
                material: TerrainMaterial::Grass,
            },
        ],
    };
    assert_eq!(
        saved_to_terrain_column(&old),
        TerrainColumn {
            coord: WorldCoord { x: 7, y: -3 },
            elevation: 0,
            surface: TerrainMaterial::Grass,
            walkable: true,
        }
    );
}
