//! What the player can gather from where it stands: the nearest harvestable entity in reach.

use crate::entities::{Entity, get_entity_footprint_for};
use crate::grid::WorldCoord;
use crate::items::ItemCatalog;
use crate::player::physics::PLAYER_RADIUS;
use crate::projection::GridPoint;

/// Farthest the player may be from touching an entity for it to be picked at all, in columns:
/// beyond [`HARVEST_CONTACT_SLACK`] the player walks up to it before it strikes.
pub const HARVEST_SIGHT: f64 = 3.5;

/// Columns of gap left between the player's body and the entity's at which it strikes: as close
/// as the collision lets it come, give or take what one tick of a slow walk covers.
pub const HARVEST_CONTACT_SLACK: f64 = 0.08;

/// Gap, in columns, over which the approach slows from a full walk down to a creep, so the
/// player arrives instead of walking into the entity and bouncing off it.
pub const HARVEST_APPROACH_EASE: f64 = 0.6;

/// Slowest share of a full walk the approach eases down to.
pub const HARVEST_APPROACH_CREEP: f64 = 0.25;

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
#[derive(Clone, Debug, PartialEq)]
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
    /// Columns left between the player's body and that cell's collision square before they
    /// touch, measured along the axis they are farthest apart on, as the collision is.
    pub gap: f64,
    /// Whether the gap is within [`HARVEST_CONTACT_SLACK`], so the player strikes from where it is.
    pub in_reach: bool,
}

/// The harvestable entity among `entities` with the smallest gap to `feet`, within
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
            .map(|cell| (gap_to(entity, cell, feet.at), cell))
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
        gap: distance,
        in_reach: distance <= HARVEST_CONTACT_SLACK,
    })
}

/// Columns left between a player with feet at `at` and the collision square `entity` has on
/// `cell`, along the axis they are farthest apart on; negative when they overlap.
fn gap_to(entity: &Entity, cell: WorldCoord, at: GridPoint) -> f64 {
    let side = if entity.walkable() {
        0.0
    } else {
        entity.collision_at(cell.x, cell.y)
    };
    let apart = (f64::from(cell.x) - at.x)
        .abs()
        .max((f64::from(cell.y) - at.y).abs());
    apart - PLAYER_RADIUS - side / 2.0
}

/// The walk that takes a player whose feet are at `feet` straight towards `target`'s nearest
/// cell: a full walk while far, easing down to [`HARVEST_APPROACH_CREEP`] over the last
/// [`HARVEST_APPROACH_EASE`] of the gap; still when it is already there.
pub fn approach_walk(target: &HarvestTarget, feet: GridPoint) -> GridPoint {
    let x = f64::from(target.nearest.x) - feet.x;
    let y = f64::from(target.nearest.y) - feet.y;
    let length = x.hypot(y);
    if length == 0.0 {
        return GridPoint { x: 0.0, y: 0.0 };
    }
    let pace = (target.gap / HARVEST_APPROACH_EASE).clamp(HARVEST_APPROACH_CREEP, 1.0);
    GridPoint {
        x: x / length * pace,
        y: y / length * pace,
    }
}

/// The columns around a harvested entity at `anchor` its baked shadow may have fallen on: the
/// area whose bake is stale once it is gone.
pub fn shadow_area(anchor: WorldCoord) -> crate::grid::WorldRect {
    crate::grid::WorldRect {
        min_x: anchor.x - HARVEST_SHADOW_SPAN,
        min_y: anchor.y - HARVEST_SHADOW_SPAN,
        max_x: anchor.x + HARVEST_SHADOW_SPAN,
        max_y: anchor.y + HARVEST_SHADOW_SPAN,
    }
}

#[cfg(test)]
#[path = "reach.test.rs"]
mod tests;
