//! Which rasterized asset draws each terrain material.

use crate::grid::WorldCoord;
use crate::terrain::TerrainMaterial;

/// Source path of the block asset that draws `material`. A flight of stairs answers with the
/// plain road block: only the top of its column reads as steps, and `stairs_sprite_source`
/// gives that artwork once the direction is known.
pub fn terrain_sprite_source(material: TerrainMaterial) -> &'static str {
    match material {
        TerrainMaterial::Water => "/assets/water/block.png",
        TerrainMaterial::Sand => "/assets/sand/block.png",
        TerrainMaterial::Ground => "/assets/ground/block.png",
        TerrainMaterial::Grass => "/assets/grass/block.png",
        TerrainMaterial::Path | TerrainMaterial::Stairs => PATH_BLOCK_SOURCES[0],
    }
}

/// Source paths of the path block for every connection mask: bit `1` joins +x, `2` +y, `4` -x
/// and `8` -y, so the index is the mask itself. Mask `0` is the same artwork as the path block
/// `terrain_sprite_source` points at.
pub const PATH_BLOCK_SOURCES: [&str; 16] = [
    "/assets/path/block_0.png",
    "/assets/path/block_1.png",
    "/assets/path/block_2.png",
    "/assets/path/block_3.png",
    "/assets/path/block_4.png",
    "/assets/path/block_5.png",
    "/assets/path/block_6.png",
    "/assets/path/block_7.png",
    "/assets/path/block_8.png",
    "/assets/path/block_9.png",
    "/assets/path/block_10.png",
    "/assets/path/block_11.png",
    "/assets/path/block_12.png",
    "/assets/path/block_13.png",
    "/assets/path/block_14.png",
    "/assets/path/block_15.png",
];

/// Source path of the stairs block for every direction a flight climbs toward, in the contract
/// order (+x, +y, -x, -y). Each file is drawn in its own orientation, never mirrored, so the lit
/// and the shaded faces stay where the sun puts them.
pub const STAIRS_BLOCK_SOURCES: [(WorldCoord, &str); 4] = [
    (WorldCoord { x: 1, y: 0 }, "/assets/stairs/block_px.png"),
    (WorldCoord { x: 0, y: 1 }, "/assets/stairs/block_py.png"),
    (WorldCoord { x: -1, y: 0 }, "/assets/stairs/block_nx.png"),
    (WorldCoord { x: 0, y: -1 }, "/assets/stairs/block_ny.png"),
];

/// Source path of the stairs block whose flight climbs toward `direction`, or `None` when that
/// is not one of the four sides.
pub fn stairs_sprite_source(direction: WorldCoord) -> Option<&'static str> {
    STAIRS_BLOCK_SOURCES
        .iter()
        .find(|(step, _)| *step == direction)
        .map(|(_, source)| *source)
}

/// Source path of the path block for `mask` (only the low four bits are meaningful).
pub fn path_sprite_source(mask: u8) -> &'static str {
    PATH_BLOCK_SOURCES[usize::from(mask & 0b1111)]
}

/// Source path of the reflection asset drawn exactly as the water shows `material`, or `None`
/// for the water itself. A flight of stairs borrows the path's reflection: it only ever shows as
/// a sliver of road on the water. The art hangs below the anchor one block tall, as the water sees it.
pub fn terrain_reflection_source(material: TerrainMaterial) -> Option<&'static str> {
    match material {
        TerrainMaterial::Water => None,
        TerrainMaterial::Sand => Some("/assets/sand/block_reflection.png"),
        TerrainMaterial::Ground => Some("/assets/ground/block_reflection.png"),
        TerrainMaterial::Grass => Some("/assets/grass/block_reflection.png"),
        TerrainMaterial::Path | TerrainMaterial::Stairs => {
            Some("/assets/path/block_reflection.png")
        }
    }
}

#[cfg(test)]
#[path = "terrain_sprites.test.rs"]
mod tests;
