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
    pub fn material_at(self, level: i32) -> Option<TerrainMaterial> {
        if level > self.elevation {
            None
        } else if level == self.elevation {
            Some(self.surface)
        } else if self.surface == TerrainMaterial::Water {
            Some(TerrainMaterial::Water)
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TerrainBlock {
    pub coord: WorldCoord,
    pub elevation: i32,
    pub material: TerrainMaterial,
}

#[cfg(test)]
#[path = "columns.test.rs"]
mod tests;
