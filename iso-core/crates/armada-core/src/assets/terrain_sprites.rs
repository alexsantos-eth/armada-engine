//! Which rasterized asset draws each terrain material.
//!
//! The source path is the join between the terrain generator, which knows materials, and the
//! asset manifest, which knows frames. Keeping the mapping here means a renamed or dropped
//! asset fails this module's test instead of quietly leaving holes in the ground.

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
        }
    }
}
