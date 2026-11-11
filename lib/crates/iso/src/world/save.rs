//! Saved world format (`iso-engine-2`): complete discovered chunks, player and systems.

use std::collections::{HashMap, HashSet};

use crate::grid::{CHUNK_SIZE, ChunkCoord, ChunkKey, chunk_key};
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

    if x.div_euclid(CHUNK_SIZE) != cx || y.div_euclid(CHUNK_SIZE) != cy {
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
        "stairs" => TerrainMaterial::Stairs,
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
#[path = "save.test.rs"]
mod tests;
