//! Adapters from the world to locomotion and to reflections.

use std::collections::HashMap;

use iso::entities::EntityLengthAxis;
use iso::player::physics::{PlayerGround, PlayerObstacle};
use iso::terrain::{TerrainColumn, TerrainMaterial};
use iso::world::ChunkManager;

use crate::water::reflection_view::WaterCell;

/// Wraps a `ChunkManager` so it satisfies `PlayerGround` for locomotion.
pub(crate) struct ChunkGround<'a> {
    pub(crate) manager: &'a ChunkManager,
}

impl PlayerGround for ChunkGround<'_> {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn> {
        self.manager.column_at(x, y)
    }
    fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle> {
        let coord = iso::grid::to_chunk_coord(iso::grid::WorldCoord { x, y });
        let Some(entities) = self.manager.entities_chunk(coord) else {
            return Vec::new();
        };
        entities
            .iter()
            .filter(|entity| {
                let axis = entity.length_axis().unwrap_or(EntityLengthAxis::X);
                let length = entity.length().max(1);
                (0..length).any(|i| {
                    let (cx, cy) = if axis == EntityLengthAxis::X {
                        (entity.x() + i, entity.y())
                    } else {
                        (entity.x(), entity.y() + i)
                    };
                    cx == x && cy == y
                })
            })
            .map(|entity| {
                let collision = entity.collision_at(x, y);
                PlayerObstacle {
                    walkable: entity.walkable(),
                    height: Some(entity.height() as f64),
                    elevation: Some(entity.elevation() as f64),
                    collision_at: Some(collision),
                    centre: None,
                }
            })
            .collect()
    }
    fn chunk_has(&self, coord: iso::grid::ChunkCoord) -> bool {
        self.manager.is_discovered(coord)
    }
}

/// The water of a column, or `None` where there is none.
fn water_cell_of(column: Option<TerrainColumn>) -> Option<WaterCell> {
    let column = column?;
    if column.surface != TerrainMaterial::Water {
        return None;
    }
    Some(WaterCell {
        level: f64::from(column.elevation),
        elevation: f64::from(column.elevation),
    })
}

/// The water of every cell drawn this frame, by absolute cell: what the reflections and the
/// terrain ask instead of walking the world cell by cell. A frame that shows no water holds
/// nothing, and its reflections are skipped whole.
pub(crate) struct WaterField {
    cells: HashMap<(i32, i32), WaterCell>,
}

impl WaterField {
    /// The water among `chunks`, the columns of every chunk on screen.
    pub(crate) fn from_chunks<'a>(chunks: impl Iterator<Item = &'a [TerrainColumn]>) -> Self {
        let mut cells = HashMap::new();
        for columns in chunks {
            for column in columns {
                if let Some(cell) = water_cell_of(Some(*column)) {
                    cells.insert((column.coord.x, column.coord.y), cell);
                }
            }
        }
        Self { cells }
    }

    /// The water at `(x, y)`, or `None` when that cell is dry or off screen.
    pub(crate) fn at(&self, x: i32, y: i32) -> Option<WaterCell> {
        self.cells.get(&(x, y)).copied()
    }

    /// Whether the frame shows any water at all.
    pub(crate) fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }
}

#[cfg(test)]
#[path = "ground.test.rs"]
mod tests;
