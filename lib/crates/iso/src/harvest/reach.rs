//! What the player can gather from where it stands: the nearest harvestable entity in reach.

use crate::entities::{Entity, get_entity_footprint_for};
use crate::grid::WorldCoord;
use crate::items::ItemCatalog;
use crate::projection::GridPoint;

/// Farthest a footprint cell's centre may be from the player's feet, in columns: every
/// neighbouring column, diagonals included.
pub const HARVEST_REACH: f64 = 1.5;

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
}

/// The harvestable entity among `entities` with a footprint cell nearest to `feet` within
/// [`HARVEST_REACH`] and [`HARVEST_LEVEL_REACH`]; ties go to the smaller id, so the pick never
/// depends on the order the entities come in.
pub fn pick_harvest_target<'a>(
    feet: Feet,
    entities: impl IntoIterator<Item = &'a Entity>,
    items: &ItemCatalog,
) -> Option<HarvestTarget> {
    let mut best: Option<(f64, &Entity)> = None;
    for entity in entities {
        if items.harvest_rule(entity.type_()).is_none()
            || (f64::from(entity.elevation()) - feet.elevation).abs() > HARVEST_LEVEL_REACH
        {
            continue;
        }
        let Some(distance) = get_entity_footprint_for(entity)
            .into_iter()
            .map(|cell| (f64::from(cell.x) - feet.at.x).hypot(f64::from(cell.y) - feet.at.y))
            .reduce(f64::min)
        else {
            continue;
        };
        if distance > HARVEST_REACH {
            continue;
        }
        let closer = match best {
            None => true,
            Some((best_distance, best_entity)) => {
                distance < best_distance
                    || (distance == best_distance && entity.id() < best_entity.id())
            }
        };
        if closer {
            best = Some((distance, entity));
        }
    }
    best.map(|(_, entity)| HarvestTarget {
        id: entity.id().to_owned(),
        anchor: WorldCoord {
            x: entity.x(),
            y: entity.y(),
        },
        blueprint: entity.type_().to_owned(),
    })
}

#[cfg(test)]
#[path = "reach.test.rs"]
mod tests;
