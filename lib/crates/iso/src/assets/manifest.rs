//! Versioned asset manifest types and validation.

use super::ink::InkBox;

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

/// The grid of a sprite sheet packed into a texture of its own: one row per facing, one column
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SheetLayout {
    pub columns: u32,
    pub rows: u32,
    /// The facings, in the order their rows appear: counter-clockwise on screen from east.
    pub facings: Vec<String>,
    /// The names of the columns, where the artwork names them (a jump's phases); empty when the
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub poses: Vec<String>,
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
    /// Multiple frames (animations): one per cell of [`sheet`](Self::sheet), row by row.
    #[serde(default)]
    pub frames: Option<Vec<SpriteFrame>>,
    /// The texture this entry's frames are cut from, when it is not the shared atlas: a path
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub texture: Option<String>,
    /// The size of that texture, so that frames can be validated and sampled without opening
    #[serde(default, rename = "textureSize", skip_serializing_if = "Option::is_none")]
    pub texture_size: Option<SpriteFrame>,
    /// How this entry's frames are laid out, for a sprite sheet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sheet: Option<SheetLayout>,
    pub anchor: SpriteAnchor,
    /// Where the artwork in the frame belongs in the world: its bounding box in tile widths,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ink: Option<InkBox>,
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

    /// The frame of the pose in `column` of `facing`'s row, for a sheet entry.
    pub fn sheet_frame(&self, facing: usize, column: usize) -> Option<SpriteFrame> {
        let sheet = self.sheet.as_ref()?;
        let columns = sheet.columns as usize;
        if facing >= sheet.rows as usize || column >= columns {
            return None;
        }
        self.frames.as_ref()?.get(facing * columns + column).copied()
    }

    /// The size of the texture this entry's frames are cut from, which is the atlas unless the
    pub fn texture_size(&self, atlas: SpriteFrame) -> SpriteFrame {
        self.texture_size.unwrap_or(atlas)
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
pub const MANIFEST_SCHEMA_VERSION: u32 = 2;

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
        let texture = entry.texture_size(manifest.atlas_size);
        for frame in entry
            .frames
            .as_deref()
            .unwrap_or(std::slice::from_ref(&frame))
        {
            if frame.x + frame.width > texture.width || frame.y + frame.height > texture.height {
                return Err(ManifestError::InvalidFrame {
                    id: entry.id.clone(),
                    reason: "frame exceeds atlas bounds".to_owned(),
                });
            }
        }
        if let Some(sheet) = &entry.sheet {
            let cells = (sheet.columns * sheet.rows) as usize;
            let frames = entry.frames.as_ref().map_or(0, Vec::len);
            if cells == 0 || frames != cells {
                return Err(ManifestError::InvalidFrame {
                    id: entry.id.clone(),
                    reason: format!("a {}x{} sheet needs {cells} frames, not {frames}", sheet.columns, sheet.rows),
                });
            }
            if sheet.facings.len() != sheet.rows as usize {
                return Err(ManifestError::InvalidFrame {
                    id: entry.id.clone(),
                    reason: "one facing per row".to_owned(),
                });
            }
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
                    texture: None,
                    texture_size: None,
                    sheet: None,
                    ink: None,
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
                    texture: None,
                    texture_size: None,
                    sheet: None,
                    ink: Some(InkBox { x: -0.3085, y: -0.7127, width: 0.617, height: 0.7313 }),
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
                    texture: None,
                    texture_size: None,
                    sheet: None,
                    ink: None,
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
    fn deserializes_the_manifest_fixture() {
        let json = include_str!("../../../../content/assets.manifest.json");
        let manifest: AssetManifest = serde_json::from_str(json).expect("manifest deserializes");
        assert_eq!(manifest.schema_version, MANIFEST_SCHEMA_VERSION);
        validate_manifest(&manifest).expect("the manifest validates");
        assert_eq!(manifest.entries.len(), 64);
        for entry in &manifest.entries {
            assert!(entry.primary_frame().is_some(), "entry {} has no frame", entry.id);
        }
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

    /// Version 1 held every sprite in the one atlas and gave the player's sheets no grid, so a
    #[test]
    fn rejects_unsupported_schema() {
        let mut m = manifest();
        m.schema_version = 1;
        let err = validate_manifest(&m).unwrap_err();
        assert!(matches!(err, ManifestError::UnsupportedSchema { found: 1, expected: 2 }));
    }

    /// A sheet of poses with a texture of its own: the frames are checked against that texture,
    fn sheet_entry() -> AssetEntry {
        AssetEntry {
            id: "player_jump".to_owned(),
            kind: AssetKind::Player,
            source: "/assets/player/jump.svg".to_owned(),
            data_tiles: None,
            frame: None,
            frames: Some(vec![
                SpriteFrame { x: 0, y: 0, width: 200, height: 200 },
                SpriteFrame { x: 200, y: 0, width: 200, height: 200 },
                SpriteFrame { x: 0, y: 200, width: 200, height: 200 },
                SpriteFrame { x: 200, y: 200, width: 200, height: 200 },
            ]),
            texture: Some("content/player_jump.png".to_owned()),
            texture_size: Some(SpriteFrame { x: 0, y: 0, width: 400, height: 400 }),
            sheet: Some(SheetLayout {
                columns: 2,
                rows: 2,
                facings: vec!["east".to_owned(), "west".to_owned()],
                poses: vec!["takeoff".to_owned(), "landing".to_owned()],
            }),
            anchor: SpriteAnchor { x: 0.5, y: 1.0 },
            ink: None,
            color_variants: 1,
            sway: None,
        }
    }

    #[test]
    fn validates_a_sheet_against_its_own_texture() {
        let mut m = manifest();
        m.entries.push(sheet_entry());
        let last = m.entries.last().unwrap().frames.as_ref().unwrap()[3];
        assert!(last.x + last.width > m.atlas_size.width, "outside the atlas");
        validate_manifest(&m).expect("a sheet is measured against its texture");
    }

    #[test]
    fn rejects_a_frame_outside_its_sheet_texture() {
        let mut m = manifest();
        let mut entry = sheet_entry();
        entry.texture_size = Some(SpriteFrame { x: 0, y: 0, width: 300, height: 400 });
        m.entries.push(entry);
        assert!(matches!(
            validate_manifest(&m).unwrap_err(),
            ManifestError::InvalidFrame { .. }
        ));
    }

    #[test]
    fn rejects_a_grid_that_does_not_describe_its_frames() {
        let mut m = manifest();
        let mut entry = sheet_entry();
        entry.sheet.as_mut().unwrap().columns = 3;
        m.entries.push(entry);
        let err = validate_manifest(&m).unwrap_err();
        assert!(
            matches!(&err, ManifestError::InvalidFrame { reason, .. } if reason.contains("6 frames")),
            "{err}"
        );
    }

    #[test]
    fn rejects_a_grid_without_a_facing_for_every_row() {
        let mut m = manifest();
        let mut entry = sheet_entry();
        entry.sheet.as_mut().unwrap().facings.pop();
        m.entries.push(entry);
        let err = validate_manifest(&m).unwrap_err();
        assert!(
            matches!(&err, ManifestError::InvalidFrame { reason, .. } if reason.contains("facing")),
            "{err}"
        );
    }

    #[test]
    fn finds_the_frame_of_a_pose() {
        let entry = sheet_entry();
        assert_eq!(
            entry.sheet_frame(1, 0),
            Some(SpriteFrame { x: 0, y: 200, width: 200, height: 200 }),
            "the first pose of the second facing"
        );
        assert_eq!(entry.sheet_frame(2, 0), None, "past the last row");
        assert_eq!(entry.sheet_frame(0, 2), None, "past the last column");
        assert_eq!(manifest().entries[0].sheet_frame(0, 0), None, "not a sheet");
        assert_eq!(entry.frame_count(), 4);
    }

    #[test]
    fn falls_back_to_the_atlas_for_an_entry_without_a_texture() {
        let atlas = SpriteFrame { x: 0, y: 0, width: 256, height: 256 };
        assert_eq!(manifest().entries[0].texture_size(atlas), atlas);
        assert_eq!(
            sheet_entry().texture_size(atlas),
            SpriteFrame { x: 0, y: 0, width: 400, height: 400 }
        );
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
