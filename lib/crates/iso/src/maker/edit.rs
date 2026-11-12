//! What one stroke of the brush does to the chunk under it.
//!
//! A stroke reads the world, decides, and writes at most once: terrain through the chunk
//! manager, dressing through the overrides, entities through the catalog's own placement rule.
//! It answers what it changed, so the client knows whether to rebake the light.

use crate::entities::{Entity, placement_by_hand};
use crate::grid::{WorldCoord, to_chunk_coord};
use crate::maker::brush::{MakerBrush, MakerTool};
use crate::maker::dressing::Dressing;
use crate::terrain::TerrainMaterial;
use crate::world::ChunkManager;

/// Lowest level a stroke may sink a column to.
pub const MAKER_MIN_ELEVATION: i32 = -3;
/// Highest level a stroke may lift a column to.
pub const MAKER_MAX_ELEVATION: i32 = 8;

/// What one stroke changed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MakerStroke {
    /// Nothing: the cell was outside the world, or already as the brush wanted it.
    Nothing,
    /// The column's level or surface.
    Terrain,
    /// The colour zone or the top of the cell.
    Dressing,
    /// What stands on the cell.
    Entities,
}

/// The surface a column carries at `elevation`: water below the shore, the asked material at or
/// above it, and sand where a shore is asked to hold water.
fn surface_at(elevation: i32, asked: TerrainMaterial) -> TerrainMaterial {
    match (elevation < 0, asked) {
        (true, _) => TerrainMaterial::Water,
        (false, TerrainMaterial::Water) => TerrainMaterial::Sand,
        (false, asked) => asked,
    }
}

/// Applies `brush` to the cell `at`, and says what it changed.
pub fn apply_brush(
    manager: &mut ChunkManager,
    dressing: &mut Dressing,
    brush: &MakerBrush,
    at: WorldCoord,
) -> MakerStroke {
    let Some(column) = manager.column_at(at.x, at.y) else {
        return MakerStroke::Nothing;
    };
    match brush.tool {
        MakerTool::Raise | MakerTool::Lower => {
            let step = if brush.tool == MakerTool::Raise {
                1
            } else {
                -1
            };
            let elevation =
                (column.elevation + step).clamp(MAKER_MIN_ELEVATION, MAKER_MAX_ELEVATION);
            if elevation == column.elevation {
                return MakerStroke::Nothing;
            }
            let surface = surface_at(elevation, column.surface);
            match manager.edit_column(at, elevation, surface) {
                Ok(()) => MakerStroke::Terrain,
                Err(_) => MakerStroke::Nothing,
            }
        }
        MakerTool::Surface => {
            let elevation = match (brush.surface, column.elevation) {
                (TerrainMaterial::Water, level) if level >= 0 => -1,
                (_, level) if level < 0 => 0,
                (_, level) => level,
            };
            let surface = surface_at(elevation, brush.surface);
            if elevation == column.elevation && surface == column.surface {
                return MakerStroke::Nothing;
            }
            match manager.edit_column(at, elevation, surface) {
                Ok(()) => MakerStroke::Terrain,
                Err(_) => MakerStroke::Nothing,
            }
        }
        MakerTool::Tint => {
            if dressing.tint(at) == Some(brush.tint) {
                return MakerStroke::Nothing;
            }
            dressing.set_tint(at, Some(brush.tint));
            MakerStroke::Dressing
        }
        MakerTool::Top => {
            if dressing.top(at) == Some(brush.top) {
                return MakerStroke::Nothing;
            }
            dressing.set_top(at, Some(brush.top));
            MakerStroke::Dressing
        }
        MakerTool::Place => {
            let Some(blueprint) = manager.catalog().entities.get(brush.blueprint).cloned() else {
                return MakerStroke::Nothing;
            };
            let chunk = to_chunk_coord(at);
            let Some(columns) = manager.terrain_chunk(chunk) else {
                return MakerStroke::Nothing;
            };
            let standing = manager.entities_chunk(chunk).unwrap_or_default();
            let Some(placement) = placement_by_hand(at, &blueprint, columns, standing) else {
                return MakerStroke::Nothing;
            };
            let entity = Entity::new(
                placement.anchor.x,
                placement.anchor.y,
                &blueprint,
                placement.elevation,
            );
            if manager.put_entity(entity) {
                MakerStroke::Entities
            } else {
                MakerStroke::Nothing
            }
        }
        MakerTool::Erase => {
            if manager.remove_entity_at(at.x, at.y).is_some() {
                return MakerStroke::Entities;
            }
            if dressing.clear(at) {
                return MakerStroke::Dressing;
            }
            MakerStroke::Nothing
        }
    }
}

#[cfg(test)]
#[path = "edit.test.rs"]
mod tests;
