//! The faces of a flat-sided box as the camera sees it.

use crate::player::VoxelFaces;

/// The three faces of a box that stands on the ground, `across` columns wide along x and `deep`
/// along y, `height_blocks` tall, as screen points relative to the middle of its bottom: the
/// shapes [`crate::player::voxel_faces`] gives a cube, for a box that is not one.
pub fn box_faces(
    across: f64,
    deep: f64,
    height_blocks: f64,
    tile_width: f64,
    tile_height: f64,
    box_height: f64,
) -> VoxelFaces {
    let (hx, hy) = (across / 2.0, deep / 2.0);
    let v = height_blocks * box_height;
    // Where the corner `(dx, dy)` columns from the middle lies, `z` pixels up.
    let corner = |dx: f64, dy: f64, z: f64| {
        (
            (dx - dy) * tile_width / 2.0,
            -(dx + dy) * tile_height / 2.0 - z,
        )
    };
    VoxelFaces {
        top: [
            corner(hx, hy, v),
            corner(hx, -hy, v),
            corner(-hx, -hy, v),
            corner(-hx, hy, v),
        ],
        left: [
            corner(-hx, hy, v),
            corner(-hx, -hy, v),
            corner(-hx, -hy, 0.0),
            corner(-hx, hy, 0.0),
        ],
        right: [
            corner(-hx, -hy, v),
            corner(hx, -hy, v),
            corner(hx, -hy, 0.0),
            corner(-hx, -hy, 0.0),
        ],
    }
}

#[cfg(test)]
#[path = "faces.test.rs"]
mod tests;
