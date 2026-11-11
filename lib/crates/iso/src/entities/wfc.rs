//! Wave function collapse placement for the blueprints the biomes do not claim.
//!
//! The solver works per chunk and never looks at other chunks: every possibility an anchor may
//! take is checked against the terrain itself, so a chunk comes out the same alone as beside its
//! neighbours. The only global order that matters is catalog order, which the content owns.

use std::collections::{HashMap, HashSet};

use crate::entities::blueprint::{EntityBlueprint, EntityCatalog, EntityLengthAxis};
use crate::entities::entity::{Entity, get_entity_footprint};
use crate::grid::{CellMap, SpatialIndex, WorldCoord};
use crate::terrain::{TerrainColumn, TerrainMaterial};

/// The schema version of the wfc content this validator accepts.
pub const WFC_SCHEMA_VERSION: u32 = 2;

/// A namespaced tape for the rolls of one chunk.
const ROLL_LABEL: &str = "wfc-placement:roll";

/// Validation of the `content/wfc.json` catalogue.
#[derive(Clone, Debug, PartialEq)]
pub enum WfcError {
    /// The JSON itself could not be read.
    Json(String),
    /// The declared schema is not the one this engine understands.
    UnsupportedSchema {
        /// What the file declared.
        found: u32,
        /// What this engine accepts.
        expected: u32,
    },
    /// The weight of nothing was not a positive, finite number.
    InvalidEmptyWeight {
        /// What the file declared.
        found: f64,
    },
    /// A weight was not a positive, finite number.
    InvalidWeight {
        /// The blueprint the weight was declared for.
        blueprint: String,
    },
    /// A weight is declared for a blueprint the entity catalogue does not have.
    UnknownBlueprint {
        /// The missing blueprint.
        blueprint: String,
    },
    /// A blueprint no biome claims has no weight, so it would silently stop growing.
    MissingBlueprint {
        /// The missing blueprint.
        blueprint: String,
    },
    /// A `maxPerChunk` entry names neither a blueprint nor a family.
    UnknownCapKey {
        /// The key as written.
        key: String,
    },
    /// A `maxPerChunk` cap was not a positive, finite number.
    InvalidCap {
        /// The key the cap was declared under.
        key: String,
        /// What the file declared.
        found: f64,
    },
    /// An empty family can never produce an entity, so its cap could never fire.
    EmptyFamily {
        /// The family as written.
        family: String,
    },
    /// A blueprint joins two families, making its count ambiguous.
    BlueprintInTwoFamilies {
        /// The blueprint in both families.
        blueprint: String,
        /// The first family named in file order.
        first: String,
        /// The second family named in file order.
        second: String,
    },
    /// A family id that is also a blueprint id, making `maxPerChunk` lookups ambiguous.
    FamilyCollidesWithBlueprint {
        /// The offending id.
        family: String,
    },
}

impl std::fmt::Display for WfcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WfcError::Json(reason) => write!(f, "wfc JSON could not be parsed: {reason}"),
            WfcError::UnsupportedSchema { found, expected } => write!(
                f,
                "unsupported wfc schema version {found}, expected {expected}"
            ),
            WfcError::InvalidEmptyWeight { found } => {
                write!(
                    f,
                    "emptyWeight must be a positive, finite number, got {found}"
                )
            }
            WfcError::InvalidWeight { blueprint } => write!(
                f,
                "blueprint {blueprint} has an invalid weight: expected a positive, finite number"
            ),
            WfcError::UnknownBlueprint { blueprint } => {
                write!(
                    f,
                    "wfc references blueprint {blueprint}, which the entity catalogue does not have"
                )
            }
            WfcError::MissingBlueprint { blueprint } => write!(
                f,
                "blueprint {blueprint} is not claimed by any biome and has no wfc weight: it would never grow"
            ),
            WfcError::UnknownCapKey { key } => {
                write!(
                    f,
                    "maxPerChunk references {key}, which is neither a family nor a blueprint"
                )
            }
            WfcError::InvalidCap { key, found } => {
                write!(
                    f,
                    "maxPerChunk cap for {key} must be a positive, finite number, got {found}"
                )
            }
            WfcError::EmptyFamily { family } => {
                write!(
                    f,
                    "family {family} has no members and can never produce an entity"
                )
            }
            WfcError::BlueprintInTwoFamilies {
                blueprint,
                first,
                second,
            } => write!(
                f,
                "blueprint {blueprint} belongs to both family {first} and family {second}"
            ),
            WfcError::FamilyCollidesWithBlueprint { family } => {
                write!(f, "family id {family} collides with a blueprint id")
            }
        }
    }
}

impl std::error::Error for WfcError {}

#[derive(serde::Deserialize)]
struct RawWfcCatalog {
    #[serde(rename = "schemaVersion")]
    schema_version: u32,
    #[serde(rename = "emptyWeight")]
    empty_weight: f64,
    weights: HashMap<String, f64>,
    #[serde(default)]
    families: HashMap<String, Vec<String>>,
    #[serde(default, rename = "maxPerChunk")]
    max_per_chunk: HashMap<String, f64>,
}

/// The versioned wfc content catalogue: what may grow, and how often nothing does.
#[derive(Clone, Debug, PartialEq)]
pub struct WfcCatalog {
    /// The schema the file declared; always [`WFC_SCHEMA_VERSION`] after validation.
    pub schema_version: u32,
    /// How heavy "nothing grows here" is, relative to the weights of one blueprint.
    pub empty_weight: f64,
    /// The weight of each blueprint keyed by blueprint id.
    pub weights: HashMap<String, f64>,
    /// Named groups of blueprints; a cap keyed by a family id caps the whole group.
    pub families: HashMap<String, Vec<String>>,
    /// The most entities one chunk may grow of each key, keyed by family id or blueprint id.
    pub max_per_chunk: HashMap<String, f64>,
}

impl WfcCatalog {
    /// The weight of `blueprint`, or `0.0` when the content does not list it (it never grows).
    pub fn weight_of(&self, blueprint: &str) -> f64 {
        self.weights.get(blueprint).copied().unwrap_or(0.0)
    }
}

/// Parses and validates the wfc content against the entity catalogue it references, and against
/// the biomes (when given) to demand a weight for every blueprint no biome claims.
pub fn parse_wfc(
    json: &str,
    entities: &EntityCatalog,
    biomes: Option<&crate::biomes::catalog::BiomeCatalog>,
) -> Result<WfcCatalog, WfcError> {
    let raw: RawWfcCatalog =
        serde_json::from_str(json).map_err(|err| WfcError::Json(err.to_string()))?;
    if raw.schema_version != WFC_SCHEMA_VERSION {
        return Err(WfcError::UnsupportedSchema {
            found: raw.schema_version,
            expected: WFC_SCHEMA_VERSION,
        });
    }
    if !raw.empty_weight.is_finite() || raw.empty_weight <= 0.0 {
        return Err(WfcError::InvalidEmptyWeight {
            found: raw.empty_weight,
        });
    }
    let blueprint_ids: HashSet<&str> = entities
        .entities
        .iter()
        .map(|blueprint| blueprint.id.as_str())
        .collect();
    for (blueprint, weight) in &raw.weights {
        if !weight.is_finite() || *weight <= 0.0 {
            return Err(WfcError::InvalidWeight {
                blueprint: blueprint.clone(),
            });
        }
        if !blueprint_ids.contains(blueprint.as_str()) {
            return Err(WfcError::UnknownBlueprint {
                blueprint: blueprint.clone(),
            });
        }
    }
    if let Some(biomes) = biomes {
        let claimed: HashSet<&str> = biomes
            .biomes
            .iter()
            .flat_map(|biome| biome.trees.iter().map(|tree| tree.blueprint.as_str()))
            .collect();
        for blueprint in &entities.entities {
            if claimed.contains(blueprint.id.as_str()) {
                continue;
            }
            if !raw.weights.contains_key(&blueprint.id) {
                return Err(WfcError::MissingBlueprint {
                    blueprint: blueprint.id.clone(),
                });
            }
        }
    }
    let mut family_of: HashMap<&str, &str> = HashMap::new();
    let mut families: Vec<_> = raw.families.iter().collect();
    families.sort_by_key(|(family, _)| *family);
    for (family, members) in families {
        if family.is_empty() {
            return Err(WfcError::EmptyFamily {
                family: family.clone(),
            });
        }
        if blueprint_ids.contains(family.as_str()) {
            return Err(WfcError::FamilyCollidesWithBlueprint {
                family: family.clone(),
            });
        }
        if members.is_empty() {
            return Err(WfcError::EmptyFamily {
                family: family.clone(),
            });
        }
        for member in members {
            if !blueprint_ids.contains(member.as_str()) {
                return Err(WfcError::UnknownBlueprint {
                    blueprint: member.clone(),
                });
            }
            if let Some(first) = family_of.insert(member.as_str(), family.as_str()) {
                return Err(WfcError::BlueprintInTwoFamilies {
                    blueprint: member.clone(),
                    first: first.to_owned(),
                    second: family.clone(),
                });
            }
        }
    }
    for (key, cap) in &raw.max_per_chunk {
        if !blueprint_ids.contains(key.as_str()) && !raw.families.contains_key(key) {
            return Err(WfcError::UnknownCapKey { key: key.clone() });
        }
        if !cap.is_finite() || *cap < 1.0 {
            return Err(WfcError::InvalidCap {
                key: key.clone(),
                found: *cap,
            });
        }
    }
    Ok(WfcCatalog {
        schema_version: raw.schema_version,
        empty_weight: raw.empty_weight,
        weights: raw.weights,
        families: raw.families,
        max_per_chunk: raw.max_per_chunk,
    })
}

/// Which blueprints the biomes already claim, in catalog order.
pub fn claimed_by_biomes(
    entities: &EntityCatalog,
    biomes: Option<&crate::biomes::field::WorldBiomes>,
) -> Vec<bool> {
    entities
        .entities
        .iter()
        .map(|blueprint| {
            biomes
                .map(|world| !world.species_of(&blueprint.id).is_empty())
                .unwrap_or(false)
        })
        .collect()
}

/// Every column of the blueprint's footprint anchored on `at`, or `None` when it runs off the
/// chunk's columns or hits a surface it does not admit.
fn footprint_cells(
    columns: &CellMap<TerrainColumn>,
    at: WorldCoord,
    blueprint: &EntityBlueprint,
) -> Option<Vec<WorldCoord>> {
    let length = blueprint.shape.length;
    let along_x = blueprint.shape.axis == EntityLengthAxis::X;
    let surfaces = &blueprint.placement.surfaces;
    let mut cells = Vec::with_capacity(length as usize);
    for index in 0..length {
        let x = if along_x { at.x + index } else { at.x };
        let y = if along_x { at.y } else { at.y + index };
        let column = columns.get(WorldCoord { x, y }).ok().flatten()?;
        let required = surfaces.get(index as usize).copied().unwrap_or(surfaces[0]);
        if column.surface != required {
            return None;
        }
        cells.push(WorldCoord { x, y });
    }
    Some(cells)
}

/// The elevation of a footprint: uniform across its dry cells, `0` when it only spans water.
fn footprint_elevation(columns: &CellMap<TerrainColumn>, cells: &[WorldCoord]) -> Option<i32> {
    let mut elevation: Option<i32> = None;
    for cell in cells {
        let column = columns.get(*cell).ok().flatten()?;
        if column.surface == TerrainMaterial::Water {
            continue;
        }
        elevation = Some(match elevation {
            None => column.elevation,
            Some(prev) if prev == column.elevation => prev,
            _ => return None,
        });
    }
    Some(elevation.unwrap_or(0))
}

struct Caps {
    limits: Vec<f64>,
    members: Vec<Vec<usize>>,
    of_bp: Vec<Vec<usize>>,
}

/// Builds the cap table for `wfc` against `catalog`, in sorted key order for determinism.
fn build_caps(catalog: &EntityCatalog, wfc: &WfcCatalog) -> Caps {
    let mut entries: Vec<(&String, &f64)> = wfc.max_per_chunk.iter().collect();
    entries.sort_by(|a, b| a.0.cmp(b.0));
    let mut limits = Vec::with_capacity(entries.len());
    let mut members: Vec<Vec<usize>> = Vec::with_capacity(entries.len());
    let mut of_bp = vec![Vec::new(); catalog.entities.len()];
    for (key, cap) in entries {
        let resolved: Vec<usize> = match wfc.families.get(key) {
            Some(names) => names
                .iter()
                .map(|name| {
                    catalog
                        .entities
                        .iter()
                        .position(|blueprint| &blueprint.id == name)
                        .expect("family members are validated blueprints")
                })
                .collect(),
            None => vec![
                catalog
                    .entities
                    .iter()
                    .position(|blueprint| &blueprint.id == key)
                    .expect("cap keys are validated blueprints or families"),
            ],
        };
        let index = limits.len();
        limits.push(*cap);
        members.push(resolved);
        for &bp in &members[index] {
            of_bp[bp].push(index);
        }
    }
    Caps {
        limits,
        members,
        of_bp,
    }
}

/// Removes `members` from every undecided cell once a cap is exhausted.
fn enforce_cap(remaining: &mut [Vec<usize>], absorbed: &[bool], members: &[usize]) {
    for (cell, possibilities) in remaining.iter_mut().enumerate() {
        if absorbed[cell] || possibilities.is_empty() {
            continue;
        }
        possibilities.retain(|blueprint| !members.contains(blueprint));
    }
}

fn near(point: WorldCoord, cells: &HashSet<WorldCoord>, gap: i32) -> bool {
    for dx in -gap..=gap {
        for dy in -gap..=gap {
            if cells.contains(&WorldCoord {
                x: point.x + dx,
                y: point.y + dy,
            }) {
                return true;
            }
        }
    }
    false
}

/// Removes from every undecided cell the possibilities whose footprint touches `claimed`, or that
/// sit within the same-type gap of a claimed blueprint.
fn eliminate(
    columns: &[TerrainColumn],
    ci: &CellMap<TerrainColumn>,
    catalog: &EntityCatalog,
    remaining: &mut [Vec<usize>],
    absorbed: &[bool],
    claimed: &HashSet<WorldCoord>,
    blueprint: usize,
) {
    for (cell, possibilities) in remaining.iter_mut().enumerate() {
        if absorbed[cell] || possibilities.is_empty() {
            continue;
        }
        let anchor = columns[cell].coord;
        let mut kept = Vec::with_capacity(possibilities.len());
        for &bp in possibilities.iter() {
            let blueprint_ref = &catalog.entities[bp];
            let Some(cells) = footprint_cells(ci, anchor, blueprint_ref) else {
                continue;
            };
            let overlaps = cells.iter().any(|coord| claimed.contains(coord));
            let too_close = bp == blueprint && cells.iter().any(|coord| near(*coord, claimed, 1));
            if !overlaps && !too_close {
                kept.push(bp);
            }
        }
        possibilities.clear();
        possibilities.extend(kept);
    }
}

/// The undecided cell with the fewest possibilities left, or `None` when everything is decided.
fn select_cell(remaining: &[Vec<usize>], absorbed: &[bool], decided: &[bool]) -> Option<usize> {
    let mut best: Option<usize> = None;
    for (cell, possibilities) in remaining.iter().enumerate() {
        if absorbed[cell] || decided[cell] || possibilities.is_empty() {
            continue;
        }
        match best {
            None => best = Some(cell),
            Some(current) if possibilities.len() < remaining[current].len() => best = Some(cell),
            _ => {}
        }
    }
    best
}

/// Deterministically rolls one value for column `(x, y)` of the world of `seed`.
fn roll(seed: u64, x: i32, y: i32) -> f64 {
    crate::terrain::noise::lattice_at(
        crate::terrain::derive_seed(seed, ROLL_LABEL),
        i64::from(x),
        i64::from(y),
    )
}

/// Solves one chunk and returns the entities it grows, in column order.
pub fn solve_chunk(
    columns: &[TerrainColumn],
    catalog: &EntityCatalog,
    wfc: &WfcCatalog,
    claimed: &[bool],
    placed: &mut SpatialIndex<Entity>,
    seed: u64,
) -> Vec<Entity> {
    let n = columns.len();
    let caps = build_caps(catalog, wfc);
    let mut counts = vec![0.0; caps.limits.len()];
    let mut index_of = HashMap::with_capacity(n);
    for (index, column) in columns.iter().enumerate() {
        index_of.insert(column.coord, index);
    }
    let mut columns_map = CellMap::new();
    for column in columns {
        let _ = columns_map.insert(column.coord, *column);
    }

    let blueprints = &catalog.entities;
    let mut remaining: Vec<Vec<usize>> = vec![Vec::new(); n];
    for (bp, blueprint) in blueprints.iter().enumerate() {
        if claimed.get(bp).copied().unwrap_or(false) {
            continue;
        }
        if wfc.weight_of(&blueprint.id) <= 0.0 {
            continue;
        }
        for (cell, column) in columns.iter().enumerate() {
            let anchor = column.coord;
            let Some(cells) = footprint_cells(&columns_map, anchor, blueprint) else {
                continue;
            };
            if cells.iter().any(|&coord| placed.is_occupied(coord)) {
                continue;
            }
            if footprint_elevation(&columns_map, &cells).is_none() {
                continue;
            }
            remaining[cell].push(bp);
        }
    }

    let mut absorbed = vec![false; n];
    let mut decided = vec![false; n];
    let mut grown: Vec<Option<usize>> = vec![None; n];

    while let Some(cell) = select_cell(&remaining, &absorbed, &decided) {
        let column = columns[cell].coord;
        let total: f64 = remaining[cell]
            .iter()
            .map(|&bp| wfc.weight_of(&blueprints[bp].id))
            .sum::<f64>()
            + wfc.empty_weight;
        let mut roll_value = roll(seed, column.x, column.y) * total;
        let mut pick: Option<usize> = None;
        for &bp in &remaining[cell] {
            let weight = wfc.weight_of(&blueprints[bp].id);
            if roll_value < weight {
                pick = Some(bp);
                break;
            }
            roll_value -= weight;
        }
        match pick {
            None => {
                decided[cell] = true;
            }
            Some(bp) => {
                decided[cell] = true;
                grown[cell] = Some(bp);
                for &cap in &caps.of_bp[bp] {
                    counts[cap] += 1.0;
                    if counts[cap] >= caps.limits[cap] {
                        enforce_cap(&mut remaining, &absorbed, &caps.members[cap]);
                    }
                }
                let blueprint_ref = &blueprints[bp];
                let cells = footprint_cells(&columns_map, column, blueprint_ref)
                    .unwrap_or_else(|| vec![column]);
                let mut claimed_coords: HashSet<WorldCoord> = HashSet::with_capacity(cells.len());
                for &coord in &cells {
                    claimed_coords.insert(coord);
                    if let Some(&index) = index_of.get(&coord) {
                        absorbed[index] = true;
                    }
                }
                eliminate(
                    columns,
                    &columns_map,
                    catalog,
                    &mut remaining,
                    &absorbed,
                    &claimed_coords,
                    bp,
                );
            }
        }
    }

    let mut entities = Vec::new();
    for (cell, blueprint) in grown.iter().enumerate() {
        let Some(bp) = blueprint else { continue };
        let blueprint = &blueprints[*bp];
        let anchor = columns[cell].coord;
        let Some(cells) = footprint_cells(&columns_map, anchor, blueprint) else {
            continue;
        };
        let Some(level) = footprint_elevation(&columns_map, &cells) else {
            continue;
        };
        let entity = Entity::new(anchor.x, anchor.y, blueprint, level);
        let footprint = get_entity_footprint(anchor, blueprint.shape.length, blueprint.shape.axis);
        let _ = placed.insert(entity.clone(), &footprint);
        entities.push(entity);
    }
    entities
}

#[cfg(test)]
#[path = "wfc.test.rs"]
mod tests;
