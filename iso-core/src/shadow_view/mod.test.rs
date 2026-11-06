use super::*;
use armada_core::assets::InkBox;

#[test]
fn an_inks_extent_is_the_rectangle_the_sprite_is_drawn_into() {
    let ink = InkBox { x: -0.2, y: -0.5, width: 0.4, height: 0.6 };
    let extent = extent_of_ink(ink, 200.0);

    // The same numbers `ink_layout` draws with, measured from the ground point instead of from
    // the screen's origin: that is what a caster is.
    assert_eq!(extent.left, -40.0);
    assert_eq!(extent.top, -100.0);
    assert_eq!(extent.width, 80.0);
    assert_eq!(extent.height, 120.0);
}

#[test]
fn a_receiver_keeps_its_artwork_relative_to_its_feet() {
    let feet = ScreenPoint { x: 500.0, y: 300.0 };
    let layout = SpriteLayout { x: 460.0, y: 200.0, width: 80.0, height: 120.0 };
    let receiver = receiver_of(layout, feet, (4.5, 7.5), 2.0);

    assert_eq!(receiver.foot, (4.5, 7.5));
    assert_eq!(receiver.elevation, 2.0);
    assert_eq!(receiver.extent.left, -40.0);
    assert_eq!(receiver.extent.top, -100.0);
}

#[test]
fn the_nine_chunks_around_one_include_it_once() {
    let all = around(ChunkCoord { cx: 3, cy: -2 });

    assert_eq!(all.len(), 9);
    assert_eq!(all.iter().filter(|c| **c == ChunkCoord { cx: 3, cy: -2 }).count(), 1);
    assert!(all.contains(&ChunkCoord { cx: 2, cy: -3 }));
    assert!(all.contains(&ChunkCoord { cx: 4, cy: -1 }));
}

/// The lattice stands in for the map's own texels, so its corners have to land on them: a
/// resolution that does not divide the map reads between two texels everywhere and softens the
/// whole shadow instead of only where it is soft.
#[test]
fn the_ground_lattice_divides_the_map() {
    const { assert!(GROUND_SHADE_STEPS > 0) };
    assert_eq!(
        SHADOW_MAP_PIXELS_PER_TILE % GROUND_SHADE_STEPS,
        0,
        "{GROUND_SHADE_STEPS} corners do not divide {SHADOW_MAP_PIXELS_PER_TILE} texels a tile"
    );
}

/// Every shadow is drawn out of the shared atlas, so that binding it changes nothing and the
/// ground and its shadows stay one batch. Without the patch each shadow would bind a texture of
/// its own, which is a draw call per shadow and what this whole arrangement exists to avoid.
#[test]
fn the_atlas_carries_the_white_patch_the_shadows_are_drawn_from() {
    use armada_core::assets::AssetManifest;

    let manifest: AssetManifest =
        serde_json::from_str(include_str!("../../content/assets.manifest.json"))
            .expect("the asset manifest is valid JSON");
    let patch = manifest
        .entries
        .iter()
        .find(|entry| entry.source == crate::sprites::WHITE_PATCH)
        .unwrap_or_else(|| panic!("the atlas has no {}", crate::sprites::WHITE_PATCH));

    assert!(patch.primary_frame().is_some(), "the white patch was packed with no frame");
    assert!(patch.texture.is_none(), "the white patch belongs in the shared atlas, not a sheet");
}

#[test]
fn the_ground_shadow_lies_over_the_terrain_and_under_what_stands_on_it() {
    use crate::terrain_view::blocks::TERRAIN_LAYER;

    const { assert!(GROUND_SHADOW_LAYER > TERRAIN_LAYER) };
    const { assert!(GROUND_SHADOW_LAYER < crate::ENTITY_LAYER) };
    const { assert!(GROUND_SHADOW_LAYER < crate::PLAYER_BEHIND_LAYER) };
}

#[test]
fn a_clear_grid_asks_for_no_lattice() {
    use armada_core::lighting::{SHADE_COLUMNS, SHADE_ROWS, ShadowCaster, SpriteExtent, shade_grid};

    // A caster that covers the receiver, but is transparent everywhere.
    let receiver = ShadowReceiver {
        foot: (1.0, 1.0),
        elevation: 0.0,
        extent: SpriteExtent { left: -50.0, top: -100.0, width: 100.0, height: 100.0 },
    };
    let caster = ShadowCaster {
        foot: (0.0, 0.0),
        elevation: 0.0,
        extent: SpriteExtent { left: -50.0, top: -100.0, width: 100.0, height: 100.0 },
        silhouette: 0,
    };
    let light = armada_core::lighting::DAWN;
    let solid = shade_grid(
        &receiver,
        &[caster],
        &light.shadow,
        light.opacity(),
        280.0,
        93.0,
        &|_, _, _| 1.0,
        None,
        SHADE_COLUMNS,
        SHADE_ROWS,
    );

    // Dawn's light runs along −x, so a caster at the origin shades nothing at (1, 1).
    assert!(solid.is_none());
}

/// A shadow is laid on the cell itself, which only works while every terrain block is drawn at
/// least a whole cell wide. When the blocks were clay with rounded corners this was false by a
/// few percent, and the grooves between them showed through a shadow as a lattice of light
/// lines; the quad had to be slid onto the drawn face to hide them, and the slide then left
/// thin unshaded lines of its own. The generator (`artifacts/terrain_blocks.py`) is what makes
/// it true, and this is the manifest saying so.
#[test]
fn every_terrain_block_is_drawn_at_least_a_whole_cell_wide() {
    use armada_core::assets::{AssetManifest, terrain_sprite_source};
    use armada_core::terrain::TerrainMaterial;

    let manifest: AssetManifest =
        serde_json::from_str(include_str!("../../content/assets.manifest.json"))
            .expect("the asset manifest is valid JSON");

    for material in [
        TerrainMaterial::Water,
        TerrainMaterial::Sand,
        TerrainMaterial::Ground,
        TerrainMaterial::Grass,
        TerrainMaterial::Path,
    ] {
        let source = terrain_sprite_source(material);
        let entry = manifest
            .entries
            .iter()
            .find(|entry| entry.source == source)
            .unwrap_or_else(|| panic!("the atlas has no {source}"));
        let ink = entry.ink.unwrap_or_else(|| panic!("{source} was never measured"));
        assert!(
            ink.width >= 1.0,
            "{source} is drawn {} of a cell wide, so a field of it has gaps",
            ink.width
        );
    }
}
