//! Connection mask of a path column: which of its neighbours continue the road.

use crate::grid::WorldCoord;
use crate::terrain::TerrainMaterial;

/// The sides of `coord` that host a path, as a four-bit mask matching the path block
/// artwork: bit `1` is +x, bit `2` +y, bit `4` -x and bit `8` -y. Neighbours that are missing
/// or not paths are not joined. Bits are read from `at`, which answers with the surface of the
/// column at another coordinate, or `None` when there is no column there.
pub fn connection_mask(
    coord: WorldCoord,
    at: impl Fn(WorldCoord) -> Option<TerrainMaterial>,
) -> u8 {
    const SIDES: [(i32, i32, u8); 4] = [(1, 0, 1), (0, 1, 2), (-1, 0, 4), (0, -1, 8)];
    let mut mask = 0u8;
    for (dx, dy, bit) in SIDES {
        let neighbour = WorldCoord {
            x: coord.x + dx,
            y: coord.y + dy,
        };
        if at(neighbour) == Some(TerrainMaterial::Path) {
            mask |= bit;
        }
    }
    mask
}

#[cfg(test)]
#[path = "connection_mask.test.rs"]
mod tests;
