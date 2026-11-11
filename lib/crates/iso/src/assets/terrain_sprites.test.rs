use super::*;
use crate::assets::AssetManifest;

#[test]
fn every_material_has_artwork_in_the_shipped_atlas() {
    let json = include_str!("../../../../content/assets.manifest.json");
    let manifest: AssetManifest = serde_json::from_str(json).expect("manifest deserializes");
    for material in [
        TerrainMaterial::Water,
        TerrainMaterial::Sand,
        TerrainMaterial::Ground,
        TerrainMaterial::Grass,
        TerrainMaterial::Path,
        TerrainMaterial::Stairs,
    ] {
        let source = terrain_sprite_source(material);
        assert_asset_has_measured_artwork(&manifest, source);
    }
}

#[test]
fn every_path_connection_mask_has_artwork_in_the_shipped_atlas() {
    let json = include_str!("../../../../content/assets.manifest.json");
    let manifest: AssetManifest = serde_json::from_str(json).expect("manifest deserializes");
    for mask in 0..16u8 {
        assert_eq!(
            PATH_BLOCK_SOURCES[usize::from(mask)],
            path_sprite_source(mask)
        );
        assert_asset_has_measured_artwork(&manifest, path_sprite_source(mask));
    }
}

fn assert_asset_has_measured_artwork(manifest: &AssetManifest, source: &str) {
    let entry = manifest
        .entries
        .iter()
        .find(|entry| entry.source == source)
        .unwrap_or_else(|| panic!("{source} has no asset in the atlas"));
    assert!(
        entry.primary_frame().is_some(),
        "{source} has no frame in the atlas"
    );
    let ink = entry
        .ink
        .unwrap_or_else(|| panic!("{source} was never measured; re-run remeasure_atlas"));
    assert!(
        ink.width > 0.5,
        "{source} is narrower than half a tile: {ink:?}"
    );
    assert!(
        ink.y < 0.0 && ink.y + ink.height > 0.0,
        "{source} does not straddle the ground it stands on: {ink:?}"
    );
}

#[test]
fn every_land_material_has_reflection_artwork_in_the_shipped_atlas() {
    let json = include_str!("../../../../content/assets.manifest.json");
    let manifest: AssetManifest = serde_json::from_str(json).expect("manifest deserializes");
    for material in [
        TerrainMaterial::Sand,
        TerrainMaterial::Ground,
        TerrainMaterial::Grass,
        TerrainMaterial::Path,
    ] {
        let source =
            terrain_reflection_source(material).expect("a land material has reflection art");
        let entry = manifest
            .entries
            .iter()
            .find(|entry| entry.source == source)
            .unwrap_or_else(|| panic!("{material:?} has no reflection asset at {source}"));
        assert!(
            entry.primary_frame().is_some(),
            "{source} has no frame in the atlas"
        );
        let ink = entry
            .ink
            .unwrap_or_else(|| panic!("{source} was never measured; re-run remeasure_atlas"));
        assert!(
            (ink.y - 0.0).abs() < 1e-6
                && (ink.height - elevation_step_to_tile_width()).abs() < 1e-6,
            "{source} does not hang one elevation step below its anchor: {ink:?}"
        );
    }
}

fn elevation_step_to_tile_width() -> f64 {
    crate::assets::SVG_BLOCK_HEIGHT / crate::assets::SVG_TILE_WIDTH
}

#[test]
fn every_side_a_flight_climbs_toward_has_artwork_in_the_shipped_atlas() {
    let json = include_str!("../../../../content/assets.manifest.json");
    let manifest: AssetManifest = serde_json::from_str(json).expect("manifest deserializes");
    for (_, source) in STAIRS_BLOCK_SOURCES {
        assert_asset_has_measured_artwork(&manifest, source);
    }
}

#[test]
fn every_side_a_flight_climbs_toward_has_its_own_artwork() {
    let mut sources: Vec<_> = STAIRS_BLOCK_SOURCES.iter().map(|(_, src)| *src).collect();
    sources.sort_unstable();
    sources.dedup();
    assert_eq!(sources.len(), STAIRS_BLOCK_SOURCES.len());
    for (direction, source) in STAIRS_BLOCK_SOURCES {
        assert_eq!(stairs_sprite_source(direction), Some(source));
    }
}

#[test]
fn a_direction_that_is_not_a_side_has_no_stairs_artwork() {
    for direction in [
        WorldCoord { x: 0, y: 0 },
        WorldCoord { x: 1, y: 1 },
        WorldCoord { x: 2, y: 0 },
    ] {
        assert_eq!(stairs_sprite_source(direction), None);
    }
}

#[test]
fn a_buried_flight_falls_back_to_the_plain_road_block() {
    assert_eq!(
        terrain_sprite_source(TerrainMaterial::Stairs),
        PATH_BLOCK_SOURCES[0]
    );
}
