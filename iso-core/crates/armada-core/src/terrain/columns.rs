//! Materialized terrain data consumed by the world and the view.

use crate::grid::WorldCoord;

/// One block material. The generator does not place paths; a later world system may.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TerrainMaterial {
    Water,
    Sand,
    Ground,
    Grass,
    Path,
}

/// Top of one terrain column. Elevation zero is the sea-level shore.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TerrainColumn {
    pub coord: WorldCoord,
    pub elevation: i32,
    pub surface: TerrainMaterial,
    pub walkable: bool,
}

impl TerrainColumn {
    /// Material at a filled level; blocks below a dry surface support its top.
    ///
    /// A beach is sand one block down as well, not dirt: that block is what shows at the
    /// waterline and under the double row the shore ends on, and both read as sand.
    pub fn material_at(self, level: i32) -> Option<TerrainMaterial> {
        if level > self.elevation {
            None
        } else if level == self.elevation {
            Some(self.surface)
        } else if self.surface == TerrainMaterial::Water {
            Some(TerrainMaterial::Water)
        } else if self.surface == TerrainMaterial::Sand && level == self.elevation - 1 {
            Some(TerrainMaterial::Sand)
        } else {
            Some(TerrainMaterial::Ground)
        }
    }

    /// Blocks from the chosen floor through the top, inclusive, bottom first.
    pub fn blocks_from(self, floor: i32) -> impl Iterator<Item = TerrainBlock> {
        (floor..=self.elevation).map(move |level| TerrainBlock {
            coord: self.coord,
            elevation: level,
            material: self.material_at(level).expect("level is inside column"),
        })
    }
}

/// The four orthogonal neighbours of a column, in the order a caller gathers them; `None` is a
/// column that is not loaded.
pub type AroundHeights = [Option<i32>; 4];

/// Whether a column's top is drawn flush with its cell's plane instead of at the sunken top its
/// material is drawn with — the second step of the shore terrace.
///
/// Only a material drawn as a shallow slab has a sunken top, and only sand is: its top lands
/// about two thirds of a block under the plane its elevation names. A row of beach standing
/// against a step up therefore shows a step and a half, and the row that climbs the step is
/// already a block taller (`TerrainGenerator::shore_step`). This is the row behind it: it keeps
/// its elevation and only its top rises, which splits what is left of the climb into two
/// smaller steps instead of one. Everything else — the open beach, the waterline — keeps the
/// sunken top the beach is drawn with.
///
/// The view draws that top lifted and the player walks on it, so both ask this one question.
pub fn top_is_flush(surface: TerrainMaterial, elevation: i32, around: AroundHeights) -> bool {
    surface == TerrainMaterial::Sand
        && around
            .iter()
            .flatten()
            .any(|height| *height == elevation + 1)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TerrainBlock {
    pub coord: WorldCoord,
    pub elevation: i32,
    pub material: TerrainMaterial,
}

#[cfg(test)]
#[path = "columns.test.rs"]
mod tests;
