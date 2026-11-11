//! Terrain views consume already generated columns.

use iso::terrain::TerrainMaterial;

/// Every terrain material, in the order the view's arrays index them.
pub const MATERIALS: [TerrainMaterial; 6] = [
    TerrainMaterial::Water,
    TerrainMaterial::Sand,
    TerrainMaterial::Ground,
    TerrainMaterial::Grass,
    TerrainMaterial::Path,
    TerrainMaterial::Stairs,
];

/// How many slots an array indexed by material needs.
pub const MATERIAL_SLOTS: usize = MATERIALS.len();

/// Where `material` sits in such an array.
pub const fn slot(material: TerrainMaterial) -> usize {
    match material {
        TerrainMaterial::Water => 0,
        TerrainMaterial::Sand => 1,
        TerrainMaterial::Ground => 2,
        TerrainMaterial::Grass => 3,
        TerrainMaterial::Path => 4,
        TerrainMaterial::Stairs => 5,
    }
}

#[cfg(test)]
#[path = "terrain_view.test.rs"]
mod tests;
