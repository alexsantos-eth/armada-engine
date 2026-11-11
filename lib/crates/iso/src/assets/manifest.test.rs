use super::*;

fn manifest() -> AssetManifest {
    AssetManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        atlas: "content/atlas.png".to_owned(),
        atlas_size: SpriteFrame {
            x: 0,
            y: 0,
            width: 256,
            height: 256,
        },
        entries: vec![
            AssetEntry {
                id: "block".to_owned(),
                kind: AssetKind::Block,
                source: "/assets/house/block.svg".to_owned(),
                data_tiles: Some("1x1x1".to_owned()),
                frame: Some(SpriteFrame {
                    x: 0,
                    y: 0,
                    width: 64,
                    height: 64,
                }),
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
                frame: Some(SpriteFrame {
                    x: 64,
                    y: 0,
                    width: 64,
                    height: 64,
                }),
                frames: None,
                anchor: SpriteAnchor { x: 0.5, y: 1.0 },
                texture: None,
                texture_size: None,
                sheet: None,
                ink: Some(InkBox {
                    x: -0.3085,
                    y: -0.7127,
                    width: 0.617,
                    height: 0.7313,
                }),
                color_variants: 4,
                sway: Some(SwayParams {
                    cut: 0.58,
                    amplitude: 1.5,
                    period: 3400.0,
                }),
            },
            AssetEntry {
                id: "player".to_owned(),
                kind: AssetKind::Player,
                source: "/assets/player/block.svg".to_owned(),
                data_tiles: Some("1x1x1".to_owned()),
                frame: None,
                frames: Some(vec![SpriteFrame {
                    x: 128,
                    y: 0,
                    width: 64,
                    height: 64,
                }]),
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
    assert_eq!(manifest.entries.len(), 82);
    for entry in &manifest.entries {
        assert!(
            entry.primary_frame().is_some(),
            "entry {} has no frame",
            entry.id
        );
    }
    assert!(
        manifest
            .entries
            .iter()
            .any(|e| e.id.contains("player") || e.id.contains("car"))
    );
}

#[test]
fn primary_frame_returns_first() {
    let m = manifest();
    let player = m.entries.iter().find(|e| e.id == "player").unwrap();
    assert_eq!(
        player.primary_frame(),
        Some(SpriteFrame {
            x: 128,
            y: 0,
            width: 64,
            height: 64
        })
    );
    assert_eq!(player.frame_count(), 1);
}

#[test]
fn rejects_frame_outside_atlas() {
    let mut m = manifest();
    m.entries[0].frame = Some(SpriteFrame {
        x: 200,
        y: 200,
        width: 64,
        height: 64,
    });
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
    assert!(matches!(
        err,
        ManifestError::UnsupportedSchema {
            found: 1,
            expected: 2
        }
    ));
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
            SpriteFrame {
                x: 0,
                y: 0,
                width: 200,
                height: 200,
            },
            SpriteFrame {
                x: 200,
                y: 0,
                width: 200,
                height: 200,
            },
            SpriteFrame {
                x: 0,
                y: 200,
                width: 200,
                height: 200,
            },
            SpriteFrame {
                x: 200,
                y: 200,
                width: 200,
                height: 200,
            },
        ]),
        texture: Some("content/player_jump.png".to_owned()),
        texture_size: Some(SpriteFrame {
            x: 0,
            y: 0,
            width: 400,
            height: 400,
        }),
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
    assert!(
        last.x + last.width > m.atlas_size.width,
        "outside the atlas"
    );
    validate_manifest(&m).expect("a sheet is measured against its texture");
}

#[test]
fn rejects_a_frame_outside_its_sheet_texture() {
    let mut m = manifest();
    let mut entry = sheet_entry();
    entry.texture_size = Some(SpriteFrame {
        x: 0,
        y: 0,
        width: 300,
        height: 400,
    });
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
        Some(SpriteFrame {
            x: 0,
            y: 200,
            width: 200,
            height: 200
        }),
        "the first pose of the second facing"
    );
    assert_eq!(entry.sheet_frame(2, 0), None, "past the last row");
    assert_eq!(entry.sheet_frame(0, 2), None, "past the last column");
    assert_eq!(manifest().entries[0].sheet_frame(0, 0), None, "not a sheet");
    assert_eq!(entry.frame_count(), 4);
}

#[test]
fn falls_back_to_the_atlas_for_an_entry_without_a_texture() {
    let atlas = SpriteFrame {
        x: 0,
        y: 0,
        width: 256,
        height: 256,
    };
    assert_eq!(manifest().entries[0].texture_size(atlas), atlas);
    assert_eq!(
        sheet_entry().texture_size(atlas),
        SpriteFrame {
            x: 0,
            y: 0,
            width: 400,
            height: 400
        }
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
