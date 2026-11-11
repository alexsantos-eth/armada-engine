//! Which rasterized asset draws each terrain material.

use crate::terrain::TerrainMaterial;

/// Source path of the block asset that draws `material`.
pub fn terrain_sprite_source(material: TerrainMaterial) -> &'static str {
    match material {
        TerrainMaterial::Water => "/assets/water/block.svg",
        TerrainMaterial::Sand => "/assets/sand/block.svg",
        TerrainMaterial::Ground => "/assets/ground/block.svg",
        TerrainMaterial::Grass => "/assets/grass/block.svg",
        TerrainMaterial::Path => PATH_BLOCK_SOURCES[0],
    }
}

/// Source paths of the path block for every connection mask: bit `1` joins +x, `2` +y, `4` -x
/// and `8` -y, so the index is the mask itself. Mask `0` is the same artwork as the path block
/// `terrain_sprite_source` points at.
pub const PATH_BLOCK_SOURCES: [&str; 16] = [
    "/assets/path/block_0.svg",
    "/assets/path/block_1.svg",
    "/assets/path/block_2.svg",
    "/assets/path/block_3.svg",
    "/assets/path/block_4.svg",
    "/assets/path/block_5.svg",
    "/assets/path/block_6.svg",
    "/assets/path/block_7.svg",
    "/assets/path/block_8.svg",
    "/assets/path/block_9.svg",
    "/assets/path/block_10.svg",
    "/assets/path/block_11.svg",
    "/assets/path/block_12.svg",
    "/assets/path/block_13.svg",
    "/assets/path/block_14.svg",
    "/assets/path/block_15.svg",
];

/// Source path of the path block for `mask` (only the low four bits are meaningful).
pub fn path_sprite_source(mask: u8) -> &'static str {
    PATH_BLOCK_SOURCES[usize::from(mask & 0b1111)]
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
