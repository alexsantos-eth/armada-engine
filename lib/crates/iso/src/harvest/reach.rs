//! What the player can gather from where it stands: the nearest harvestable entity in reach.

use crate::entities::{Entity, get_entity_footprint_for};
use crate::grid::WorldCoord;
use crate::items::ItemCatalog;
use crate::projection::GridPoint;

/// Farthest a footprint cell's centre may be from the player's feet, in columns: every
/// neighbouring column, diagonals included.
pub const HARVEST_REACH: f64 = 1.5;

/// Farthest a footprint cell may be for the entity to be picked at all, in columns: beyond
/// [`HARVEST_REACH`] the player walks up to it before it strikes.
pub const HARVEST_SIGHT: f64 = 4.0;

/// Columns around a harvested entity's anchor its baked shadow may fall on.
pub const HARVEST_SHADOW_SPAN: i32 = 8;

/// Most blocks an entity's base may sit above or below the player's feet.
pub const HARVEST_LEVEL_REACH: f64 = 2.0;

/// Where the player's feet are: the column point (column centres are integers) and its height.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Feet {
    pub at: GridPoint,
    pub elevation: f64,
}

/// One entity the player can gather.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HarvestTarget {
    /// Instance id of the entity.
    pub id: String,
    /// Its anchor cell, which takes it away from the world.
    pub anchor: WorldCoord,
    /// Its blueprint, which names its harvest rule.
    pub blueprint: String,
    /// The block its base stands on, where the blows land.
    pub elevation: i32,
    /// Its footprint cell nearest the feet, the one the player walks towards.
    pub nearest: WorldCoord,
    /// Whether that cell is within [`HARVEST_REACH`], so the player can strike from where it is.
    pub in_reach: bool,
}

/// The harvestable entity among `entities` with a footprint cell nearest to `feet` within
/// [`HARVEST_SIGHT`] and [`HARVEST_LEVEL_REACH`]; ties go to the smaller id, so the pick never
/// depends on the order the entities come in.
pub fn pick_harvest_target<'a>(
    feet: Feet,
    entities: impl IntoIterator<Item = &'a Entity>,
    items: &ItemCatalog,
) -> Option<HarvestTarget> {
    let mut best: Option<(f64, &Entity, WorldCoord)> = None;
    for entity in entities {
        if items.harvest_rule(entity.type_()).is_none()
            || (f64::from(entity.elevation()) - feet.elevation).abs() > HARVEST_LEVEL_REACH
        {
            continue;
        }
        let Some((distance, cell)) = get_entity_footprint_for(entity)
            .into_iter()
            .map(|cell| {
                let distance = (f64::from(cell.x) - feet.at.x).hypot(f64::from(cell.y) - feet.at.y);
                (distance, cell)
            })
            .reduce(|a, b| if b.0 < a.0 { b } else { a })
        else {
            continue;
        };
        if distance > HARVEST_SIGHT {
            continue;
        }
        let closer = match best {
            None => true,
            Some((best_distance, best_entity, _)) => {
                distance < best_distance
                    || (distance == best_distance && entity.id() < best_entity.id())
            }
        };
        if closer {
            best = Some((distance, entity, cell));
        }
    }
    best.map(|(distance, entity, nearest)| HarvestTarget {
        id: entity.id().to_owned(),
        anchor: WorldCoord {
            x: entity.x(),
            y: entity.y(),
        },
        blueprint: entity.type_().to_owned(),
        elevation: entity.elevation(),
        nearest,
        in_reach: distance <= HARVEST_REACH,
    })
}

/// The unit walk that takes a player whose feet are at `feet` straight towards `target`'s
/// nearest cell; still when it is already there.
pub fn approach_walk(target: &HarvestTarget, feet: GridPoint) -> GridPoint {
    let x = f64::from(target.nearest.x) - feet.x;
    let y = f64::from(target.nearest.y) - feet.y;
    let length = x.hypot(y);
    if length == 0.0 {
        return GridPoint { x: 0.0, y: 0.0 };
    }
    GridPoint {
        x: x / length,
        y: y / length,
    }
}

/// The chunks a harvested entity at `anchor` may have cast its baked shadow on, whose bake is
/// stale once it is gone.
pub fn shadow_chunks(anchor: WorldCoord) -> Vec<crate::grid::ChunkCoord> {
    crate::grid::chunks_in_rect(crate::grid::WorldRect {
        min_x: anchor.x - HARVEST_SHADOW_SPAN,
        min_y: anchor.y - HARVEST_SHADOW_SPAN,
        max_x: anchor.x + HARVEST_SHADOW_SPAN,
        max_y: anchor.y + HARVEST_SHADOW_SPAN,
    })
}

#[cfg(test)]
#[path = "reach.test.rs"]
mod tests;
