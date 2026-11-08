use super::*;
use iso::assets::{AssetKind, SpriteAnchor};

/// An image with one opaque square in the middle of a transparent field, four mask texels
/// across, so a mask texel is one block of the source.
fn chequered() -> Image {
    let (width, height) = (8u16, 8u16);
    let mut bytes = vec![0u8; usize::from(width) * usize::from(height) * 4];
    for y in 0..u32::from(height) {
        for x in 0..u32::from(width) {
            // Opaque over the left half only.
            let alpha = if x < 4 { 255 } else { 0 };
            bytes[((y * u32::from(width) + x) * 4 + 3) as usize] = alpha;
        }
    }
    Image {
        bytes,
        width,
        height,
    }
}

fn manifest(frames: &[(&str, SpriteFrame)]) -> AssetManifest {
    AssetManifest {
        schema_version: 2,
        atlas: "content/atlas.png".into(),
        atlas_size: SpriteFrame {
            x: 0,
            y: 0,
            width: 8,
            height: 8,
        },
        entries: frames
            .iter()
            .map(|(source, frame)| AssetEntryBuilder::entity(source, *frame))
            .collect(),
    }
}

struct AssetEntryBuilder;

impl AssetEntryBuilder {
    fn entity(source: &str, frame: SpriteFrame) -> iso::assets::AssetEntry {
        iso::assets::AssetEntry {
            id: source.to_owned(),
            kind: AssetKind::Entity,
            source: source.to_owned(),
            data_tiles: None,
            frame: Some(frame),
            frames: None,
            texture: None,
            texture_size: None,
            sheet: None,
            anchor: SpriteAnchor { x: 0.5, y: 1.0 },
            ink: Some(InkBox {
                x: -0.1,
                y: -0.2,
                width: 0.2,
                height: 0.3,
            }),
            color_variants: 0,
            sway: None,
        }
    }
}

#[test]
fn the_mask_is_the_atlas_reduced_and_keeps_solid_areas_solid() {
    let masks = SilhouetteMasks::from_image(
        &chequered(),
        &manifest(&[(
            "/assets/tree/block.svg",
            SpriteFrame {
                x: 0,
                y: 0,
                width: 8,
                height: 8,
            },
        )]),
    );
    let index = masks
        .index_of("/assets/tree/block.svg")
        .expect("the atlas holds it");

    // The left half of the artwork is solid, the right half empty: averaging a block of opaque
    // texels must come back fully opaque rather than a sixteenth short.
    assert!(
        (masks
            .silhouette_of(index)
            .map_or(0.0, |mask| mask.at(0.1, 0.5))
            - 1.0)
            .abs()
            < 1e-9
    );
    assert_eq!(
        masks
            .silhouette_of(index)
            .map_or(0.0, |mask| mask.at(0.9, 0.5)),
        0.0
    );
}

#[test]
fn sampling_outside_the_artwork_reads_nothing() {
    let masks = SilhouetteMasks::from_image(
        &chequered(),
        &manifest(&[(
            "/assets/tree/block.svg",
            SpriteFrame {
                x: 0,
                y: 0,
                width: 8,
                height: 8,
            },
        )]),
    );
    let index = masks.index_of("/assets/tree/block.svg").unwrap();

    assert_eq!(
        masks
            .silhouette_of(index)
            .map_or(0.0, |mask| mask.at(-0.1, 0.5)),
        0.0
    );
    assert_eq!(
        masks
            .silhouette_of(index)
            .map_or(0.0, |mask| mask.at(0.5, 1.4)),
        0.0
    );
}

#[test]
fn an_unknown_silhouette_reads_nothing_instead_of_panicking() {
    let masks = SilhouetteMasks::from_image(&chequered(), &manifest(&[]));

    assert_eq!(masks.index_of("/assets/tree/block.svg"), None);
    assert_eq!(
        masks.silhouette_of(7).map_or(0.0, |mask| mask.at(0.5, 0.5)),
        0.0
    );
}

#[test]
fn a_sprite_sheet_is_not_a_silhouette() {
    // The player's sheets have textures of their own, and the player never casts here.
    let mut manifest = manifest(&[(
        "/assets/player-16/walk.svg",
        SpriteFrame {
            x: 0,
            y: 0,
            width: 8,
            height: 8,
        },
    )]);
    manifest.entries[0].texture = Some("content/player-16_walk.png".into());
    let masks = SilhouetteMasks::from_image(&chequered(), &manifest);

    assert_eq!(masks.index_of("/assets/player-16/walk.svg"), None);
}

#[test]
fn the_ink_of_a_silhouette_comes_straight_from_the_manifest() {
    let masks = SilhouetteMasks::from_image(
        &chequered(),
        &manifest(&[(
            "/assets/rock/block.svg",
            SpriteFrame {
                x: 0,
                y: 0,
                width: 8,
                height: 8,
            },
        )]),
    );

    assert_eq!(
        masks.ink_of("/assets/rock/block.svg"),
        Some(InkBox {
            x: -0.1,
            y: -0.2,
            width: 0.2,
            height: 0.3
        })
    );
    assert_eq!(masks.ink_of("/assets/nothing.svg"), None);
}
