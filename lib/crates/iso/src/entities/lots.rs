//! The lots of a settlement: one building raised on every plot the block grid lays out.
//!
//! The pass runs right after the biome pass and before the wfc solver, so every block of a
//! village is filled with what its zone raises (houses, stalls, groves) before the solver adds
//! decor around it. A uniform zone keys its pick on the block, so a whole block raises one type. It only sees the chunk it is given: a lot belongs to the chunk holding its
//! anchor, and a building that would reach past that chunk gives way to the next candidate.

use crate::entities::blueprint::EntityCatalog;
use crate::entities::entity::{Entity, get_entity_footprint};
use crate::entities::placement::{PlacementContext, find_placement};
use crate::grid::{CellMap, SpatialIndex, WorldRect};
use crate::settlements::WorldSettlements;
use crate::terrain::{TerrainColumn, derive_seed, noise::lattice_at};

/// Label for the stream that picks the building every lot raises.
const LOT_LABEL: &str = "settlements-lot-building";
/// Step between the lattice rows one lot reads its retries from.
const RETRY_STRIDE: i64 = 7_919;

/// What the lots pass reads besides the terrain.
#[derive(Clone, Copy)]
pub struct LotsContent<'a> {
    /// The settlements whose block grid lays the lots out.
    pub settlements: &'a WorldSettlements,
    /// The seed the picks draw from.
    pub seed: u64,
}

/// The rectangle `columns` cover, or `None` when there are none.
fn area_of(columns: &[TerrainColumn]) -> Option<WorldRect> {
    let first = columns.first()?.coord;
    Some(columns.iter().fold(
        WorldRect {
            min_x: first.x,
            min_y: first.y,
            max_x: first.x,
            max_y: first.y,
        },
        |area, column| WorldRect {
            min_x: area.min_x.min(column.coord.x),
            min_y: area.min_y.min(column.coord.y),
            max_x: area.max_x.max(column.coord.x),
            max_y: area.max_y.max(column.coord.y),
        },
    ))
}

/// Raises one building on every lot whose anchor lies in `columns`, picked by its zone's lot
/// weights; a pick that does not fit gives way to the next one until none is left. `placed`
/// carries everything already standing and receives the buildings, returned in lot order.
pub fn raise_lots(
    columns: &[TerrainColumn],
    catalog: &EntityCatalog,
    placed: &mut SpatialIndex<Entity>,
    content: LotsContent<'_>,
) -> Vec<Entity> {
    let Some(area) = area_of(columns) else {
        return Vec::new();
    };
    let mut columns_map = CellMap::new();
    for column in columns {
        let _ = columns_map.insert(column.coord, *column);
    }
    let stream = derive_seed(content.seed, LOT_LABEL);
    let mut lots = content.settlements.lots_in(area);
    lots.sort_by_key(|lot| (lot.anchor.y, lot.anchor.x));
    let mut raised = Vec::new();
    for lot in lots {
        let profile = content.settlements.profile_of(Some(lot.zone));
        let mut candidates: Vec<(usize, f64)> = catalog
            .entities
            .iter()
            .enumerate()
            .filter(|(index, blueprint)| blueprint.npc.is_none() && profile.lot(*index) > 0.0)
            .map(|(index, _)| (index, profile.lot(index)))
            .collect();
        let key = if content.settlements.catalog().zones[lot.zone].uniform {
            lot.block
        } else {
            lot.anchor
        };
        let mut attempt = 0;
        while !candidates.is_empty() {
            let total: f64 = candidates.iter().map(|(_, weight)| weight).sum();
            let mut roll = lattice_at(
                stream,
                i64::from(key.x),
                i64::from(key.y) + attempt * RETRY_STRIDE,
            ) * total;
            let mut pick = candidates.len() - 1;
            for (slot, (_, weight)) in candidates.iter().enumerate() {
                if roll < *weight {
                    pick = slot;
                    break;
                }
                roll -= weight;
            }
            let (index, _) = candidates.remove(pick);
            attempt += 1;
            let blueprint = &catalog.entities[index];
            let mut context = PlacementContext::new(&columns_map, placed);
            let Some(placement) = find_placement(lot.anchor, blueprint, &mut context, 0) else {
                continue;
            };
            let entity = Entity::new(lot.anchor.x, lot.anchor.y, blueprint, placement.elevation);
            let footprint =
                get_entity_footprint(lot.anchor, blueprint.shape.length, blueprint.shape.axis);
            if placed.insert(entity.clone(), &footprint).is_err() {
                continue;
            }
            raised.push(entity);
            break;
        }
    }
    raised
}

#[cfg(test)]
#[path = "lots.test.rs"]
mod tests;
