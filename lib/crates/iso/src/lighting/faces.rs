//! The vertical faces of the ground, which are the other half of where a shadow can land.

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
