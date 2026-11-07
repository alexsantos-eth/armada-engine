//! Terrain views consume already generated columns.

use iso::terrain::TerrainMaterial;

pub mod appearance;
pub mod blocks;

/// Every terrain material, in the order the view's arrays index them.
pub const MATERIALS: [TerrainMaterial; 5] = [
    TerrainMaterial::Water,
    TerrainMaterial::Sand,
    TerrainMaterial::Ground,
    TerrainMaterial::Grass,
    TerrainMaterial::Path,
];

/// How many slots an array indexed by material needs.
pub const MATERIAL_SLOTS: usize = MATERIALS.len();

/// Where `material` sits in such an array.
///
/// The views keep what they know about a material in a fixed array rather than a map: the frame
/// and the colour zone of a material are asked for once per drawn block, several hundred a frame,
/// and a hash lookup each was measurable.
pub const fn slot(material: TerrainMaterial) -> usize {
    match material {
        TerrainMaterial::Water => 0,
        TerrainMaterial::Sand => 1,
        TerrainMaterial::Ground => 2,
        TerrainMaterial::Grass => 3,
        TerrainMaterial::Path => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The two halves of the mapping have to agree, or a material would read another's frame.
    #[test]
    fn every_material_has_its_own_slot_and_the_list_is_in_slot_order() {
        for (index, material) in MATERIALS.iter().enumerate() {
            assert_eq!(slot(*material), index, "{material:?}");
        }
    }
}
