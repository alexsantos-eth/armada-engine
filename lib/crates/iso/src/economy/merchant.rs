//! Which merchant the player can talk to from where they stand.

use crate::economy::EconomyCatalog;
use crate::entities::{Entity, get_entity_footprint_for};
use crate::grid::WorldCoord;
use crate::harvest::Feet;

/// Farthest, in columns, the player's feet may be from a merchant's nearest cell to trade.
pub const TRADE_REACH: f64 = 2.0;

/// Most blocks between a merchant's base and the player's feet for them to trade.
pub const TRADE_LEVEL_REACH: f64 = 2.0;

/// A merchant within reach.
#[derive(Clone, Debug, PartialEq)]
pub struct Merchant {
    /// Instance id of the entity.
    pub id: String,
    pub anchor: WorldCoord,
    pub blueprint: String,
    /// Columns from the feet to its nearest cell.
    pub distance: f64,
}

/// The merchant among `entities` nearest to `feet` within [`TRADE_REACH`]; ties go to the smaller
/// id, so the pick never depends on the order the entities come in.
pub fn pick_merchant<'a>(
    feet: Feet,
    entities: impl IntoIterator<Item = &'a Entity>,
    economy: &EconomyCatalog,
) -> Option<Merchant> {
    let mut best: Option<Merchant> = None;
    for entity in entities {
        if !economy.is_merchant(entity.type_())
            || (f64::from(entity.elevation()) - feet.elevation).abs() > TRADE_LEVEL_REACH
        {
            continue;
        }
        let nearest = get_entity_footprint_for(entity)
            .into_iter()
            .map(|cell| {
                (
                    (f64::from(cell.x) - feet.at.x).hypot(f64::from(cell.y) - feet.at.y),
                    cell,
                )
            })
            .reduce(|a, b| if b.0 < a.0 { b } else { a });
        let Some((distance, _)) = nearest else {
            continue;
        };
        if distance > TRADE_REACH {
            continue;
        }
        let closer = best.as_ref().is_none_or(|held| {
            distance < held.distance
                || (distance == held.distance && entity.id() < held.id.as_str())
        });
        if closer {
            best = Some(Merchant {
                id: entity.id().to_owned(),
                anchor: WorldCoord {
                    x: entity.x(),
                    y: entity.y(),
                },
                blueprint: entity.type_().to_owned(),
                distance,
            });
        }
    }
    best
}

#[cfg(test)]
#[path = "merchant.test.rs"]
mod tests;
