//! The greenery of a settlement: the patio behind each building and the scatter that fills the
//! rest of its green ground.
//!
//! The pass runs after the buildings are standing, because both rules read where they are: a
//! patio hangs off a building's back side, and the scatter tightens as it approaches a wall and
//! refuses the columns in front of a façade, so nothing grows between the camera and a door.
//! It only sees the chunk it is given, like every other placement pass.

use crate::biomes::field::WorldBiomes;
use crate::entities::blueprint::{EntityBlueprint, EntityCatalog, EntityLengthAxis};
use crate::entities::entity::{Entity, get_entity_footprint, get_entity_footprint_for};
use crate::entities::placement::{PlacementContext, find_placement};
use crate::grid::{CellMap, PoissonScatter, SpatialIndex, WorldCoord, WorldRect};
use crate::settlements::WorldSettlements;
use crate::terrain::{TerrainColumn, derive_seed, noise::lattice_at};

/// Label for the stream that rolls each building's patio.
const PATIO_LABEL: &str = "greens-patio";
/// Label for the stream that picks which species a plant is.
const SPECIES_LABEL: &str = "greens-species";
/// Label for the blue-noise scatter of the open green ground.
const SCATTER_LABEL: &str = "greens-scatter";

/// What the greenery pass reads besides the terrain.
#[derive(Clone, Copy)]
pub struct GreensContent<'a> {
    /// The settlements whose zones say where greenery grows and how thickly.
    pub settlements: &'a WorldSettlements,
    /// The biomes the species come from; without them a settlement grows no greenery.
    pub biomes: Option<&'a WorldBiomes>,
    /// The seed the rolls draw from.
    pub seed: u64,
}

/// The streams one pass rolls from, derived once.
struct Streams {
    patio: u64,
    species: u64,
}

/// The chunk's columns and the zone each one resolved to, looked up by cell.
struct ChunkCells<'a> {
    columns: &'a CellMap<TerrainColumn>,
    zones: &'a CellMap<Option<usize>>,
}

/// Where the buildings of this chunk stand, and how far every column is from one.
struct Standing {
    cells: Vec<WorldCoord>,
    blocked: Vec<WorldCoord>,
}

impl Standing {
    /// The distance from `at` to the nearest building cell, or `f64::INFINITY` with none.
    fn distance(&self, at: WorldCoord) -> f64 {
        self.cells
            .iter()
            .map(|cell| f64::from(at.x - cell.x).hypot(f64::from(at.y - cell.y)))
            .fold(f64::INFINITY, f64::min)
    }

    /// Whether `at` stands in the clearing kept in front of a façade. The clearing is sorted by
    /// column when it is built, so the answer is a binary search and not a sweep.
    fn is_blocked(&self, at: WorldCoord) -> bool {
        self.blocked
            .binary_search_by_key(&(at.x, at.y), |cell| (cell.x, cell.y))
            .is_ok()
    }
}

/// The buildings standing in this chunk, with the clearing in front of each one.
///
/// A column's screen height falls as `x + y` grows, so a building's façade looks down the
/// decreasing diagonal: the clearing is the columns at lower `x` and lower `y`.
fn standing_of(entities: &[Entity], catalog: &EntityCatalog, front: i32) -> Standing {
    let mut cells = Vec::new();
    let mut blocked = Vec::new();
    for entity in entities {
        let Some(blueprint) = blueprint_of(catalog, entity.type_()) else {
            continue;
        };
        if !blueprint.placement.road_access {
            continue;
        }
        for cell in get_entity_footprint_for(entity) {
            cells.push(cell);
            for step in 1..=front {
                blocked.push(WorldCoord {
                    x: cell.x - step,
                    y: cell.y,
                });
                blocked.push(WorldCoord {
                    x: cell.x,
                    y: cell.y - step,
                });
                blocked.push(WorldCoord {
                    x: cell.x - step,
                    y: cell.y - step,
                });
            }
        }
    }
    blocked.sort_by_key(|cell| (cell.x, cell.y));
    blocked.dedup();
    Standing { cells, blocked }
}

/// The blueprint of `id` in `catalog`.
fn blueprint_of<'a>(catalog: &'a EntityCatalog, id: &str) -> Option<&'a EntityBlueprint> {
    catalog.entities.iter().find(|blueprint| blueprint.id == id)
}

/// The species the biome beneath `at` grows there, weighted as the biome declares them.
fn species_at(
    biomes: &WorldBiomes,
    catalog: &EntityCatalog,
    streams: &Streams,
    at: WorldCoord,
) -> Option<String> {
    let biome = biomes.biome(at.x, at.y);
    let total: f64 = biome.trees.iter().map(|tree| tree.weight).sum();
    if total <= 0.0 {
        return None;
    }
    let mut roll = lattice_at(streams.species, i64::from(at.x), i64::from(at.y)) * total;
    for tree in &biome.trees {
        if roll < tree.weight {
            return blueprint_of(catalog, &tree.blueprint).map(|found| found.id.clone());
        }
        roll -= tree.weight;
    }
    biome
        .trees
        .last()
        .map(|tree| tree.blueprint.clone())
        .filter(|id| blueprint_of(catalog, id).is_some())
}

/// Plants one blueprint anchored on `at`, when the terrain and what already stands allow it.
fn plant(
    at: WorldCoord,
    blueprint: &EntityBlueprint,
    columns: &CellMap<TerrainColumn>,
    placed: &mut SpatialIndex<Entity>,
) -> Option<Entity> {
    let mut context = PlacementContext::new(columns, placed);
    let placement = find_placement(at, blueprint, &mut context, 0)?;
    let entity = Entity::new(at.x, at.y, blueprint, placement.elevation);
    let footprint = get_entity_footprint(at, blueprint.shape.length, blueprint.shape.axis);
    placed.insert(entity.clone(), &footprint).ok()?;
    Some(entity)
}

/// The columns a building's patio may use, from the cell behind it outwards.
fn patio_spots(entity: &Entity, blueprint: &EntityBlueprint, reach: i32) -> Vec<WorldCoord> {
    let along_x = blueprint.shape.axis == EntityLengthAxis::X;
    let length = blueprint.shape.length.max(1);
    let last_x = if along_x {
        entity.x() + length - 1
    } else {
        entity.x()
    };
    let last_y = if along_x {
        entity.y()
    } else {
        entity.y() + length - 1
    };
    let mut spots = Vec::new();
    for step in 1..=reach {
        for index in 0..length {
            let along = if along_x {
                entity.x() + index
            } else {
                entity.x()
            };
            let across = if along_x {
                entity.y()
            } else {
                entity.y() + index
            };
            spots.push(WorldCoord {
                x: if along_x { along } else { last_x + step },
                y: if along_x { last_y + step } else { across },
            });
        }
        spots.push(WorldCoord {
            x: last_x + step,
            y: last_y + step,
        });
    }
    spots
}

/// Plants the patio of every building of the chunk, back side first.
fn plant_patios(
    entities: &[Entity],
    catalog: &EntityCatalog,
    chunk: &ChunkCells<'_>,
    placed: &mut SpatialIndex<Entity>,
    content: GreensContent<'_>,
    streams: &Streams,
    grown: &mut Vec<Entity>,
) {
    let rules = content.settlements.catalog().greens.patio;
    let Some(biomes) = content.biomes else {
        return;
    };
    let mut buildings: Vec<&Entity> = entities
        .iter()
        .filter(|entity| {
            blueprint_of(catalog, entity.type_())
                .is_some_and(|blueprint| blueprint.placement.road_access)
        })
        .collect();
    buildings.sort_by_key(|entity| (entity.y(), entity.x()));
    for building in buildings {
        let Some(blueprint) = blueprint_of(catalog, building.type_()) else {
            continue;
        };
        let anchor = WorldCoord {
            x: building.x(),
            y: building.y(),
        };
        let roll = lattice_at(streams.patio, i64::from(anchor.x), i64::from(anchor.y));
        if roll >= rules.chance {
            continue;
        }
        let span = rules.max.saturating_sub(rules.min) + 1;
        let wanted = rules.min + (roll / rules.chance.max(f64::EPSILON) * f64::from(span)) as u32;
        let mut planted = 0;
        for spot in patio_spots(building, blueprint, rules.reach) {
            if planted >= wanted {
                break;
            }
            let zone = chunk.zones.get(spot).ok().flatten().copied().flatten();
            if content.settlements.greens_of(zone) <= 0.0 {
                continue;
            }
            let grove = lattice_at(streams.species, i64::from(spot.x) + 31, i64::from(spot.y))
                < rules.grove_chance;
            let species = if grove {
                grove_blueprint(catalog, spot, streams)
            } else {
                species_at(biomes, catalog, streams, spot)
            };
            let Some(species) = species else { continue };
            let Some(blueprint) = blueprint_of(catalog, &species) else {
                continue;
            };
            if let Some(entity) = plant(spot, blueprint, chunk.columns, placed) {
                grown.push(entity);
                planted += 1;
            }
        }
    }
}

/// The grove blueprint to try at `at`, on whichever axis the roll picks. Any blueprint of the
/// catalogue whose id starts with `grove_` and ends with the axis suffix is a candidate, so new
/// forest compositions the content ships join the pick.
fn grove_blueprint(catalog: &EntityCatalog, at: WorldCoord, streams: &Streams) -> Option<String> {
    let along_x = lattice_at(streams.species, i64::from(at.x), i64::from(at.y) + 57) < 0.5;
    let axes = if along_x {
        [true, false]
    } else {
        [false, true]
    };
    for axis in axes {
        let suffix = if axis { "_x" } else { "_y" };
        let mut candidates: Vec<&str> = catalog
            .entities
            .iter()
            .map(|blueprint| blueprint.id.as_str())
            .filter(|id| id.starts_with("grove_") && id.ends_with(suffix))
            .collect();
        candidates.sort_unstable();
        if candidates.is_empty() {
            continue;
        }
        let roll = lattice_at(streams.species, i64::from(at.x), i64::from(at.y) + 91);
        let index = (roll.max(0.0) * candidates.len() as f64) as usize;
        return Some(candidates[index.min(candidates.len() - 1)].to_owned());
    }
    None
}

/// Plants the greenery of every settlement zone covering `columns`, patios first and the
/// blue-noise scatter after, and returns what grew in planting order.
#[must_use = "the greenery is part of the chunk's entities"]
pub fn plant_greens(
    columns: &[TerrainColumn],
    catalog: &EntityCatalog,
    standing: &[Entity],
    placed: &mut SpatialIndex<Entity>,
    content: GreensContent<'_>,
) -> Vec<Entity> {
    let Some(biomes) = content.biomes else {
        return Vec::new();
    };
    let rules = content.settlements.catalog().greens;
    let mut columns_map = CellMap::new();
    for column in columns {
        let _ = columns_map.insert(column.coord, *column);
    }
    let streams = Streams {
        patio: derive_seed(content.seed, PATIO_LABEL),
        species: derive_seed(content.seed, SPECIES_LABEL),
    };
    let coords: Vec<WorldCoord> = columns.iter().map(|column| column.coord).collect();
    let zones = content.settlements.zones_over(&coords);
    let mut zone_of = CellMap::new();
    for (index, coord) in coords.iter().enumerate() {
        let _ = zone_of.insert(*coord, zones[index]);
    }
    let mut grown = Vec::new();
    plant_patios(
        standing,
        catalog,
        &ChunkCells {
            columns: &columns_map,
            zones: &zone_of,
        },
        placed,
        content,
        &streams,
        &mut grown,
    );

    let buildings = standing_of(standing, catalog, rules.front);
    let Some(area) = area_of(columns) else {
        return grown;
    };
    let scatter = PoissonScatter::new(
        content.seed,
        SCATTER_LABEL,
        rules.tight.floor().max(1.0) as i32,
        rules.spacing,
    );
    let radius_at = |at: WorldCoord| {
        let zone = zone_of.get(at).ok().flatten()?;
        if buildings.is_blocked(at) {
            return None;
        }
        content
            .settlements
            .greens_spacing(*zone, buildings.distance(at))
    };
    for at in scatter.samples_in(area, radius_at) {
        let Some(species) = species_at(biomes, catalog, &streams, at) else {
            continue;
        };
        let Some(blueprint) = blueprint_of(catalog, &species) else {
            continue;
        };
        if let Some(entity) = plant(at, blueprint, &columns_map, placed) {
            grown.push(entity);
        }
    }
    grown
}

/// The rectangle the columns span.
fn area_of(columns: &[TerrainColumn]) -> Option<WorldRect> {
    let first = columns.first()?.coord;
    Some(columns.iter().skip(1).fold(
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

#[cfg(test)]
#[path = "greenery.test.rs"]
mod tests;
