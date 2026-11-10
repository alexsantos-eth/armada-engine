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
#[path = "terrain_sprites.test.rs"]
mod tests;
