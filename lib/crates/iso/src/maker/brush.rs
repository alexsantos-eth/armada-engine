//! The brush in the maker's hand: which tool a stroke uses and everything that tool needs.

use crate::entities::EntityCatalog;
use crate::terrain::TerrainMaterial;

/// What one stroke of the brush does to the cell under it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MakerTool {
    /// Lifts the column one block.
    Raise,
    /// Sinks the column one block.
    Lower,
    /// Paints the column's surface with the brush's material.
    Surface,
    /// Writes the brush's colour zone over the cell.
    Tint,
    /// Grows the brush's top on the cell, or leaves the block plain.
    Top,
    /// Puts the brush's blueprint down, anchored on the cell.
    Place,
    /// Takes away whatever stands on the cell, then its dressing.
    Erase,
}

/// The tools the panel offers, in the order it lists them.
pub const MAKER_TOOLS: [MakerTool; 7] = [
    MakerTool::Raise,
    MakerTool::Lower,
    MakerTool::Surface,
    MakerTool::Tint,
    MakerTool::Top,
    MakerTool::Place,
    MakerTool::Erase,
];

/// The surfaces a stroke can paint, in the order the panel lists them.
pub const MAKER_SURFACES: [TerrainMaterial; 6] = [
    TerrainMaterial::Grass,
    TerrainMaterial::Sand,
    TerrainMaterial::Ground,
    TerrainMaterial::Path,
    TerrainMaterial::Stairs,
    TerrainMaterial::Water,
];

/// The tool in hand and the choices it draws from.
#[derive(Clone, Debug, PartialEq)]
pub struct MakerBrush {
    pub tool: MakerTool,
    /// The material a surface stroke paints.
    pub surface: TerrainMaterial,
    /// The colour zone a tint stroke writes, as an index into the material's palette.
    pub tint: usize,
    /// The top a dressing stroke grows; `None` leaves the plain block.
    pub top: Option<usize>,
    /// The blueprint a placing stroke puts down, as an index into the catalog.
    pub blueprint: usize,
}

impl Default for MakerBrush {
    fn default() -> Self {
        Self {
            tool: MakerTool::Raise,
            surface: TerrainMaterial::Grass,
            tint: 0,
            top: None,
            blueprint: 0,
        }
    }
}

impl MakerBrush {
    /// Turns the blueprint in hand a quarter turn, which in this content is its sibling along
    /// the other axis (`hotel_x` and `hotel_y`). Says whether the catalog had one to move to.
    pub fn turn(&mut self, catalog: &EntityCatalog) -> bool {
        let Some(current) = catalog.entities.get(self.blueprint) else {
            return false;
        };
        let Some(sibling) = turned_blueprint(&current.id) else {
            return false;
        };
        let Some(index) = catalog
            .entities
            .iter()
            .position(|blueprint| blueprint.id == sibling)
        else {
            return false;
        };
        self.blueprint = index;
        true
    }
}

/// The name of the blueprint `id` turned a quarter turn: the same name with its axis segment
/// swapped (`apartments_x` to `apartments_y`, `pier_x_reverse` to `pier_y_reverse`). `None`
/// when the name carries no axis, so the artwork only stands one way.
pub fn turned_blueprint(id: &str) -> Option<String> {
    let mut segments: Vec<&str> = id.split('_').collect();
    let axis = segments
        .iter()
        .position(|segment| *segment == "x" || *segment == "y")?;
    segments[axis] = if segments[axis] == "x" { "y" } else { "x" };
    Some(segments.join("_"))
}

#[cfg(test)]
#[path = "brush.test.rs"]
mod tests;
