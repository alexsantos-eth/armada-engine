//! Versioned asset manifest types and validation.

/// A frame rectangle inside the atlas, in pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SpriteFrame {
    #[serde(default)]
    pub x: u32,
    #[serde(default)]
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Anchor point of a sprite, as a fraction of its frame (0..1).
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SpriteAnchor {
    pub x: f64,
    pub y: f64,
}

/// Wind sway parameters for a sprite (trees).
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SwayParams {
    pub cut: f64,
    pub amplitude: f64,
    pub period: f64,
}

/// Kind of asset entry.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Block,
    Entity,
    Player,
    Terrain,
    Ui,
}

/// One entry in the asset manifest.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AssetEntry {
    pub id: String,
    pub kind: AssetKind,
    pub source: String,
    #[serde(default, rename = "dataTiles")]
    pub data_tiles: Option<String>,
    /// Single frame (blocks/entities with one frame).
    #[serde(default)]
    pub frame: Option<SpriteFrame>,
    /// Multiple frames (animations).
    #[serde(default)]
    pub frames: Option<Vec<SpriteFrame>>,
    pub anchor: SpriteAnchor,
    #[serde(default, rename = "colorVariants")]
    pub color_variants: u32,
    #[serde(default)]
    pub sway: Option<SwayParams>,
}

impl AssetEntry {
    /// Returns the first available frame (single or first of multiple).
    pub fn primary_frame(&self) -> Option<SpriteFrame> {
        self.frame.or_else(|| self.frames.as_ref().and_then(|f| f.first().copied()))
    }

    /// Number of animation frames.
    pub fn frame_count(&self) -> usize {
        self.frames.as_ref().map(|f| f.len()).unwrap_or(if self.frame.is_some() { 1 } else { 0 })
    }
}

/// Top-level asset manifest.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AssetManifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub atlas: String,
    #[serde(rename = "atlasSize")]
    pub atlas_size: SpriteFrame,
    pub entries: Vec<AssetEntry>,
}

/// Manifest schema version this crate understands.
pub const MANIFEST_SCHEMA_VERSION: u32 = 1;

/// Errors validating a manifest.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ManifestError {
    UnsupportedSchema { found: u32, expected: u32 },
    EmptyId,
    DuplicateId { id: String },
    MissingFrame { id: String },
    InvalidFrame { id: String, reason: String },
    EmptyAtlas,
}

impl std::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ManifestError::UnsupportedSchema { found, expected } => {
                write!(f, "unsupported manifest schema version {found}, expected {expected}")
            }
            ManifestError::EmptyId => write!(f, "asset id must not be empty"),
            ManifestError::DuplicateId { id } => write!(f, "duplicate asset id: {id}"),
            ManifestError::MissingFrame { id } => write!(f, "asset {id} has no frame"),
            ManifestError::InvalidFrame { id, reason } => {
                write!(f, "invalid frame for asset {id}: {reason}")
            }
            ManifestError::EmptyAtlas => write!(f, "atlas path must not be empty"),
        }
    }
}

impl std::error::Error for ManifestError {}

/// Validates a manifest: schema version, unique ids, frames inside the atlas.
pub fn validate_manifest(manifest: &AssetManifest) -> Result<(), ManifestError> {
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION {
        return Err(ManifestError::UnsupportedSchema {
            found: manifest.schema_version,
            expected: MANIFEST_SCHEMA_VERSION,
        });
    }
    if manifest.atlas.is_empty() {
        return Err(ManifestError::EmptyAtlas);
    }
    let mut seen = std::collections::HashSet::new();
    for entry in &manifest.entries {
        if entry.id.is_empty() {
            return Err(ManifestError::EmptyId);
        }
        if !seen.insert(entry.id.clone()) {
            return Err(ManifestError::DuplicateId { id: entry.id.clone() });
        }
        let frame = entry.primary_frame().ok_or_else(|| ManifestError::MissingFrame {
            id: entry.id.clone(),
        })?;
        if frame.width == 0 || frame.height == 0 {
            return Err(ManifestError::InvalidFrame {
                id: entry.id.clone(),
                reason: "frame must have positive width and height".to_owned(),
            });
        }
        if frame.x + frame.width > manifest.atlas_size.width
            || frame.y + frame.height > manifest.atlas_size.height
        {
            return Err(ManifestError::InvalidFrame {
                id: entry.id.clone(),
                reason: "frame exceeds atlas bounds".to_owned(),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest() -> AssetManifest {
        AssetManifest {
            schema_version: MANIFEST_SCHEMA_VERSION,
            atlas: "content/atlas.png".to_owned(),
            atlas_size: SpriteFrame { x: 0, y: 0, width: 256, height: 256 },
            entries: vec![
                AssetEntry {
                    id: "block".to_owned(),
                    kind: AssetKind::Block,
                    source: "/assets/house/block.svg".to_owned(),
                    data_tiles: Some("1x1x1".to_owned()),
                    frame: Some(SpriteFrame { x: 0, y: 0, width: 64, height: 64 }),
                    frames: None,
                    anchor: SpriteAnchor { x: 0.5, y: 1.0 },
                    color_variants: 1,
                    sway: None,
                },
                AssetEntry {
                    id: "tree".to_owned(),
                    kind: AssetKind::Entity,
                    source: "/assets/tree/block.svg".to_owned(),
                    data_tiles: Some("1x1x2".to_owned()),
                    frame: Some(SpriteFrame { x: 64, y: 0, width: 64, height: 64 }),
                    frames: None,
                    anchor: SpriteAnchor { x: 0.5, y: 1.0 },
                    color_variants: 4,
                    sway: Some(SwayParams { cut: 0.58, amplitude: 1.5, period: 3400.0 }),
                },
                AssetEntry {
                    id: "player".to_owned(),
                    kind: AssetKind::Player,
                    source: "/assets/player/block.svg".to_owned(),
                    data_tiles: Some("1x1x1".to_owned()),
                    frame: None,
                    frames: Some(vec![SpriteFrame { x: 128, y: 0, width: 64, height: 64 }]),
                    anchor: SpriteAnchor { x: 0.5, y: 1.0 },
                    color_variants: 1,
                    sway: None,
                },
            ],
        }
    }

    #[test]
    fn validates_manifest() {
        let m = manifest();
        assert!(validate_manifest(&m).is_ok());
    }

    #[test]
    fn deserializes_shared_manifest_fixture() {
        let json = include_str!("../../../../content/assets.manifest.json");
        let manifest: AssetManifest = serde_json::from_str(json).expect("manifest deserializes");
        assert_eq!(manifest.schema_version, MANIFEST_SCHEMA_VERSION);
        validate_manifest(&manifest).expect("shared manifest validates");
        assert_eq!(manifest.entries.len(), 63);
        for entry in &manifest.entries {
            assert!(entry.primary_frame().is_some(), "entry {} has no frame", entry.id);
        }
        // The manifest has no "player" entry (it has rasterized SVG names).
        assert!(manifest.entries.iter().any(|e| e.id.contains("player") || e.id.contains("car")));
    }

    #[test]
    fn primary_frame_returns_first() {
        let m = manifest();
        let player = m.entries.iter().find(|e| e.id == "player").unwrap();
        assert_eq!(player.primary_frame(), Some(SpriteFrame { x: 128, y: 0, width: 64, height: 64 }));
        assert_eq!(player.frame_count(), 1);
    }

    #[test]
    fn rejects_frame_outside_atlas() {
        let mut m = manifest();
        m.entries[0].frame = Some(SpriteFrame { x: 200, y: 200, width: 64, height: 64 });
        let err = validate_manifest(&m).unwrap_err();
        assert!(matches!(err, ManifestError::InvalidFrame { .. }));
    }

    #[test]
    fn rejects_duplicate_id() {
        let mut m = manifest();
        m.entries[1].id = "block".to_owned();
        let err = validate_manifest(&m).unwrap_err();
        assert!(matches!(err, ManifestError::DuplicateId { .. }));
    }

    #[test]
    fn rejects_unsupported_schema() {
        let mut m = manifest();
        m.schema_version = 2;
        let err = validate_manifest(&m).unwrap_err();
        assert!(matches!(err, ManifestError::UnsupportedSchema { found: 2, expected: 1 }));
    }

    #[test]
    fn rejects_missing_frame() {
        let mut m = manifest();
        m.entries[0].frame = None;
        m.entries[0].frames = None;
        let err = validate_manifest(&m).unwrap_err();
        assert!(matches!(err, ManifestError::MissingFrame { .. }));
    }
}
