//! Which way a flight of stairs climbs: the road block that steps up a whole block.

use crate::grid::WorldCoord;
use crate::terrain::TerrainMaterial;

/// The sides of a column, in the order the game's contract reads them: +x, +y, -x, -y.
const SIDES: [(i32, i32); 4] = [(1, 0), (0, 1), (-1, 0), (0, -1)];

/// The side `coord` climbs toward, when the road on it steps up a whole block from the road on
/// one of its sides: the direction away from that lower neighbour, as a unit step.
/// `None` where the road stays level, drops more than one block, or only borders plain ground.
/// Sides are read in the contract order (+x, +y, -x, -y) from `at`, which answers with the
/// surface and the elevation of the column at another coordinate, or `None` when there is none.
/// The rule reads the terrain alone, so the world materializes a flight and the view dresses it
/// with the same answer.
pub fn stairs_direction(
    coord: WorldCoord,
    elevation: i32,
    at: impl Fn(WorldCoord) -> Option<(TerrainMaterial, i32)>,
) -> Option<WorldCoord> {
    SIDES.into_iter().find_map(|(dx, dy)| {
        let neighbour = WorldCoord {
            x: coord.x.saturating_add(dx),
            y: coord.y.saturating_add(dy),
        };
        let (material, below) = at(neighbour)?;
        (is_road(material) && below == elevation.saturating_sub(1))
            .then_some(WorldCoord { x: -dx, y: -dy })
    })
}

/// Whether a surface carries the road: its path blocks and the flights between their levels.
pub fn is_road(material: TerrainMaterial) -> bool {
    matches!(material, TerrainMaterial::Path | TerrainMaterial::Stairs)
}

#[cfg(test)]
#[path = "stairs.test.rs"]
mod tests;
