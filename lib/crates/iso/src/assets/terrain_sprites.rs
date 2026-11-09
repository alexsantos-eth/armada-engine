//! Which rasterized asset draws each terrain material.

use crate::terrain::TerrainMaterial;

/// Source path of the block asset that draws `material`.
pub fn terrain_sprite_source(material: TerrainMaterial) -> &'static str {
    match material {
        TerrainMaterial::Water => "/assets/water/block.svg",
        TerrainMaterial::Sand => "/assets/sand/block.svg",
        TerrainMaterial::Ground => "/assets/ground/block.svg",
        TerrainMaterial::Grass => "/assets/grass/block.svg",
        TerrainMaterial::Path => "/assets/path/block.svg",
    }
}

/// Source path of the reflection asset drawn exactly as the water shows `material`, or `None`
/// for the water itself. The art hangs below the anchor one block tall, as the water sees it.
pub fn terrain_reflection_source(material: TerrainMaterial) -> Option<&'static str> {
    match material {
        TerrainMaterial::Water => None,
        TerrainMaterial::Sand => Some("/assets/sand/block_reflection.svg"),
        TerrainMaterial::Ground => Some("/assets/ground/block_reflection.svg"),
        TerrainMaterial::Grass => Some("/assets/grass/block_reflection.svg"),
        TerrainMaterial::Path => Some("/assets/path/block_reflection.svg"),
    }
}

#[cfg(test)]
mod tests {
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
        ] {
            let source = terrain_sprite_source(material);
            let entry = manifest
                .entries
                .iter()
                .find(|entry| entry.source == source)
                .unwrap_or_else(|| panic!("{material:?} has no asset at {source}"));
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
}
