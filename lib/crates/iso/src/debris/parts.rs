//! The pieces an entity is assembled from, as the voxel pipeline wrote them
//! (`artifacts/vox/clay/vox_parts_pack.py` → `content/json/entity-parts.json`): where each one
//! stands and the sprite it is drawn with (`artifacts/vox/clay/vox_debris.py`).

use std::collections::HashMap;

use serde::Deserialize;

use crate::projection::GridPoint;

/// Voxels across one tile: the unit the pieces are measured in, along the ground.
pub const VOXELS_PER_TILE: f64 = 128.0;

/// Voxels in one block of height.
pub const VOXELS_PER_BLOCK: f64 = 85.0;

/// One piece of the kit placed in an entity.
#[derive(Clone, Debug, PartialEq)]
pub struct Part {
    /// The kit's name for it (`trunk`, `leaf_block`…), `box` for a loose box of the model.
    pub piece: String,
    /// Where it stands, in voxels from the anchor tile's foot: the middle of its footprint, on its
    /// lowest point.
    pub at: [f64; 3],
    /// The sprite it is drawn with, `debris/p_<hash>`: rendered with its own origin at the foot of
    /// the anchor tile, so it goes where the piece stands.
    pub sprite: String,
    /// Voxels along the model's x and y that a piece too wide for the 1x1x1 canvas was moved off
    /// the foot of its sprite when rendered; `[0, 0]` for the rest.
    pub shift: [f64; 2],
}

/// An entity as the pieces it is made of, in the order they were assembled.
#[derive(Clone, Debug, PartialEq)]
pub struct EntityParts {
    /// Tiles along x and y and blocks of height of the volume the entity fills.
    pub tiles: [u32; 3],
    pub parts: Vec<Part>,
}

/// Why the parts of the entities could not be read.
#[derive(Debug)]
pub enum PartsError {
    /// Not the JSON this module reads.
    Json(serde_json::Error),
    /// A file measured in other units than the engine's.
    Units,
}

impl std::fmt::Display for PartsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json(error) => write!(f, "entity parts: {error}"),
            Self::Units => write!(f, "entity parts: voxels per tile or block do not match"),
        }
    }
}

impl std::error::Error for PartsError {}

#[derive(Deserialize)]
struct RawPart {
    piece: String,
    at: [f64; 3],
    sprite: String,
    #[serde(default)]
    shift: [f64; 2],
}

#[derive(Deserialize)]
struct RawEntity {
    tiles: [u32; 3],
    parts: Vec<RawPart>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCatalog {
    voxels_per_tile: f64,
    voxels_per_block: f64,
    entities: HashMap<String, RawEntity>,
}

/// The parts of every entity that can be blown apart, found by their sprite.
#[derive(Clone, Debug, Default)]
pub struct PartsCatalog {
    entities: HashMap<String, EntityParts>,
}

/// The key a sprite is found by: its path without the `/assets/` in front or the extension behind
/// (`/assets/tree/block_2.png` → `tree/block_2`).
pub fn parts_key(sprite: &str) -> &str {
    let path = sprite.strip_prefix("/assets/").unwrap_or(sprite);
    path.rsplit_once('.').map_or(path, |(stem, _)| stem)
}

/// Reads `content/json/entity-parts.json`.
pub fn parse_parts(json: &str) -> Result<PartsCatalog, PartsError> {
    let raw: RawCatalog = serde_json::from_str(json).map_err(PartsError::Json)?;
    if raw.voxels_per_tile != VOXELS_PER_TILE || raw.voxels_per_block != VOXELS_PER_BLOCK {
        return Err(PartsError::Units);
    }
    let mut entities = HashMap::new();
    for (key, entity) in raw.entities {
        let parts = entity
            .parts
            .into_iter()
            .map(|part| Part {
                piece: part.piece,
                at: part.at,
                sprite: part.sprite,
                shift: part.shift,
            })
            .collect();
        entities.insert(
            key,
            EntityParts {
                tiles: entity.tiles,
                parts,
            },
        );
    }
    Ok(PartsCatalog { entities })
}

impl PartsCatalog {
    /// The parts of the entity drawn with `sprite` (`/assets/tree/block_2.png`), if it has any.
    pub fn of_sprite(&self, sprite: &str) -> Option<&EntityParts> {
        self.entities.get(parts_key(sprite))
    }

    /// How many entities the catalog knows.
    pub fn len(&self) -> usize {
        self.entities.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entities.is_empty()
    }
}

/// Where a point of the model, `(x, y)` voxels from the anchor tile's foot, lies on the ground,
/// in columns from the anchor's centre. The model's x runs down-right on screen and its y
/// down-left, the opposite way round to the grid's, so both flip and swap.
pub fn model_to_grid(x: f64, y: f64) -> GridPoint {
    GridPoint {
        x: -y / VOXELS_PER_TILE,
        y: -x / VOXELS_PER_TILE,
    }
}

#[cfg(test)]
#[path = "parts.test.rs"]
mod tests;
