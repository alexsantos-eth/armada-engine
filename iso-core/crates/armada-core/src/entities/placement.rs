//! Deterministic placement of entities over materialized terrain columns.
//!
//! Mirrors `createEntitiesFromConfig()` in `engine/entities/entities.ts`, simplified for the
//! Rust port: the V2 catalog carries no spawn chances, formations or patch fields, so placement
//! is a pure validity pass over every column. Density, biomes, slopes and neighbourhood rules
//! are designed in Rust once the new terrain generator exists; this module supplies the
//! validity rules (surface, elevation, footprint, gap) and a deterministic placer that fills
//! every eligible column.

use crate::entities::blueprint::{
    EntityBlueprintV2, EntityCatalogV2, EntityLengthAxis,
};
use crate::entities::entity::{get_entity_footprint, Entity};
use std::collections::HashMap;

use crate::grid::{CellMap, SpatialIndex, WorldCoord};
use crate::terrain::{TerrainColumn, TerrainMaterial};

/// Result of placing every eligible definition over the given columns.
pub struct PlacementResult {
    /// Placed entities, in definition order then column order.
    pub entities: Vec<Entity>,
    /// Spatial index over every placed entity's whole footprint.
    pub index: SpatialIndex<Entity>,
}

/// Minimum free blocks between instances of the same entity when the catalog does not say
/// otherwise. Zero means instances may touch.
const DEFAULT_GAP: i32 = 1;

/// Columns per instance of one blueprint, on average.
///
/// Without a density rule placement fills every column a blueprint accepts, which is what it
/// means to be a pure validity pass: a chunk of 1024 columns came back carrying 514 entities
/// and the world was a solid carpet of houses with the player buried under it. The V2 catalog
/// carries no spawn chance, so until it does, one rate applies to every blueprint. It is a
/// placeholder, not a design: biomes, clearings and forest patches are what should decide this.
const DEFAULT_DENSITY: u64 = 400;

/// Deterministic roll for one blueprint at one column, used as its spawn chance.
///
/// This is FNV-1a over the blueprint id and the column, finished with a bit mixer, rather than
/// the standard library's hasher: `DefaultHasher` is explicitly not stable between Rust
/// releases, and a world has to generate the same way on every build and every machine.
fn placement_roll(id: &str, x: i32, y: i32) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
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
    // splitmix64's finalizer: FNV leaves the low bits poorly mixed, and the low bits are
    // exactly what a modulo looks at.
    hash ^= hash >> 30;
    hash = hash.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    hash ^= hash >> 27;
    hash = hash.wrapping_mul(0x94d0_49bb_1331_11eb);
    hash ^ (hash >> 31)
}

/// Lookups shared by every placement check of one placement pass.
pub struct PlacementContext<'a> {
    columns: &'a CellMap<TerrainColumn>,
    placed: &'a mut SpatialIndex<Entity>,
}

impl<'a> PlacementContext<'a> {
    pub fn new(columns: &'a CellMap<TerrainColumn>, placed: &'a mut SpatialIndex<Entity>) -> Self {
        Self { columns, placed }
    }

    pub fn column(&self, x: i32, y: i32) -> Option<&TerrainColumn> {
        self.columns
            .get(WorldCoord { x, y })
            .ok()
            .flatten()
    }

    pub fn is_taken(&self, x: i32, y: i32) -> bool {
        self.placed.is_occupied(WorldCoord { x, y })
    }
}

/// A validated position for one entity instance.
pub struct Placement {
    pub anchor: WorldCoord,
    pub footprint: Vec<WorldCoord>,
    pub elevation: i32,
}

/// How thickly the world is populated, and how close instances of one type may stand.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlacementRules {
    /// Free blocks required between instances of the same type (Chebyshev, diagonals included).
    pub gap: i32,
    /// Columns per instance of one blueprint, on average. One always places.
    pub density: u64,
}

impl Default for PlacementRules {
    fn default() -> Self {
        Self {
            gap: DEFAULT_GAP,
            density: DEFAULT_DENSITY,
        }
    }
}

/// Places entities over `columns` with the default rules.
pub fn place_entities(columns: &[TerrainColumn], catalog: &EntityCatalogV2) -> PlacementResult {
    place_entities_with(columns, catalog, PlacementRules::default())
}

/// Places entities over `columns`, one instance per valid anchor column the density lets
/// through.
///
/// Rules:
/// * the anchor's surface must match the definition's first footprint surface;
/// * every footprint cell must exist, match its required surface, be flat (one shared
///   elevation) and be free of other entities;
/// * instances of the same type respect `gap` (Chebyshev, diagonals included);
/// * a column only anchors one in `density` of the instances it would otherwise accept.
///
/// Placement is deterministic: definitions are visited in catalog order and columns in slice
/// order, the density roll depends only on the blueprint and the column, so the same input
/// always yields the same world.
pub fn place_entities_with(
    columns: &[TerrainColumn],
    catalog: &EntityCatalogV2,
    rules: PlacementRules,
) -> PlacementResult {
    let mut columns_map = CellMap::new();
    for column in columns {
        let _ = columns_map.insert(column.coord, *column);
    }
    let mut placed = SpatialIndex::new();
    let mut entities = Vec::new();

    // A blueprint can only be anchored on a column whose surface equals its first required
    // surface, and `find_placement` rejects every other column on its first check. Grouping the
    // columns by surface once lets each blueprint walk only the columns that can possibly accept
    // it, instead of all 1024: with this catalog that is 31 x 1024 = 31 744 validity checks per
    // chunk, which cost ~12 ms — a dropped frame every time streaming discovered a chunk.
    //
    // Columns keep their slice order inside each group, and blueprints are still visited in
    // catalog order, so the entities placed and the order they are placed in do not change.
    let mut by_surface: HashMap<TerrainMaterial, Vec<&TerrainColumn>> = HashMap::new();
    for column in columns {
        by_surface.entry(column.surface).or_default().push(column);
    }
    let empty: Vec<&TerrainColumn> = Vec::new();

    for blueprint in &catalog.entities {
        // A blueprint with no required surfaces cannot be anchored anywhere; `validate_catalog`
        // rejects one, and skipping it here keeps this function safe on its own.
        let Some(anchor_surface) = blueprint.placement.surfaces.first() else {
            continue;
        };
        let anchors = by_surface.get(anchor_surface).unwrap_or(&empty);
        for column in anchors {
            let anchor = column.coord;
            // The density roll comes first: it rejects most columns, and it costs a few
            // multiplications where the validity pass costs a footprint walk and an index
            // lookup per cell.
            if rules.density > 1
                && !placement_roll(&blueprint.id, anchor.x, anchor.y)
                    .is_multiple_of(rules.density)
            {
                continue;
            }
            let mut context = PlacementContext::new(&columns_map, &mut placed);
            let Some(placement) = find_placement(anchor, blueprint, &mut context, rules.gap)
            else {
                continue;
            };
            let entity = Entity::new(
                placement.anchor.x,
                placement.anchor.y,
                blueprint,
                placement.elevation,
            );
            let footprint = get_entity_footprint(
                placement.anchor,
                placement.footprint.len() as i32,
                blueprint.shape.axis,
            );
            // An entity that could not be indexed must not be placed either: `is_taken` reads
            // the index, so keeping it in `entities` while the index does not know about it
            // would let later entities overlap it, and the overlap rules would quietly stop
            // holding for the rest of the pass.
            if placed.insert(entity.clone(), &footprint).is_err() {
                continue;
            }
            entities.push(entity);
        }
    }

    // `placed` already indexes every entity over the same footprints `index_entities` would use,
    // so returning it avoids cloning all 376 entities into a second, identical index.
    PlacementResult {
        entities,
        index: placed,
    }
}

/// Validates one instance of `blueprint` anchored on `column`.
fn find_placement(
    anchor: WorldCoord,
    blueprint: &EntityBlueprintV2,
    context: &mut PlacementContext,
    gap: i32,
) -> Option<Placement> {
    let length = blueprint.shape.length as usize;
    let along_x = blueprint.shape.axis == EntityLengthAxis::X;
    let surfaces = &blueprint.placement.surfaces;

    let anchor_cell = context.column(anchor.x, anchor.y)?;
    if anchor_cell.surface != surfaces[0] {
        return None;
    }
    if context.is_taken(anchor.x, anchor.y) {
        return None;
    }

    // A footprint mixing water and land (e.g. a pier) is allowed to stand on land while
    // its water cells are exempt from the flat-elevation rule.
    let water = surfaces.contains(&TerrainMaterial::Water);
    let land = surfaces.iter().any(|s| *s != TerrainMaterial::Water);
    let reaches_over_water = water && land;

    let mut elevation: Option<i32> = None;
    for index in 0..length {
        let x = if along_x {
            anchor.x + index as i32
        } else {
            anchor.x
        };
        let y = if along_x {
            anchor.y
        } else {
            anchor.y + index as i32
        };
        let cell = context.column(x, y)?;
        let required = surfaces.get(index).copied().unwrap_or(surfaces[0]);
        if cell.surface != required {
            return None;
        }
        if context.is_taken(x, y) {
            return None;
        }
        if reaches_over_water && required == TerrainMaterial::Water {
            continue;
        }
        let e = cell.elevation;
        elevation = match elevation {
            None => Some(e),
            Some(prev) if prev == e => Some(e),
            _ => return None,
        };
    }

    // Gap: no other instance of the same type within `gap` columns (Chebyshev).
    if gap > 0 {
        let last_x = if along_x {
            anchor.x + length as i32 - 1
        } else {
            anchor.x
        };
        let last_y = if along_x {
            anchor.y
        } else {
            anchor.y + length as i32 - 1
        };
        let rect = crate::grid::WorldRect {
            min_x: anchor.x - gap,
            min_y: anchor.y - gap,
            max_x: last_x + gap,
            max_y: last_y + gap,
        };
        if context
            .placed
            .any_in_rect(rect, |e| e.type_() == blueprint.id)
        {
            return None;
        }
    }

    Some(Placement {
        anchor,
        footprint: get_entity_footprint(anchor, length as i32, blueprint.shape.axis),
        elevation: elevation.unwrap_or(0),
    })
}

#[cfg(test)]
#[path = "placement.test.rs"]
mod tests;
