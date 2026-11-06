//! The vertical faces of the ground, which are the other half of where a shadow can land.
//!
//! A baked map ([`super::bake`]) is a horizontal thing: it says what falls on the top of each
//! column. Where the ground steps down it also shows a wall, and that wall is lit by the same
//! sun — a building's shadow that runs up to a cliff has to climb it, and a cliff standing in
//! another cliff's shadow is dark all the way down. Neither is in the map, because the map has
//! no room for two surfaces over one column.
//!
//! A face is found the same way the TypeScript client finds it
//! (`core/engine/lighting/faces.ts`): only the shell towards the camera, since the other two
//! sides of a column are never drawn, and split at block boundaries so each piece can be sorted
//! with the scene.

use crate::terrain::TerrainMaterial;

/// Which of a column's two drawn sides a face is: the one facing `-x`, or the one facing `-y`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FaceAxis {
    /// The plane `x = cell.x`, spanning the cell's own `y`.
    X,
    /// The plane `y = cell.y`, spanning the cell's own `x`.
    Y,
}

/// One exposed vertical slab of ground, a block tall at most.
///
/// `top` and `bottom` are levels in blocks, in the same drawn units a shadow lands on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TerrainFace {
    pub x: i32,
    pub y: i32,
    pub axis: FaceAxis,
    pub top: f64,
    pub bottom: f64,
    pub material: TerrainMaterial,
}

impl TerrainFace {
    /// The world point `along` of the way across the face and `down` of the way down it.
    ///
    /// `along` runs with the cell's own axis and `down` from [`top`](Self::top) to
    /// [`bottom`](Self::bottom), so `(0, 0)` is the face's top corner nearest the cell's origin.
    pub fn point(&self, along: f64, down: f64) -> (f64, f64, f64) {
        let (x, y) = (f64::from(self.x), f64::from(self.y));
        let (x, y) = match self.axis {
            FaceAxis::X => (x, y + along),
            FaceAxis::Y => (x + along, y),
        };
        (x, y, self.top + (self.bottom - self.top) * down)
    }
}

/// Every exposed face of `columns`, towards the camera only, split at block boundaries.
///
/// `level_at` answers with the level a column's top is *drawn* at, the same one the map and the
/// faces themselves are measured in, and `None` for a column the world has not loaded. An
/// unknown neighbour counts as level ground rather than opening a wall, which is what keeps a
/// chunk's edge from growing a cliff while the next chunk loads.
///
/// `floor` is as far down as a face is ever cut, which is how far the client draws a column's
/// stack: past that the wall is behind something else anyway.
pub fn terrain_faces(
    columns: impl IntoIterator<Item = (i32, i32, f64, TerrainMaterial)>,
    level_at: impl Fn(i32, i32) -> Option<f64>,
    floor: f64,
) -> Vec<TerrainFace> {
    let mut faces = Vec::new();
    for (x, y, top, material) in columns {
        for axis in [FaceAxis::X, FaceAxis::Y] {
            let (nx, ny) = match axis {
                FaceAxis::X => (x - 1, y),
                FaceAxis::Y => (x, y - 1),
            };
            // An unloaded neighbour is level ground: a wall there would be a chunk edge, not a
            // cliff.
            let Some(neighbour) = level_at(nx, ny) else {
                continue;
            };
            let bottom = neighbour.max(top - floor);
            let mut upper = top;
            while upper > bottom + f64::EPSILON {
                let lower = bottom.max(upper.ceil() - 1.0);
                faces.push(TerrainFace { x, y, axis, top: upper, bottom: lower, material });
                upper = lower;
            }
        }
    }
    faces
}

#[cfg(test)]
#[path = "faces.test.rs"]
mod tests;
