//! Saved world format (`iso-engine-2`): complete discovered chunks, player and systems.

use std::collections::{HashMap, HashSet};

use crate::grid::{ChunkCoord, ChunkKey, chunk_key};
use crate::terrain::TerrainMaterial;

/// One saved terrain block.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SavedBlock {
    pub elevation: i32,
    pub material: TerrainMaterial,
}

/// One saved terrain column with all of its materialized blocks.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SavedColumn {
    pub x: i32,
    pub y: i32,
    pub walkable: bool,
    pub blocks: Vec<SavedBlock>,
}

/// One saved entity instance.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SavedEntity {
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    #[serde(rename = "blueprintId")]
    pub blueprint_id: String,
    pub x: i32,
    pub y: i32,
    pub elevation: i32,
    pub state: serde_json::Value,
}

/// One saved discovered chunk.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SavedChunk {
    pub cx: i32,
    pub cy: i32,
    pub columns: Vec<SavedColumn>,
    pub entities: Vec<SavedEntity>,
    pub changes: serde_json::Value,
}

/// A complete saved world.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct WorldSave {
    pub format: String,
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub chunks: Vec<SavedChunk>,
    pub player: serde_json::Value,
    pub systems: serde_json::Value,
}

/// Save format magic value.
pub const SAVE_FORMAT: &str = "iso-engine-2";
/// Current save schema version.
pub const SAVE_SCHEMA_VERSION: u32 = 1;

/// Error parsing or validating a save file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SaveError {
    NotAnObject,
    UnsupportedFormat { found: String, expected: String },
    UnsupportedVersion { found: u32, expected: u32 },
    InvalidStructure { detail: String },
    DuplicateChunk { cx: i32, cy: i32 },
    InvalidColumn { detail: String },
    InvalidEntity { detail: String },
}

impl std::fmt::Display for SaveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SaveError::NotAnObject => write!(f, "save must be an object"),
            SaveError::UnsupportedFormat { found, expected } => {
                write!(f, "unsupported save format {found}, expected {expected}")
            }
            SaveError::UnsupportedVersion { found, expected } => {
                write!(
                    f,
                    "unsupported save schema version {found}, expected {expected}"
                )
            }
            SaveError::InvalidStructure { detail } => write!(f, "invalid save structure: {detail}"),
            SaveError::DuplicateChunk { cx, cy } => {
                write!(f, "duplicate chunk ({cx}, {cy})")
            }
            SaveError::InvalidColumn { detail } => write!(f, "invalid terrain column: {detail}"),
            SaveError::InvalidEntity { detail } => write!(f, "invalid entity instance: {detail}"),
        }
    }
}

impl std::error::Error for SaveError {}

/// Converts a materialized terrain column into its saved form.
pub fn terrain_column_to_saved(column: &crate::terrain::TerrainColumn) -> SavedColumn {
    SavedColumn {
        x: column.coord.x,
        y: column.coord.y,
        walkable: column.walkable,
        blocks: vec![SavedBlock {
            elevation: column.elevation,
            material: column.surface,
        }],
    }
}

/// Reconstructs a terrain column from its saved form, using the top block as the surface.
pub fn saved_to_terrain_column(saved: &SavedColumn) -> crate::terrain::TerrainColumn {
    let top = saved.blocks.iter().max_by_key(|b| b.elevation).copied();
    let (elevation, surface) = match top {
        Some(block) => (block.elevation, block.material),
        None => (0, crate::terrain::TerrainMaterial::Grass),
    };
    crate::terrain::TerrainColumn {
        coord: crate::grid::WorldCoord {
            x: saved.x,
            y: saved.y,
        },
        elevation,
        surface,
        walkable: saved.walkable,
    }
}

/// Owns every discovered chunk, including chunks currently unloaded from the scene.
#[derive(Clone, Debug, Default)]
pub struct ChunkArchive {
    chunks: HashMap<ChunkKey, SavedChunk>,
}

impl ChunkArchive {
    pub fn new() -> Self {
        Self::default()
    }

    /// Stores a deep copy of `chunk`, keyed by its coordinates.
    pub fn put(&mut self, chunk: SavedChunk) {
        let key = chunk_key(ChunkCoord {
            cx: chunk.cx,
            cy: chunk.cy,
        })
        .expect("chunk coordinates are within grid range");
        self.chunks.insert(key, chunk);
    }

    /// Returns a copy of the chunk at `(cx, cy)`, or `None` when it was never discovered.
    pub fn get(&self, cx: i32, cy: i32) -> Option<SavedChunk> {
        let key = chunk_key(ChunkCoord { cx, cy }).ok()?;
        self.chunks.get(&key).cloned()
    }

    /// Returns the discovered chunk, or generates and stores it once when absent.
    pub fn get_or_generate<F>(
        &mut self,
        cx: i32,
        cy: i32,
        generate: F,
    ) -> Result<SavedChunk, SaveError>
    where
        F: FnOnce(i32, i32) -> SavedChunk,
    {
        if let Some(existing) = self.get(cx, cy) {
            return Ok(existing);
        }
        let created = generate(cx, cy);
        if created.cx != cx || created.cy != cy {
            return Err(SaveError::InvalidStructure {
                detail: "Generated chunk coordinates do not match request".to_owned(),
            });
        }
        self.put(created.clone());
        Ok(created)
    }

    /// Builds a save, sorting chunks for a stable JSON order.
    pub fn snapshot(&self, player: serde_json::Value, systems: serde_json::Value) -> WorldSave {
        let mut chunks: Vec<_> = self.chunks.values().cloned().collect();
        chunks.sort_by_key(|chunk| (chunk.cy, chunk.cx));
        WorldSave {
            format: SAVE_FORMAT.to_owned(),
            schema_version: SAVE_SCHEMA_VERSION,
            chunks,
            player,
            systems,
        }
    }

    /// Iterates over every discovered chunk in stable order.
    pub fn chunks(&self) -> impl Iterator<Item = &SavedChunk> {
        let mut chunks: Vec<_> = self.chunks.values().collect();
        chunks.sort_by_key(|c| (c.cy, c.cx));
        chunks.into_iter()
    }

    /// Restores an archive from a parsed save.
    pub fn restore(save: &WorldSave) -> Self {
        let mut archive = Self::new();
        for chunk in &save.chunks {
            archive.put(chunk.clone());
        }
        archive
    }
}

/// Checks the version and structure at the save-file boundary; V1 snapshots are rejected.
pub fn parse_world_save(value: serde_json::Value) -> Result<WorldSave, SaveError> {
    let obj = match &value {
        serde_json::Value::Object(_) => value,
        _ => return Err(SaveError::NotAnObject),
    };

    let format = obj.get("format").and_then(|v| v.as_str()).unwrap_or("");
    if format != SAVE_FORMAT {
        return Err(SaveError::UnsupportedFormat {
            found: format.to_owned(),
            expected: SAVE_FORMAT.to_owned(),
        });
    }

    let schema_version = obj
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    if schema_version != SAVE_SCHEMA_VERSION {
        return Err(SaveError::UnsupportedVersion {
            found: schema_version,
            expected: SAVE_SCHEMA_VERSION,
        });
    }

    let chunks = obj
        .get("chunks")
        .and_then(|v| v.as_array())
        .ok_or_else(|| SaveError::InvalidStructure {
            detail: "chunks must be an array".to_owned(),
        })?;
    let player = obj
        .get("player")
        .cloned()
        .unwrap_or(serde_json::Value::Object(Default::default()));
    if !player.is_object() {
        return Err(SaveError::InvalidStructure {
            detail: "player must be an object".to_owned(),
        });
    }
    let systems = obj
        .get("systems")
        .cloned()
        .unwrap_or(serde_json::Value::Object(Default::default()));
    if !systems.is_object() {
        return Err(SaveError::InvalidStructure {
            detail: "systems must be an object".to_owned(),
        });
    }

    let mut seen_chunks = HashSet::new();
    let mut parsed_chunks = Vec::with_capacity(chunks.len());
    for (index, chunk_value) in chunks.iter().enumerate() {
        let chunk = parse_chunk(chunk_value, index)?;
        let key = chunk_key(ChunkCoord {
            cx: chunk.cx,
            cy: chunk.cy,
        })
        .map_err(|_| SaveError::InvalidColumn {
            detail: format!("chunk ({}, {}) out of grid range", chunk.cx, chunk.cy),
        })?;
        if !seen_chunks.insert(key) {
            return Err(SaveError::DuplicateChunk {
                cx: chunk.cx,
                cy: chunk.cy,
            });
        }
        parsed_chunks.push(chunk);
    }

    Ok(WorldSave {
        format: SAVE_FORMAT.to_owned(),
        schema_version: SAVE_SCHEMA_VERSION,
        chunks: parsed_chunks,
        player,
        systems,
    })
}

fn parse_chunk(value: &serde_json::Value, index: usize) -> Result<SavedChunk, SaveError> {
    let obj = value
        .as_object()
        .ok_or_else(|| SaveError::InvalidStructure {
            detail: format!("chunk {index} must be an object"),
        })?;

    let cx = obj
        .get("cx")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| SaveError::InvalidStructure {
            detail: format!("chunk {index} cx must be an integer"),
        })? as i32;
    let cy = obj
        .get("cy")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| SaveError::InvalidStructure {
            detail: format!("chunk {index} cy must be an integer"),
        })? as i32;

    let columns = parse_columns(obj, "columns", cx, cy)?;
    let entities = parse_entities(obj, "entities", cx, cy)?;
    let changes = obj
        .get("changes")
        .cloned()
        .unwrap_or(serde_json::Value::Object(Default::default()));
    if !changes.is_object() {
        return Err(SaveError::InvalidStructure {
            detail: format!("chunk ({cx},{cy}) changes must be an object"),
        });
    }

    Ok(SavedChunk {
        cx,
        cy,
        columns,
        entities,
        changes,
    })
}

fn parse_columns(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    cx: i32,
    cy: i32,
) -> Result<Vec<SavedColumn>, SaveError> {
    let values =
        obj.get(key)
            .and_then(|v| v.as_array())
            .ok_or_else(|| SaveError::InvalidStructure {
                detail: format!("chunk ({cx},{cy}) {key} must be an array"),
            })?;
    let mut columns = Vec::with_capacity(values.len());
    for (index, column_value) in values.iter().enumerate() {
        let column = parse_column(column_value, cx, cy, index)?;
        columns.push(column);
    }
    Ok(columns)
}

fn parse_column(
    value: &serde_json::Value,
    cx: i32,
    cy: i32,
    index: usize,
) -> Result<SavedColumn, SaveError> {
    let obj = value.as_object().ok_or_else(|| SaveError::InvalidColumn {
        detail: format!("chunk ({cx},{cy}) column {index} must be an object"),
    })?;

    let x = obj
        .get("x")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| SaveError::InvalidColumn {
            detail: format!("chunk ({cx},{cy}) column {index} x must be an integer"),
        })? as i32;
    let y = obj
        .get("y")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| SaveError::InvalidColumn {
            detail: format!("chunk ({cx},{cy}) column {index} y must be an integer"),
        })? as i32;

    if x / 32 != cx || y / 32 != cy {
        return Err(SaveError::InvalidColumn {
            detail: format!(
                "chunk ({cx},{cy}) column {index} at ({x},{y}) does not belong to that chunk"
            ),
        });
    }

    let walkable = obj
        .get("walkable")
        .and_then(|v| v.as_bool())
        .ok_or_else(|| SaveError::InvalidColumn {
            detail: format!("chunk ({cx},{cy}) column {index} walkable must be a boolean"),
        })?;

    let blocks = parse_blocks(obj, "blocks", cx, cy, index)?;
    if blocks.is_empty() {
        return Err(SaveError::InvalidColumn {
            detail: format!("chunk ({cx},{cy}) column {index} blocks must not be empty"),
        });
    }

    Ok(SavedColumn {
        x,
        y,
        walkable,
        blocks,
    })
}

fn parse_blocks(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    cx: i32,
    cy: i32,
    column_index: usize,
) -> Result<Vec<SavedBlock>, SaveError> {
    let values =
        obj.get(key)
            .and_then(|v| v.as_array())
            .ok_or_else(|| SaveError::InvalidColumn {
                detail: format!("chunk ({cx},{cy}) column {column_index} {key} must be an array"),
            })?;
    let mut blocks = Vec::with_capacity(values.len());
    for (index, block_value) in values.iter().enumerate() {
        let block = parse_block(block_value, cx, cy, column_index, index)?;
        blocks.push(block);
    }
    Ok(blocks)
}

fn parse_block(
    value: &serde_json::Value,
    cx: i32,
    cy: i32,
    column_index: usize,
    block_index: usize,
) -> Result<SavedBlock, SaveError> {
    let obj = value.as_object().ok_or_else(|| SaveError::InvalidColumn {
        detail: format!(
            "chunk ({cx},{cy}) column {column_index} block {block_index} must be an object"
        ),
    })?;

    let elevation = obj
        .get("elevation")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| SaveError::InvalidColumn {
            detail: format!(
                "chunk ({cx},{cy}) column {column_index} block {block_index} elevation must be an integer"
            ),
        })? as i32;

    let material = obj
        .get("material")
        .and_then(|v| v.as_str())
        .ok_or_else(|| SaveError::InvalidColumn {
            detail: format!(
                "chunk ({cx},{cy}) column {column_index} block {block_index} material must be a string"
            ),
        })?;

    let material = match material {
        "grass" => TerrainMaterial::Grass,
        "ground" => TerrainMaterial::Ground,
        "sand" => TerrainMaterial::Sand,
        "water" => TerrainMaterial::Water,
        "path" => TerrainMaterial::Path,
        other => {
            return Err(SaveError::InvalidColumn {
                detail: format!(
                    "chunk ({cx},{cy}) column {column_index} block {block_index} unknown material '{other}'"
                ),
            });
        }
    };

    Ok(SavedBlock {
        elevation,
        material,
    })
}

fn parse_entities(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    cx: i32,
    cy: i32,
) -> Result<Vec<SavedEntity>, SaveError> {
    let values =
        obj.get(key)
            .and_then(|v| v.as_array())
            .ok_or_else(|| SaveError::InvalidStructure {
                detail: format!("chunk ({cx},{cy}) {key} must be an array"),
            })?;
    let mut entities = Vec::with_capacity(values.len());
    for (index, entity_value) in values.iter().enumerate() {
        let entity = parse_entity(entity_value, cx, cy, index)?;
        entities.push(entity);
    }
    Ok(entities)
}

fn parse_entity(
    value: &serde_json::Value,
    cx: i32,
    cy: i32,
    index: usize,
) -> Result<SavedEntity, SaveError> {
    let obj = value.as_object().ok_or_else(|| SaveError::InvalidEntity {
        detail: format!("chunk ({cx},{cy}) entity {index} must be an object"),
    })?;

    let instance_id = obj
        .get("instanceId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| SaveError::InvalidEntity {
            detail: format!(
                "chunk ({cx},{cy}) entity {index} instanceId must be a non-empty string"
            ),
        })?;
    if instance_id.is_empty() {
        return Err(SaveError::InvalidEntity {
            detail: format!(
                "chunk ({cx},{cy}) entity {index} instanceId must be a non-empty string"
            ),
        });
    }

    let blueprint_id = obj
        .get("blueprintId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| SaveError::InvalidEntity {
            detail: format!(
                "chunk ({cx},{cy}) entity {index} blueprintId must be a non-empty string"
            ),
        })?;
    if blueprint_id.is_empty() {
        return Err(SaveError::InvalidEntity {
            detail: format!(
                "chunk ({cx},{cy}) entity {index} blueprintId must be a non-empty string"
            ),
        });
    }

    let x = obj
        .get("x")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| SaveError::InvalidEntity {
            detail: format!("chunk ({cx},{cy}) entity {index} x must be finite"),
        })?;
    let y = obj
        .get("y")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| SaveError::InvalidEntity {
            detail: format!("chunk ({cx},{cy}) entity {index} y must be finite"),
        })?;
    let elevation = obj
        .get("elevation")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| SaveError::InvalidEntity {
            detail: format!("chunk ({cx},{cy}) entity {index} elevation must be finite"),
        })?;

    if !x.is_finite() || !y.is_finite() || !elevation.is_finite() {
        return Err(SaveError::InvalidEntity {
            detail: format!("chunk ({cx},{cy}) entity {index} coordinates must be finite"),
        });
    }

    let state = obj
        .get("state")
        .cloned()
        .unwrap_or(serde_json::Value::Object(Default::default()));
    if !state.is_object() {
        return Err(SaveError::InvalidEntity {
            detail: format!("chunk ({cx},{cy}) entity {index} state must be an object"),
        });
    }

    Ok(SavedEntity {
        instance_id: instance_id.to_owned(),
        blueprint_id: blueprint_id.to_owned(),
        x: x as i32,
        y: y as i32,
        elevation: elevation as i32,
        state,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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

    fn save_value(world: WorldSave) -> serde_json::Value {
        serde_json::to_value(&world).unwrap()
    }

    #[test]
    fn keeps_complete_discovered_chunks_after_unloading_and_reopening_without_seed() {
        let mut archive = ChunkArchive::new();
        let mut calls = 0usize;
        let first = archive
            .get_or_generate(-1, 2, |cx, cy| {
                calls += 1;
                chunk(cx, cy)
            })
            .unwrap();
        let first_block = first.columns[0].blocks[0].material;
        let _ = first_block;
        assert_eq!(
            archive.get(-1, 2).unwrap().columns[0].blocks[0].material,
            TerrainMaterial::Ground
        );
        let again = archive.get_or_generate(-1, 2, |_, _| chunk(0, 0)).unwrap();
        assert_eq!(again.entities[0].instance_id, "tree-1");
        assert_eq!(calls, 1);

        let saved = archive.snapshot(
            serde_json::json!({ "x": 3, "y": 4, "inventory": ["axe"] }),
            serde_json::json!({ "clock": { "tick": 42 } }),
        );
        let mut reopened =
            ChunkArchive::restore(&parse_world_save(save_value(saved.clone())).unwrap());
        assert_eq!(reopened.get(-1, 2), Some(chunk(-1, 2)));
        assert_eq!(reopened.get(0, 0), None);
        assert_eq!(reopened.get_or_generate(0, 0, chunk).unwrap(), chunk(0, 0));
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
    fn rejects_generator_with_different_chunk_and_snapshots_in_stable_order() {
        let mut archive = ChunkArchive::new();
        let result = archive.get_or_generate(0, 0, |_, _| chunk(1, 0));
        assert!(matches!(result, Err(SaveError::InvalidStructure { .. })));

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
    fn rejects_invalid_save_header() {
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
    fn rejects_duplicate_chunks_and_malformed_terrain_or_entities() {
        let mut archive = ChunkArchive::new();
        archive.put(chunk(-1, 2));
        let mut save = archive.snapshot(serde_json::json!({}), serde_json::json!({}));
        save.chunks.push(save.chunks[0].clone());
        let value = serde_json::to_value(&save).unwrap();
        assert!(matches!(
            parse_world_save(value).unwrap_err(),
            SaveError::DuplicateChunk { cx: -1, cy: 2 }
        ));

        let mut bad = chunk(-1, 2);
        bad.columns[0].x = 0;
        let value = serde_json::to_value(&WorldSave {
            format: SAVE_FORMAT.to_owned(),
            schema_version: SAVE_SCHEMA_VERSION,
            chunks: vec![bad],
            player: serde_json::json!({}),
            systems: serde_json::json!({}),
        })
        .unwrap();
        assert!(matches!(
            parse_world_save(value).unwrap_err(),
            SaveError::InvalidColumn { .. }
        ));

        let mut bad = chunk(-1, 2);
        bad.columns[0].blocks = vec![];
        let value = serde_json::to_value(&WorldSave {
            format: SAVE_FORMAT.to_owned(),
            schema_version: SAVE_SCHEMA_VERSION,
            chunks: vec![bad],
            player: serde_json::json!({}),
            systems: serde_json::json!({}),
        })
        .unwrap();
        assert!(matches!(
            parse_world_save(value).unwrap_err(),
            SaveError::InvalidColumn { .. }
        ));

        let mut saved = serde_json::to_value(&WorldSave {
            format: SAVE_FORMAT.to_owned(),
            schema_version: SAVE_SCHEMA_VERSION,
            chunks: vec![chunk(-1, 2)],
            player: serde_json::json!({}),
            systems: serde_json::json!({}),
        })
        .unwrap();
        let obj = saved.as_object_mut().unwrap();
        let chunk_obj = obj.get_mut("chunks").unwrap().as_array_mut().unwrap()[0]
            .as_object_mut()
            .unwrap();
        let blocks = chunk_obj
            .get_mut("columns")
            .unwrap()
            .as_array_mut()
            .unwrap()[0]
            .get_mut("blocks")
            .unwrap()
            .as_array_mut()
            .unwrap();
        blocks[0]
            .as_object_mut()
            .unwrap()
            .insert("material".to_owned(), serde_json::json!("lava"));
        let value = serde_json::Value::Object(obj.clone());
        assert!(matches!(
            parse_world_save(value).unwrap_err(),
            SaveError::InvalidColumn { .. }
        ));

        let mut bad = chunk(-1, 2);
        bad.entities[0].instance_id = String::new();
        let value = serde_json::to_value(&WorldSave {
            format: SAVE_FORMAT.to_owned(),
            schema_version: SAVE_SCHEMA_VERSION,
            chunks: vec![bad],
            player: serde_json::json!({}),
            systems: serde_json::json!({}),
        })
        .unwrap();
        assert!(matches!(
            parse_world_save(value).unwrap_err(),
            SaveError::InvalidEntity { .. }
        ));

        let mut bad = chunk(-1, 2);
        bad.entities[0].state = serde_json::json!([1, 2, 3]);
        let value = serde_json::to_value(&WorldSave {
            format: SAVE_FORMAT.to_owned(),
            schema_version: SAVE_SCHEMA_VERSION,
            chunks: vec![bad],
            player: serde_json::json!({}),
            systems: serde_json::json!({}),
        })
        .unwrap();
        assert!(matches!(
            parse_world_save(value).unwrap_err(),
            SaveError::InvalidEntity { .. }
        ));
    }
    /// A column is written as one block and comes back whole: the save stores what a column is
    #[test]
    fn a_column_survives_a_round_trip_through_one_saved_block() {
        use crate::grid::WorldCoord;
        use crate::terrain::TerrainColumn;
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
        use crate::grid::WorldCoord;
        use crate::terrain::TerrainColumn;
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
}

#[cfg(test)]
#[path = "save.test.rs"]
mod file_tests;
