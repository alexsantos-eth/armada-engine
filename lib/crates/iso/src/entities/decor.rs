//! The post-road decor: the small props that stand on a chunk once its roads are carved.
//!
//! Every other placement pass runs before the roads exist, so it can never see a path cell:
//! a blueprint that lists a path (or any carved block) in `additionalSurfaces` anchors there
//! only from here. The pass scatters the zero-collision blueprints — the small rocks — over
//! their additional surfaces, skips any column something already occupies, and rolls from its
//! own deterministic stream so it never correlates with the other passes.

use crate::entities::blueprint::EntityCatalog;
use crate::entities::entity::Entity;
use crate::entities::placement::{PlacementContext, find_placement};
use crate::grid::{CellMap, SpatialIndex};
use crate::terrain::TerrainColumn;

/// Columns per instance of one blueprint, on average, on the additional surfaces.
const DECOR_DENSITY: u64 = 40;

/// Deterministic roll for one blueprint at one column, in the decor's own stream.
fn decor_roll(id: &str, x: i32, y: i32) -> u64 {
    const OFFSET: u64 = 0x8422_2325_cbf2_9ce4;
    const PRIME: u64 = 0x1000_0000_01b3;
    let mut hash = OFFSET;
    for byte in id
        .as_bytes()
        .iter()
        .copied()
        .chain(x.to_le_bytes())
        .chain(y.to_le_bytes())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(PRIME);
    }
    hash ^= hash >> 30;
    hash = hash.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    hash ^= hash >> 27;
    hash = hash.wrapping_mul(0x94d0_49bb_1331_11eb);
    hash ^ (hash >> 31)
}

/// Places the zero-collision blueprints on their additional surfaces, over the columns as
/// they stand after the roads are carved. `placed` carries everything already standing and
/// receives the decor; returns the new entities in catalog order, then column order.
pub fn place_decor(
    columns: &[TerrainColumn],
    catalog: &EntityCatalog,
    placed: &mut SpatialIndex<Entity>,
) -> Vec<Entity> {
    let mut columns_map = CellMap::new();
    for column in columns {
        let _ = columns_map.insert(column.coord, *column);
    }
    let mut entities = Vec::new();
    for blueprint in &catalog.entities {
        let zero_collision = blueprint.shape.collision.iter().all(|&size| size <= 0.0);
        if blueprint.npc.is_some()
            || !zero_collision
            || blueprint.placement.additional_surfaces.is_empty()
        {
            continue;
        }
        for column in columns {
            if !blueprint
                .placement
                .additional_surfaces
                .contains(&column.surface)
            {
                continue;
            }
            if !decor_roll(&blueprint.id, column.coord.x, column.coord.y)
                .is_multiple_of(DECOR_DENSITY)
            {
                continue;
            }
            let mut context = PlacementContext::new(&columns_map, placed);
            let Some(placement) = find_placement(column.coord, blueprint, &mut context, 1) else {
                continue;
            };
            let entity = Entity::new(
                placement.anchor.x,
                placement.anchor.y,
                blueprint,
                placement.elevation,
            );
            if placed.insert(entity.clone(), &placement.footprint).is_err() {
                continue;
            }
            entities.push(entity);
        }
    }
    entities
}

#[cfg(test)]
#[path = "decor.test.rs"]
mod tests;
