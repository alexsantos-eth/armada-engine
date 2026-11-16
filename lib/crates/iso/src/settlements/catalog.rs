//! The settlement content catalogue: where settlements stand, and what each of their zones grows.

use std::collections::HashMap;

use crate::entities::EntityCatalog;
use crate::entities::wfc::WfcCatalog;

/// The schema version of the settlement content this validator accepts.
pub const SETTLEMENTS_SCHEMA_VERSION: u32 = 1;

/// What one zone grows: a multiplier per blueprint over its wfc weight, and how thickly the
/// village greenery fills it. `0` forbids; `1` is the catalogue's own spacing.
#[derive(Clone, Debug, PartialEq)]
pub struct ZoneProfile {
    /// Density of village greenery here: `0` plants none, `1` keeps the catalogue's spacing,
    /// and a larger number tightens it, so a sacred grove grows thicker than a back lane.
    pub greens: f64,
    multipliers: Vec<f64>,
}

impl ZoneProfile {
    /// The multiplier for the blueprint at `index` in the entity catalogue this was parsed with.
    pub fn multiplier(&self, index: usize) -> f64 {
        self.multipliers.get(index).copied().unwrap_or(0.0)
    }
}

/// One semantic zone of a settlement: how many Voronoi seeds it drops, where they sit and how
/// far their cells reach.
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementZone {
    /// Stable identifier used by the engine and the content (`center`, `residential`…).
    pub id: String,
    /// How many seeds of this zone every settlement drops.
    pub seeds: u32,
    /// The band of the radius its seeds sit in, as fractions of the radius, near then far.
    pub ring: (f64, f64),
    /// Additive Voronoi bonus, as a fraction of the radius: bigger seeds own bigger cells.
    pub pull: f64,
    /// What this zone grows.
    pub profile: ZoneProfile,
}

/// How the greenery of a settlement clusters around what is already standing.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GreensRules {
    /// Columns between two trees far from every building.
    pub spacing: f64,
    /// Columns between two trees right beside a building, where they clump.
    pub tight: f64,
    /// Up to this distance from a building, the tight spacing rules.
    pub near: f64,
    /// From this distance on, the open spacing rules.
    pub far: f64,
    /// Columns of clearance kept in front of a façade, where nothing is planted.
    pub front: i32,
    /// The patio each building grows behind it.
    pub patio: PatioRules,
}

/// The cluster of greenery a building grows on its own back side.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PatioRules {
    /// Share of buildings that grow one, in `[0, 1]`.
    pub chance: f64,
    /// Fewest plants a patio puts down.
    pub min: u32,
    /// Most plants a patio puts down.
    pub max: u32,
    /// How far behind the building the patio reaches, in columns.
    pub reach: i32,
    /// Share of patio plants that are a grove instead of a single tree, in `[0, 1]`.
    pub grove_chance: f64,
}

/// The validated settlement content: the field that lays settlements down and their zones.
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementCatalog {
    /// The schema the file declared; always [`SETTLEMENTS_SCHEMA_VERSION`] after validation.
    pub schema_version: u32,
    /// Columns between two candidate settlement sites, on each axis.
    pub spacing: i32,
    /// Share of candidate sites that host a settlement, in `(0, 1]`.
    pub chance: f64,
    /// Smallest settlement radius in columns.
    pub radius_min: f64,
    /// Largest settlement radius in columns.
    pub radius_max: f64,
    /// What grows outside every settlement.
    pub wilderness: ZoneProfile,
    /// How the greenery of a settlement clusters around what is already standing.
    pub greens: GreensRules,
    /// The zones in file order; indices into it are stable for one loaded catalogue.
    pub zones: Vec<SettlementZone>,
}

/// Everything the settlement content can declare wrong.
#[derive(Clone, Debug, PartialEq)]
pub enum SettlementError {
    /// The JSON itself could not be read.
    Json(String),
    /// The declared schema is not the one this engine understands.
    UnsupportedSchema {
        /// What the file declared.
        found: u32,
        /// What this engine accepts.
        expected: u32,
    },
    /// The catalogue declares no zone at all.
    NoZones,
    /// A zone id was empty.
    EmptyZoneId,
    /// Two zones share an id.
    DuplicateZone {
        /// The duplicated id.
        id: String,
    },
    /// The spacing between candidate sites was not a positive number of columns.
    InvalidSpacing {
        /// What the file declared.
        found: i32,
    },
    /// The share of candidate sites that host a settlement was not in `(0, 1]`.
    InvalidChance {
        /// What the file declared.
        found: f64,
    },
    /// The radius band was not a finite, positive, ascending pair.
    InvalidRadius,
    /// Two neighbouring settlements could overlap, which no zone layout can resolve.
    SettlementsOverlap {
        /// The spacing the file declared.
        spacing: i32,
        /// The largest radius the file declared.
        radius_max: f64,
    },
    /// A zone drops no seed, so it could never own a column.
    InvalidSeeds {
        /// The offending zone.
        zone: String,
        /// What the file declared.
        found: u32,
    },
    /// A ring was not an ascending pair of fractions of the radius in `[0, 1]`.
    InvalidRing {
        /// The offending zone.
        zone: String,
    },
    /// A pull was not a finite fraction of the radius in `[0, 1]`.
    InvalidPull {
        /// The offending zone.
        zone: String,
    },
    /// A greenery density was not finite and non-negative.
    InvalidGreens {
        /// The offending zone.
        zone: String,
    },
    /// A greenery rule was not a finite, positive, ascending set of distances.
    InvalidGreensRules,
    /// A patio rule was out of range: shares outside `[0, 1]`, a descending count or a
    /// reach of no columns at all.
    InvalidPatio,
    /// A default multiplier was not finite and non-negative.
    InvalidDefault {
        /// The offending zone.
        zone: String,
    },
    /// A weight multiplier was not finite and non-negative.
    InvalidMultiplier {
        /// The zone the multiplier was declared in.
        zone: String,
        /// The key it was declared under.
        key: String,
    },
    /// A weight key names neither a blueprint nor a wfc family.
    UnknownKey {
        /// The zone the key was declared in.
        zone: String,
        /// The key as written.
        key: String,
    },
}

impl std::fmt::Display for SettlementError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SettlementError::Json(reason) => {
                write!(f, "settlements JSON could not be parsed: {reason}")
            }
            SettlementError::UnsupportedSchema { found, expected } => write!(
                f,
                "unsupported settlements schema version {found}, expected {expected}"
            ),
            SettlementError::NoZones => {
                write!(f, "the settlements catalogue declares no zone")
            }
            SettlementError::EmptyZoneId => write!(f, "a settlement zone has an empty id"),
            SettlementError::DuplicateZone { id } => {
                write!(f, "two settlement zones share the id {id}")
            }
            SettlementError::InvalidSpacing { found } => write!(
                f,
                "spacing must be a positive number of columns, got {found}"
            ),
            SettlementError::InvalidChance { found } => {
                write!(f, "chance must be in (0, 1], got {found}")
            }
            SettlementError::InvalidRadius => write!(
                f,
                "radius must be a finite, positive band with min no greater than max"
            ),
            SettlementError::SettlementsOverlap {
                spacing,
                radius_max,
            } => write!(
                f,
                "spacing {spacing} is not wider than two settlements of radius {radius_max}"
            ),
            SettlementError::InvalidSeeds { zone, found } => write!(
                f,
                "zone {zone} drops {found} seeds: it would never own a column"
            ),
            SettlementError::InvalidRing { zone } => write!(
                f,
                "zone {zone} has a ring that is not an ascending pair of fractions in [0, 1]"
            ),
            SettlementError::InvalidPull { zone } => write!(
                f,
                "zone {zone} has a pull that is not a finite fraction of the radius in [0, 1]"
            ),
            SettlementError::InvalidGreens { zone } => write!(
                f,
                "zone {zone} has a greens density that is not finite and non-negative"
            ),
            SettlementError::InvalidGreensRules => write!(
                f,
                "greens needs finite, positive spacings with tight no wider than spacing, near no farther than far, and a front clearance of no fewer than zero columns"
            ),
            SettlementError::InvalidPatio => write!(
                f,
                "patio needs shares in [0, 1], min no greater than max and a reach of at least one column"
            ),
            SettlementError::InvalidDefault { zone } => write!(
                f,
                "zone {zone} has a default that is not finite and non-negative"
            ),
            SettlementError::InvalidMultiplier { zone, key } => write!(
                f,
                "zone {zone} gives {key} a multiplier that is not finite and non-negative"
            ),
            SettlementError::UnknownKey { zone, key } => write!(
                f,
                "zone {zone} references {key}, which is neither a blueprint nor a wfc family"
            ),
        }
    }
}

impl std::error::Error for SettlementError {}

#[derive(serde::Deserialize)]
struct RawRadius {
    min: f64,
    max: f64,
}

#[derive(serde::Deserialize)]
struct RawProfile {
    #[serde(default)]
    default: f64,
    #[serde(default)]
    greens: f64,
    #[serde(default)]
    weights: HashMap<String, f64>,
}

#[derive(serde::Deserialize)]
struct RawZone {
    id: String,
    seeds: u32,
    ring: [f64; 2],
    pull: f64,
    #[serde(flatten)]
    profile: RawProfile,
}

#[derive(serde::Deserialize)]
struct RawPatio {
    chance: f64,
    min: u32,
    max: u32,
    reach: i32,
    #[serde(rename = "groveChance")]
    grove_chance: f64,
}

#[derive(serde::Deserialize)]
struct RawGreens {
    spacing: f64,
    tight: f64,
    near: f64,
    far: f64,
    front: i32,
    patio: RawPatio,
}

#[derive(serde::Deserialize)]
struct RawSettlements {
    #[serde(rename = "schemaVersion")]
    schema_version: u32,
    spacing: i32,
    chance: f64,
    radius: RawRadius,
    wilderness: RawProfile,
    greens: RawGreens,
    zones: Vec<RawZone>,
}

/// Validates the greenery rules: finite, ordered distances and shares that read as shares.
fn greens_of(raw: &RawGreens) -> Result<GreensRules, SettlementError> {
    let distances = [raw.spacing, raw.tight, raw.near, raw.far];
    if distances
        .iter()
        .any(|value| !value.is_finite() || *value <= 0.0)
        || raw.tight > raw.spacing
        || raw.near > raw.far
        || raw.front < 0
    {
        return Err(SettlementError::InvalidGreensRules);
    }
    let shares = [raw.patio.chance, raw.patio.grove_chance];
    if shares
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0 || *value > 1.0)
        || raw.patio.min > raw.patio.max
        || raw.patio.reach < 1
    {
        return Err(SettlementError::InvalidPatio);
    }
    Ok(GreensRules {
        spacing: raw.spacing,
        tight: raw.tight,
        near: raw.near,
        far: raw.far,
        front: raw.front,
        patio: PatioRules {
            chance: raw.patio.chance,
            min: raw.patio.min,
            max: raw.patio.max,
            reach: raw.patio.reach,
            grove_chance: raw.patio.grove_chance,
        },
    })
}

/// Resolves one profile against the entity catalogue, expanding wfc families onto their members.
fn profile_of(
    raw: &RawProfile,
    zone: &str,
    entities: &EntityCatalog,
    wfc: &WfcCatalog,
) -> Result<ZoneProfile, SettlementError> {
    if !raw.default.is_finite() || raw.default < 0.0 {
        return Err(SettlementError::InvalidDefault {
            zone: zone.to_owned(),
        });
    }
    if !raw.greens.is_finite() || raw.greens < 0.0 {
        return Err(SettlementError::InvalidGreens {
            zone: zone.to_owned(),
        });
    }
    let index_of = |id: &str| {
        entities
            .entities
            .iter()
            .position(|blueprint| blueprint.id == id)
    };
    let mut multipliers = vec![raw.default; entities.entities.len()];
    let mut keys: Vec<(&String, &f64)> = raw.weights.iter().collect();
    keys.sort_by(|a, b| a.0.cmp(b.0));
    let mut families = Vec::new();
    let mut blueprints = Vec::new();
    for (key, multiplier) in keys {
        if !multiplier.is_finite() || *multiplier < 0.0 {
            return Err(SettlementError::InvalidMultiplier {
                zone: zone.to_owned(),
                key: key.clone(),
            });
        }
        match (index_of(key), wfc.families.get(key)) {
            (Some(index), _) => blueprints.push((index, *multiplier)),
            (None, Some(members)) => families.push((members, *multiplier)),
            (None, None) => {
                return Err(SettlementError::UnknownKey {
                    zone: zone.to_owned(),
                    key: key.clone(),
                });
            }
        }
    }
    for (members, multiplier) in families {
        for member in members {
            if let Some(index) = index_of(member) {
                multipliers[index] = multiplier;
            }
        }
    }
    for (index, multiplier) in blueprints {
        multipliers[index] = multiplier;
    }
    Ok(ZoneProfile {
        greens: raw.greens,
        multipliers,
    })
}

/// Parses and validates the settlement content against the entity catalogue it places and the
/// wfc catalogue whose families and weights its zones reshape.
pub fn parse_settlements(
    json: &str,
    entities: &EntityCatalog,
    wfc: &WfcCatalog,
) -> Result<SettlementCatalog, SettlementError> {
    let raw: RawSettlements =
        serde_json::from_str(json).map_err(|err| SettlementError::Json(err.to_string()))?;
    if raw.schema_version != SETTLEMENTS_SCHEMA_VERSION {
        return Err(SettlementError::UnsupportedSchema {
            found: raw.schema_version,
            expected: SETTLEMENTS_SCHEMA_VERSION,
        });
    }
    if raw.spacing <= 0 {
        return Err(SettlementError::InvalidSpacing { found: raw.spacing });
    }
    if !raw.chance.is_finite() || raw.chance <= 0.0 || raw.chance > 1.0 {
        return Err(SettlementError::InvalidChance { found: raw.chance });
    }
    if !raw.radius.min.is_finite()
        || !raw.radius.max.is_finite()
        || raw.radius.min <= 0.0
        || raw.radius.max < raw.radius.min
    {
        return Err(SettlementError::InvalidRadius);
    }
    if f64::from(raw.spacing) <= 2.0 * raw.radius.max {
        return Err(SettlementError::SettlementsOverlap {
            spacing: raw.spacing,
            radius_max: raw.radius.max,
        });
    }
    if raw.zones.is_empty() {
        return Err(SettlementError::NoZones);
    }
    let wilderness = profile_of(&raw.wilderness, "wilderness", entities, wfc)?;
    let greens = greens_of(&raw.greens)?;
    let mut zones = Vec::with_capacity(raw.zones.len());
    for zone in &raw.zones {
        if zone.id.is_empty() {
            return Err(SettlementError::EmptyZoneId);
        }
        if zones
            .iter()
            .any(|other: &SettlementZone| other.id == zone.id)
        {
            return Err(SettlementError::DuplicateZone {
                id: zone.id.clone(),
            });
        }
        if zone.seeds == 0 {
            return Err(SettlementError::InvalidSeeds {
                zone: zone.id.clone(),
                found: zone.seeds,
            });
        }
        let [near, far] = zone.ring;
        if !near.is_finite() || !far.is_finite() || near < 0.0 || far > 1.0 || far < near {
            return Err(SettlementError::InvalidRing {
                zone: zone.id.clone(),
            });
        }
        if !zone.pull.is_finite() || zone.pull < 0.0 || zone.pull > 1.0 {
            return Err(SettlementError::InvalidPull {
                zone: zone.id.clone(),
            });
        }
        let profile = profile_of(&zone.profile, &zone.id, entities, wfc)?;
        zones.push(SettlementZone {
            id: zone.id.clone(),
            seeds: zone.seeds,
            ring: (near, far),
            pull: zone.pull,
            profile,
        });
    }
    Ok(SettlementCatalog {
        schema_version: raw.schema_version,
        spacing: raw.spacing,
        chance: raw.chance,
        radius_min: raw.radius.min,
        radius_max: raw.radius.max,
        wilderness,
        greens,
        zones,
    })
}

#[cfg(test)]
#[path = "catalog.test.rs"]
mod tests;
