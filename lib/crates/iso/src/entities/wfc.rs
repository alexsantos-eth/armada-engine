//! Wave function collapse placement for the blueprints the biomes do not claim.
//!
//! The solver works per chunk and never looks at other chunks: every possibility an anchor may
//! take is checked against the terrain itself, so a chunk comes out the same alone as beside its
//! neighbours. The only global order that matters is catalog order, which the content owns.

use std::collections::{HashMap, HashSet};

use crate::entities::blueprint::{EntityBlueprint, EntityCatalog, EntityLengthAxis};
use crate::entities::entity::{Entity, get_entity_footprint};
use crate::grid::{SpatialIndex, WorldCoord};
use crate::terrain::{TerrainColumn, TerrainMaterial};

/// The schema version of the wfc content this validator accepts.
pub const WFC_SCHEMA_VERSION: u32 = 2;

/// A namespaced tape for the rolls of one chunk.
const ROLL_LABEL: &str = "wfc-placement:roll";

/// Validation of the `content/json/wfc.json` catalogue.
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

/// A direct index into a chunk's columns: a bounds-checked grid of slots, no hashing. The
/// placement hot paths resolve cells through this, which a hashed map makes expensive.
struct Columns<'a> {
    columns: &'a [TerrainColumn],
    min_x: i32,
    min_y: i32,
    stride_x: usize,
    stride_y: usize,
    grid: Vec<Option<usize>>,
}

impl<'a> Columns<'a> {
    fn of(columns: &'a [TerrainColumn]) -> Self {
        let mut min_x = i32::MAX;
        let mut min_y = i32::MAX;
        let mut max_x = i32::MIN;
        let mut max_y = i32::MIN;
        for column in columns {
            min_x = min_x.min(column.coord.x);
            min_y = min_y.min(column.coord.y);
            max_x = max_x.max(column.coord.x);
            max_y = max_y.max(column.coord.y);
        }
        let stride_x = (max_x - min_x + 1).max(1) as usize;
        let stride_y = (max_y - min_y + 1).max(1) as usize;
        let mut grid = vec![None; stride_x * stride_y];
        for (index, column) in columns.iter().enumerate() {
            let dx = (column.coord.x - min_x) as usize;
            let dy = (column.coord.y - min_y) as usize;
            grid[dx * stride_y + dy] = Some(index);
        }
        Self {
            columns,
            min_x,
            min_y,
            stride_x,
            stride_y,
            grid,
        }
    }

    fn index(&self, x: i32, y: i32) -> Option<usize> {
        let dx = x - self.min_x;
        let dy = y - self.min_y;
        if dx < 0 || dy < 0 || dx as usize >= self.stride_x || dy as usize >= self.stride_y {
            return None;
        }
        self.grid[dx as usize * self.stride_y + dy as usize]
    }

    fn column(&self, x: i32, y: i32) -> Option<&'a TerrainColumn> {
        self.index(x, y).map(|index| &self.columns[index])
    }
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
/// chunk's columns or hits a surface it does not admit. Writes into `out` (cleared first);
/// the scratch-buffer variant so the per-cell build does not allocate one `Vec` per footprint.
fn footprint_cells_into(
    columns: &Columns<'_>,
    at: WorldCoord,
    blueprint: &EntityBlueprint,
    out: &mut Vec<WorldCoord>,
) -> bool {
    out.clear();
    let length = blueprint.shape.length;
    let along_x = blueprint.shape.axis == EntityLengthAxis::X;
    let surfaces = &blueprint.placement.surfaces;
    for index in 0..length {
        let x = if along_x { at.x + index } else { at.x };
        let y = if along_x { at.y } else { at.y + index };
        let Some(column) = columns.column(x, y) else {
            return false;
        };
        let required = surfaces.get(index as usize).copied().unwrap_or(surfaces[0]);
        if column.surface != required {
            return false;
        }
        out.push(WorldCoord { x, y });
    }
    true
}

/// Every column of the blueprint's footprint anchored on `at`, or `None` when it runs off the
/// chunk's columns or hits a surface it does not admit.
fn footprint_cells(
    columns: &Columns<'_>,
    at: WorldCoord,
    blueprint: &EntityBlueprint,
) -> Option<Vec<WorldCoord>> {
    let mut cells = Vec::with_capacity(blueprint.shape.length as usize);
    footprint_cells_into(columns, at, blueprint, &mut cells).then_some(cells)
}

/// The elevation of a footprint: uniform across its dry cells, `0` when it only spans water.
fn footprint_elevation(columns: &Columns<'_>, cells: &[WorldCoord]) -> Option<i32> {
    let mut elevation: Option<i32> = None;
    for cell in cells {
        let column = columns.column(cell.x, cell.y)?;
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

/// Whether placing `blueprint` anchored on `anchor` overlaps one of the `claimed` cells, or —
/// when `candidate` is the blueprint that was placed — lands within the same-type gap of one.
/// A candidate's footprint is immutable for a fixed anchor: it was valid when the cell joined
/// the possibilities, and surfaces and bounds never change afterwards.
fn footprint_hits(
    anchor: WorldCoord,
    blueprint: &EntityBlueprint,
    claimed: &HashSet<WorldCoord>,
    candidate: usize,
    placed: usize,
) -> bool {
    let along_x = blueprint.shape.axis == EntityLengthAxis::X;
    for index in 0..blueprint.shape.length {
        let cell = if along_x {
            WorldCoord {
                x: anchor.x + index,
                y: anchor.y,
            }
        } else {
            WorldCoord {
                x: anchor.x,
                y: anchor.y + index,
            }
        };
        if claimed.contains(&cell) {
            return true;
        }
        if candidate == placed && near(cell, claimed, 1) {
            return true;
        }
    }
    false
}

/// Removes from every undecided cell the possibilities whose footprint touches `claimed`, or that
/// sit within the same-type gap of a claimed blueprint. Only anchors within the longest footprint
/// plus the same-type gap of the claim's box can interact with it, so cells beyond it are skipped.
fn eliminate(
    columns: &[TerrainColumn],
    catalog: &EntityCatalog,
    remaining: &mut [Vec<usize>],
    absorbed: &[bool],
    claimed: &HashSet<WorldCoord>,
    blueprint: usize,
) {
    let reach = catalog
        .entities
        .iter()
        .map(|blueprint| blueprint.shape.length)
        .max()
        .unwrap_or(1)
        .max(1);
    let (min_x, min_y, max_x, max_y) = claimed.iter().fold(
        (i32::MAX, i32::MAX, i32::MIN, i32::MIN),
        |(min_x, min_y, max_x, max_y), &cell| {
            (
                min_x.min(cell.x),
                min_y.min(cell.y),
                max_x.max(cell.x),
                max_y.max(cell.y),
            )
        },
    );
    for (cell, possibilities) in remaining.iter_mut().enumerate() {
        if absorbed[cell] || possibilities.is_empty() {
            continue;
        }
        let anchor = columns[cell].coord;
        if anchor.x < min_x - reach
            || anchor.x > max_x + reach
            || anchor.y < min_y - reach
            || anchor.y > max_y + reach
        {
            continue;
        }
        let mut kept = Vec::with_capacity(possibilities.len());
        for &bp in possibilities.iter() {
            let blueprint_ref = &catalog.entities[bp];
            if !footprint_hits(anchor, blueprint_ref, claimed, bp, blueprint) {
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
    let columns_view = Columns::of(columns);
    let mut occupied = vec![false; n];
    for (index, column) in columns.iter().enumerate() {
        occupied[index] = placed.at(column.coord).next().is_some();
    }

    let blueprints = &catalog.entities;
    let max_footprint = blueprints
        .iter()
        .map(|blueprint| blueprint.shape.length as usize)
        .max()
        .unwrap_or(1);
    let mut scratch = Vec::with_capacity(max_footprint);
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
            if !footprint_cells_into(&columns_view, anchor, blueprint, &mut scratch) {
                continue;
            }
            if scratch
                .iter()
                .any(|&coord| match columns_view.index(coord.x, coord.y) {
                    Some(index) => occupied[index],
                    None => true,
                })
            {
                continue;
            }
            if footprint_elevation(&columns_view, &scratch).is_none() {
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
                let cells = footprint_cells(&columns_view, column, blueprint_ref)
                    .unwrap_or_else(|| vec![column]);
                let mut claimed_coords: HashSet<WorldCoord> = HashSet::with_capacity(cells.len());
                for &coord in &cells {
                    claimed_coords.insert(coord);
                    if let Some(index) = columns_view.index(coord.x, coord.y) {
                        absorbed[index] = true;
                    }
                }
                eliminate(
                    columns,
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
        let Some(cells) = footprint_cells(&columns_view, anchor, blueprint) else {
            continue;
        };
        let Some(level) = footprint_elevation(&columns_view, &cells) else {
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
