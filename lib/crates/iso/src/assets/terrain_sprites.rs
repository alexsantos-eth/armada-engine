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
}
