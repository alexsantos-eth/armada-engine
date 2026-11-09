//! Adapters from the world to locomotion and to reflections.

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

/// The water of the cell `(x, y)`, or `None` where there is none: what a reflection asks the
/// world about the cells beneath a sprite.
pub(crate) fn water_cell(manager: &ChunkManager, x: i32, y: i32) -> Option<WaterCell> {
    water_cell_of(manager.column_at(x, y))
}

#[cfg(test)]
#[path = "ground.test.rs"]
mod tests;
