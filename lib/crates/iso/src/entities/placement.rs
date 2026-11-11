//! Deterministic placement of entities over materialized terrain columns.

use crate::entities::blueprint::{EntityBlueprint, EntityCatalog, EntityLengthAxis};
use crate::entities::entity::{Entity, get_entity_footprint};
use std::collections::HashMap;

use crate::biomes::field::WorldBiomes;
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
const DEFAULT_GAP: i32 = 1;

/// Columns per instance of one blueprint, on average.
const DEFAULT_DENSITY: u64 = 400;

/// Deterministic roll for one blueprint at one column, used as its spawn chance.
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
        self.columns.get(WorldCoord { x, y }).ok().flatten()
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
pub fn place_entities(columns: &[TerrainColumn], catalog: &EntityCatalog) -> PlacementResult {
    place_entities_with_biomes(columns, catalog, PlacementRules::default(), None)
}

/// Places entities over `columns`, one instance per valid anchor column the density lets
pub fn place_entities_with(
    columns: &[TerrainColumn],
    catalog: &EntityCatalog,
    rules: PlacementRules,
) -> PlacementResult {
    place_entities_with_biomes(columns, catalog, rules, None)
}

/// One-off content for the placement pass: the world's biomes, the wfc catalogue and the seed.
#[derive(Clone, Copy)]
pub struct PlacementContent<'a> {
    /// The biomes tree species grow in; biome-claimed blueprints never enter the wfc pass.
    pub biomes: Option<&'a WorldBiomes>,
    /// The wfc catalogue for everything else; `None` falls back to the legacy density roll.
    pub wfc: Option<&'a crate::entities::wfc::WfcCatalog>,
    /// The seed the solver's rolls draw from.
    pub seed: u64,
}

/// Places entities over `columns`, confining the species the biomes claim to their own regions.
///
/// A blueprint no biome lists keeps the density roll of `rules`; a blueprint some biome lists
/// only grows where one of those biomes covers the column and its grove picker yields that
/// species, so a biome's groves are monospecific while mixed edges between biomes can still
/// touch. `None` restores the biome-agnostic behaviour of [`place_entities_with`].
pub fn place_entities_with_biomes(
    columns: &[TerrainColumn],
    catalog: &EntityCatalog,
    rules: PlacementRules,
    biomes: Option<&WorldBiomes>,
) -> PlacementResult {
    place_entities_with_content(
        columns,
        catalog,
        rules,
        PlacementContent {
            biomes,
            wfc: None,
            seed: crate::terrain::WORLD_SEED,
        },
    )
}

/// Places entities over `columns`: the biome pass first, then the wfc solver for the rest.
///
/// The biome pass behaves exactly as [`place_entities_with_biomes`]; with a wfc catalogue,
/// every blueprint no biome claims grows out of the solver instead of the density roll. Both
/// passes share one spatial index, so wfc entities never overlap biome trees or each other.
#[must_use = "place entities before discovering more chunks"]
pub fn place_entities_with_content(
    columns: &[TerrainColumn],
    catalog: &EntityCatalog,
    rules: PlacementRules,
    content: PlacementContent<'_>,
) -> PlacementResult {
    let biomes = content.biomes;
    let mut columns_map = CellMap::new();
    for column in columns {
        let _ = columns_map.insert(column.coord, *column);
    }
    let mut placed = SpatialIndex::new();
    let mut entities = Vec::new();

    let mut by_surface: HashMap<TerrainMaterial, Vec<usize>> = HashMap::new();
    for (index, column) in columns.iter().enumerate() {
        by_surface.entry(column.surface).or_default().push(index);
    }
    let empty: Vec<usize> = Vec::new();

    // The biome of a column and the species its groves pick are the same for every blueprint in
    // this pass; sampling them once per column keeps the pass from paying them per candidate.
    let world = biomes;
    let mut biome_of = Vec::with_capacity(columns.len());
    let mut formation_of = Vec::with_capacity(columns.len());
    for column in columns {
        match world {
            Some(world) => {
                biome_of.push(world.biome_index(column.coord.x, column.coord.y));
                formation_of.push(world.formation(column.coord.x, column.coord.y));
            }
            None => {
                biome_of.push(0);
                formation_of.push(None);
            }
        }
    }

    for blueprint in &catalog.entities {
        let gated = biomes.map(|world| world.species_of(&blueprint.id));
        let biome_claimed = gated
            .as_ref()
            .is_some_and(|memberships| !memberships.is_empty());
        if content.wfc.is_some() && !biome_claimed {
            continue;
        }
        let Some(anchor_surface) = blueprint.placement.surfaces.first() else {
            continue;
        };
        let anchors = by_surface.get(anchor_surface).unwrap_or(&empty);
        for &index in anchors {
            let column = &columns[index];
            let anchor = column.coord;
            match &gated {
                Some(memberships) if !memberships.is_empty() => {
                    let biome = biome_of[index];
                    let allowed = memberships
                        .iter()
                        .find(|(biome_of, _)| *biome_of == biome)
                        .is_some_and(|&(_, species)| formation_of[index] == Some(species));
                    if !allowed {
                        continue;
                    }
                }
                _ => {
                    if rules.density > 1
                        && !placement_roll(&blueprint.id, anchor.x, anchor.y)
                            .is_multiple_of(rules.density)
                    {
                        continue;
                    }
                }
            }
            let mut context = PlacementContext::new(&columns_map, &mut placed);
            let Some(placement) = find_placement(anchor, blueprint, &mut context, rules.gap) else {
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
            if placed.insert(entity.clone(), &footprint).is_err() {
                continue;
            }
            entities.push(entity);
        }
    }

    if let Some(wfc) = content.wfc {
        let claimed = crate::entities::wfc::claimed_by_biomes(catalog, biomes);
        let mut grown = crate::entities::wfc::solve_chunk(
            columns,
            catalog,
            wfc,
            &claimed,
            &mut placed,
            content.seed,
        );
        entities.append(&mut grown);
    }

    PlacementResult {
        entities,
        index: placed,
    }
}

/// Validates one instance of `blueprint` anchored on `column`.
fn find_placement(
    anchor: WorldCoord,
    blueprint: &EntityBlueprint,
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
