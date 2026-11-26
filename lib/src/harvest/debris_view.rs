//! How a gathered entity is shown going: its pieces, the ones it was assembled from, thrown apart
//! and falling over the spot where it stood. View state only: nothing here is saved or reaches
//! the simulation.
//!
//! What every piece does is `iso::debris` (the blast); this puts the boxes of each piece on the
//! screen, drawn like the dust's voxels, and keeps the clocks. The placing is pure and tested in
//! `debris_view.test.rs`; `DebrisView::collect` only turns it into draws.

use iso::debris::{
    DEBRIS_MS, EntityParts, Fragment, VOXELS_PER_BLOCK, VOXELS_PER_TILE, blast, box_faces,
    model_to_grid, pose_at,
};
use iso::grid::WorldCoord;
use iso::projection::{GridPoint, ProjectionConfig, project_grid_point};
use macroquad::prelude::Color;

use crate::assets::sprites::{SpriteDraw, scene_key};
use crate::game::config::ENTITY_LAYER;

/// Entities coming apart at once; the oldest gives way to a new one when they are all alive.
pub(crate) const MAX_BLASTS: usize = 6;

/// How bright each face of a box is, as a share of its colour: the top is lit, the two sides
/// are the shades the clay renderer gives the faces on that side.
pub(crate) const TOP_SHADE: f32 = 1.0;
pub(crate) const LEFT_SHADE: f32 = 0.77;
pub(crate) const RIGHT_SHADE: f32 = 0.93;

/// One box of a piece, where it is in the scene at this moment.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Placed {
    /// Columns (x, y) of the middle of its bottom, and blocks above the entity's base.
    pub(crate) at: [f64; 3],
    /// Columns along x and y and blocks up.
    pub(crate) size: [f64; 3],
    pub(crate) color: u32,
    pub(crate) alpha: f64,
}

/// One entity coming apart.
#[derive(Clone, Debug)]
struct Blast {
    parts: EntityParts,
    fragments: Vec<Fragment>,
    /// The middle of the tile it stood on, in columns, and the block its base was on.
    anchor: GridPoint,
    elevation: f64,
    /// Real milliseconds since it went.
    ms: f64,
}

/// The entities going apart.
#[derive(Clone, Debug, Default)]
pub(crate) struct DebrisView {
    blasts: Vec<Blast>,
}

impl Blast {
    /// Every box of every piece that is still there, put where the blast has taken it.
    fn placed(&self) -> Vec<Placed> {
        let mut out = Vec::new();
        for fragment in &self.fragments {
            let Some(pose) = pose_at(fragment, self.ms) else {
                continue;
            };
            let part = &self.parts.parts[fragment.part];
            for b in &part.boxes {
                // The model's x is the grid's -y and its y the grid's -x (`model_to_grid`).
                let offset = model_to_grid(b.centre[0], b.centre[1]);
                let across = 2.0 * b.half[1] / VOXELS_PER_TILE * pose.scale;
                let deep = 2.0 * b.half[0] / VOXELS_PER_TILE * pose.scale;
                let height = 2.0 * b.half[2] / VOXELS_PER_BLOCK * pose.scale;
                // The boxes of a piece are measured from its lowest point.
                let base = (b.centre[2] - b.half[2]) / VOXELS_PER_BLOCK;
                out.push(Placed {
                    at: [
                        self.anchor.x + pose.at[0] + offset.x * pose.scale,
                        self.anchor.y + pose.at[1] + offset.y * pose.scale,
                        self.elevation + pose.at[2] + base * pose.scale,
                    ],
                    size: [across, deep, height],
                    color: b.color,
                    alpha: pose.alpha,
                });
            }
        }
        out
    }
}

impl DebrisView {
    /// Starts the blast of an entity of `parts` that stood on the tile `anchor`, on the block
    /// `elevation`. `seed` scatters the pieces: the same one breaks the same way.
    pub(crate) fn spawn(
        &mut self,
        parts: &EntityParts,
        anchor: WorldCoord,
        elevation: i32,
        seed: u64,
    ) {
        if self.blasts.len() >= MAX_BLASTS {
            self.blasts.remove(0);
        }
        self.blasts.push(Blast {
            fragments: blast(parts, seed),
            parts: parts.clone(),
            anchor: GridPoint {
                x: f64::from(anchor.x) + 0.5,
                y: f64::from(anchor.y) + 0.5,
            },
            elevation: f64::from(elevation),
            ms: 0.0,
        });
    }

    /// Ages every blast by `elapsed_ms` of real time and drops the ones that are over.
    pub(crate) fn advance(&mut self, elapsed_ms: f64) {
        for blast in &mut self.blasts {
            blast.ms += elapsed_ms.max(0.0);
        }
        self.blasts.retain(|blast| blast.ms < DEBRIS_MS);
    }

    /// How many entities are still coming apart.
    #[cfg(test)]
    pub(crate) fn live(&self) -> usize {
        self.blasts.len()
    }

    /// Queues every box in flight into `draws`, each sorted where it is.
    pub(crate) fn collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>) {
        let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
        for blast in &self.blasts {
            for placed in blast.placed() {
                let screen = project_grid_point(
                    GridPoint {
                        x: placed.at[0],
                        y: placed.at[1],
                    },
                    projection,
                );
                let faces = box_faces(
                    placed.size[0],
                    placed.size[1],
                    placed.size[2],
                    projection.tile_width,
                    projection.tile_height,
                    box_height,
                );
                let shift = |face: [(f64, f64); 4]| {
                    face.map(|point| {
                        (
                            point.0 + screen.x,
                            point.1 + screen.y - placed.at[2] * box_height,
                        )
                    })
                };
                let faces = iso::player::VoxelFaces {
                    top: shift(faces.top),
                    left: shift(faces.left),
                    right: shift(faces.right),
                };
                let key = scene_key(
                    placed.at[0],
                    placed.at[1],
                    placed.at[2],
                    ENTITY_LAYER,
                    projection.tile_height,
                );
                draws.push(SpriteDraw::voxel(
                    key,
                    faces,
                    colours(placed.color, placed.alpha),
                ));
            }
        }
    }
}

/// The colours of a box's top, left and right faces: its colour at each face's brightness.
pub(crate) fn colours(color: u32, alpha: f64) -> [Color; 3] {
    [TOP_SHADE, LEFT_SHADE, RIGHT_SHADE].map(|shade| {
        let channel = |shift: u32| ((color >> shift) & 0xff) as f32 / 255.0 * shade;
        Color::new(channel(16), channel(8), channel(0), alpha as f32)
    })
}

#[cfg(test)]
#[path = "debris_view.test.rs"]
mod tests;
