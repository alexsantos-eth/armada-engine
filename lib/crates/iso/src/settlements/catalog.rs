//! The settlement content catalogue: where settlements stand, and what each of their zones grows.

use std::collections::HashMap;

use crate::entities::EntityCatalog;
use crate::entities::wfc::WfcCatalog;

/// The schema version of the settlement content this validator accepts.
pub const SETTLEMENTS_SCHEMA_VERSION: u32 = 2;

/// What one zone grows: a multiplier per blueprint over its wfc weight, the weight of every
/// building its lots raise, and how thickly the village greenery fills it.
#[derive(Clone, Debug, PartialEq)]
pub struct ZoneProfile {
    /// Density of village greenery here: `0` plants none, `1` keeps the catalogue's spacing,
    /// and a larger number tightens it, so a park grows thicker than a back lane.
    pub greens: f64,
    multipliers: Vec<f64>,
    lots: Vec<f64>,
}

impl ZoneProfile {
    /// The multiplier for the blueprint at `index` in the entity catalogue this was parsed with.
    pub fn multiplier(&self, index: usize) -> f64 {
        self.multipliers.get(index).copied().unwrap_or(0.0)
    }

    /// The weight the lots of this zone give the blueprint at `index`; `0` never raises it.
    pub fn lot(&self, index: usize) -> f64 {
        self.lots.get(index).copied().unwrap_or(0.0)
    }
}

/// What part of a settlement's block grid a zone covers.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ZoneRole {
    /// The one block nearest the middle of the grid: the plaza with the great hall.
    Center,
    /// A block of buildings, each on a lot of its rim beside a street, with trees between them.
    Residential,
    /// A block with no house: its lots raise woods and decor, ringed by streets.
    Park,
    /// The open band around the street grid, and every block the grid trimmed away.
    Edge,
    /// The streets between the blocks and the exits into the wild.
    Street,
    /// Optional: the rim of a block that stands right in front of a street, seen from the
    /// camera (its `+x` or `+y` neighbour is a street), kept to low decor so nothing tall hides
    /// a player walking that street. Without a verge zone the rim keeps its block's zone.
    Verge,
}

impl ZoneRole {
    /// Every role, in the order a catalogue is checked for them.
    pub const ALL: [ZoneRole; 5] = [
        ZoneRole::Center,
        ZoneRole::Residential,
        ZoneRole::Park,
        ZoneRole::Edge,
        ZoneRole::Street,
    ];

    /// Whether exactly one zone may play this role.
    fn is_unique(self) -> bool {
        matches!(
            self,
            ZoneRole::Center | ZoneRole::Edge | ZoneRole::Street | ZoneRole::Verge
        )
    }
}

/// One semantic zone of a settlement: its role in the block grid, how often it wins a block
/// against the other zones of its kind (`share`), and what it grows.
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementZone {
    /// Stable identifier used by the engine and the content (`center`, `residential`…).
    pub id: String,
    /// The part of the block grid this zone covers.
    pub role: ZoneRole,
    /// Relative weight against the other residential and park zones when a block is dealt.
    pub share: f64,
    /// Whether every lot of one block raises the same building, so a block reads as a market
    /// or a row of one trade instead of a mix.
    pub uniform: bool,
    /// What this zone grows.
    pub profile: ZoneProfile,
}

/// How a settlement lays its block grid out, in columns.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LayoutRules {
    /// Fewest blocks along each axis.
    pub blocks_min: i32,
    /// Most blocks along each axis.
    pub blocks_max: i32,
    /// Side of one square block, streets excluded.
    pub block: i32,
    /// Width of every street between two blocks.
    pub street: i32,
    /// Width of the open band around the outer streets.
    pub edge: i32,
    /// How far each exit street runs on into the wild.
    pub exit: i32,
    /// Share of the grid's corner blocks trimmed away, in `[0, 1]`.
    pub trim: f64,
    /// Share of the blocks on the camera's side that are parks whatever the deal, in `[0, 1]`.
    pub front_park: f64,
    /// Fewest lots on a block.
    pub lots_min: u32,
    /// Most lots on a block; never more than [`LayoutRules::slots`] holds.
    pub lots_max: u32,
    /// Whether a residential block also raises lots inside its rim, a second row behind the
    /// ones beside the street, once those are taken.
    pub inner_lots: bool,
    /// How often a block breaks the square: notched, shrunk or merged with a neighbour.
    pub shapes: ShapeShares,
}

/// The share of blocks that leave the plain square, each in `[0, 1]` and together no more
/// than one: the rest stay square.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ShapeShares {
    /// Share of blocks that lose a corner square of half their side to the street.
    pub notch: f64,
    /// Share of blocks that lose one whole side row to the street.
    pub shrink: f64,
    /// Share of blocks that swallow the street towards their `+x` or `+y` neighbour and grow
    /// into one double block with it.
    pub merge: f64,
    /// Share of blocks cut in two by an alley through their middle, joining the streets on
    /// either side.
    pub split: f64,
}

impl LayoutRules {
    /// Columns from one block to the next: a block and the street after it.
    pub fn pitch(&self) -> i32 {
        self.block + self.street
    }

    /// Columns the settlement reaches past its outer streets: the wider of edge and exit.
    pub fn margin(&self) -> i32 {
        self.edge.max(self.exit)
    }

    /// The cells of a block that may hold a lot, as offsets from its low corner: every other
    /// cell of its rim, so each lot touches a street and no two lots touch, front first; with
    /// `inner_lots`, every other cell of the whole block.
    pub fn slots(&self) -> Vec<(i32, i32)> {
        let last = self.block - 1;
        let inner = self.inner_lots;
        let mut slots: Vec<(i32, i32)> = (0..self.block)
            .flat_map(|x| (0..self.block).map(move |y| (x, y)))
            .filter(|&(x, y)| {
                (inner || x == 0 || y == 0 || x == last || y == last) && (x + y) % 2 == 0
            })
            .collect();
        slots.sort_by_key(|&(x, y)| (x + y, x));
        slots
    }

    /// Columns the widest settlement spans along one axis, margins included.
    pub fn max_extent(&self) -> i32 {
        self.blocks_max * self.pitch() + self.street + 2 * self.margin()
    }
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

/// The validated settlement content: the field that lays settlements down, the block grid each
/// one is cut into and the zones that fill it.
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementCatalog {
    /// The schema the file declared; always [`SETTLEMENTS_SCHEMA_VERSION`] after validation.
    pub schema_version: u32,
    /// Columns between two candidate settlement sites, on each axis.
    pub spacing: i32,
    /// Share of candidate sites that host a settlement, in `(0, 1]`.
    pub chance: f64,
    /// How each settlement lays its block grid out.
    pub layout: LayoutRules,
    /// What grows outside every settlement.
    pub wilderness: ZoneProfile,
    /// How the greenery of a settlement clusters around what is already standing.
    pub greens: GreensRules,
    /// The zones in file order; indices into it are stable for one loaded catalogue.
    pub zones: Vec<SettlementZone>,
}

impl SettlementCatalog {
    /// The index of the verge zone, when the content declares one.
    pub fn verge(&self) -> Option<usize> {
        self.zones
            .iter()
            .position(|zone| zone.role == ZoneRole::Verge)
    }

    /// The index of the first zone playing `role`; validation keeps one of every role.
    pub fn zone_of(&self, role: ZoneRole) -> usize {
        self.zones
            .iter()
            .position(|zone| zone.role == role)
            .unwrap_or(0)
    }
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
    /// No zone plays a role the block grid needs.
    MissingRole {
        /// The role nobody plays.
        role: ZoneRole,
    },
    /// Two zones play a role only one may.
    DuplicateRole {
        /// The role played twice.
        role: ZoneRole,
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
    /// The block layout could not cut a grid with room for a lot on every block.
    InvalidLayout,
    /// Two neighbouring settlements could overlap.
    SettlementsOverlap {
        /// The spacing the file declared.
        spacing: i32,
        /// The columns the widest settlement spans.
        extent: i32,
    },
    /// A zone's share of the blocks was not finite and non-negative.
    InvalidShare {
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
            SettlementError::MissingRole { role } => {
                write!(f, "no settlement zone plays the {role:?} role")
            }
            SettlementError::DuplicateRole { role } => {
                write!(f, "only one settlement zone may play the {role:?} role")
            }
            SettlementError::InvalidSpacing { found } => write!(
                f,
                "spacing must be a positive number of columns, got {found}"
            ),
            SettlementError::InvalidChance { found } => {
                write!(f, "chance must be in (0, 1], got {found}")
            }
            SettlementError::InvalidLayout => write!(
                f,
                "layout needs at least one block per axis with min no greater than max, blocks of three columns or more, streets of one or more, no negative edge or exit, shares in [0, 1] and no more lots per block than its rim has slots"
            ),
            SettlementError::SettlementsOverlap { spacing, extent } => write!(
                f,
                "spacing {spacing} is not wider than the {extent} columns the widest settlement spans"
            ),
            SettlementError::InvalidShare { zone } => write!(
                f,
                "zone {zone} has a share that is not finite and non-negative"
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
struct RawCount {
    min: i64,
    max: i64,
}

#[derive(Default, serde::Deserialize)]
struct RawShapes {
    #[serde(default)]
    notch: f64,
    #[serde(default)]
    shrink: f64,
    #[serde(default)]
    merge: f64,
    #[serde(default)]
    split: f64,
}

#[derive(serde::Deserialize)]
struct RawLayout {
    blocks: RawCount,
    block: i32,
    street: i32,
    edge: i32,
    exit: i32,
    trim: f64,
    #[serde(rename = "frontPark")]
    front_park: f64,
    lots: RawCount,
    #[serde(default, rename = "innerLots")]
    inner_lots: bool,
    #[serde(default)]
    shapes: RawShapes,
}

#[derive(serde::Deserialize)]
struct RawProfile {
    #[serde(default)]
    default: f64,
    #[serde(default)]
    greens: f64,
    #[serde(default)]
    weights: HashMap<String, f64>,
    #[serde(default)]
    lots: HashMap<String, f64>,
}

#[derive(serde::Deserialize)]
struct RawZone {
    id: String,
    role: ZoneRole,
    #[serde(default)]
    share: f64,
    #[serde(default)]
    uniform: bool,
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
    layout: RawLayout,
    wilderness: RawProfile,
    greens: RawGreens,
    zones: Vec<RawZone>,
}

/// Validates the block layout: a grid every block of which has a slot for each of its lots.
fn layout_of(raw: &RawLayout) -> Result<LayoutRules, SettlementError> {
    let share = |value: f64| value.is_finite() && (0.0..=1.0).contains(&value);
    let valid = (1..=64).contains(&raw.blocks.min)
        && raw.blocks.max >= raw.blocks.min
        && raw.blocks.max <= 64
        && (3..=64).contains(&raw.block)
        && (1..=8).contains(&raw.street)
        && (0..=64).contains(&raw.edge)
        && (0..=64).contains(&raw.exit)
        && share(raw.trim)
        && share(raw.front_park)
        && raw.lots.min >= 0
        && raw.lots.max >= raw.lots.min
        && raw.lots.max <= 64
        && share(raw.shapes.notch)
        && share(raw.shapes.shrink)
        && share(raw.shapes.merge)
        && share(raw.shapes.split)
        && raw.shapes.notch + raw.shapes.shrink + raw.shapes.merge + raw.shapes.split <= 1.0;
    if !valid {
        return Err(SettlementError::InvalidLayout);
    }
    let layout = LayoutRules {
        blocks_min: raw.blocks.min as i32,
        blocks_max: raw.blocks.max as i32,
        block: raw.block,
        street: raw.street,
        edge: raw.edge,
        exit: raw.exit,
        trim: raw.trim,
        front_park: raw.front_park,
        lots_min: raw.lots.min as u32,
        lots_max: raw.lots.max as u32,
        inner_lots: raw.inner_lots,
        shapes: ShapeShares {
            notch: raw.shapes.notch,
            shrink: raw.shapes.shrink,
            merge: raw.shapes.merge,
            split: raw.shapes.split,
        },
    };
    if layout.lots_max as usize > layout.slots().len() {
        return Err(SettlementError::InvalidLayout);
    }
    Ok(layout)
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

/// Resolves one weight map against the entity catalogue, expanding wfc families onto their
/// members; a blueprint key wins over the family it belongs to.
fn weights_of(
    raw: &HashMap<String, f64>,
    default: f64,
    zone: &str,
    entities: &EntityCatalog,
    wfc: &WfcCatalog,
) -> Result<Vec<f64>, SettlementError> {
    let index_of = |id: &str| {
        entities
            .entities
            .iter()
            .position(|blueprint| blueprint.id == id)
    };
    let mut multipliers = vec![default; entities.entities.len()];
    let mut keys: Vec<(&String, &f64)> = raw.iter().collect();
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
    Ok(multipliers)
}

/// Resolves one profile against the entity catalogue: its wfc multipliers and its lot weights.
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
    Ok(ZoneProfile {
        greens: raw.greens,
        multipliers: weights_of(&raw.weights, raw.default, zone, entities, wfc)?,
        lots: weights_of(&raw.lots, 0.0, zone, entities, wfc)?,
    })
}

/// Checks that every role the block grid deals is played, and the unique ones only once.
fn check_roles(zones: &[SettlementZone]) -> Result<(), SettlementError> {
    for role in ZoneRole::ALL.into_iter().chain([ZoneRole::Verge]) {
        let players = zones.iter().filter(|zone| zone.role == role).count();
        if role == ZoneRole::Verge && players == 0 {
            continue;
        }
        if players == 0 {
            return Err(SettlementError::MissingRole { role });
        }
        if players > 1 && role.is_unique() {
            return Err(SettlementError::DuplicateRole { role });
        }
    }
    Ok(())
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
    let layout = layout_of(&raw.layout)?;
    if raw.spacing <= layout.max_extent() {
        return Err(SettlementError::SettlementsOverlap {
            spacing: raw.spacing,
            extent: layout.max_extent(),
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
        if !zone.share.is_finite() || zone.share < 0.0 {
            return Err(SettlementError::InvalidShare {
                zone: zone.id.clone(),
            });
        }
        let profile = profile_of(&zone.profile, &zone.id, entities, wfc)?;
        zones.push(SettlementZone {
            id: zone.id.clone(),
            role: zone.role,
            share: zone.share,
            uniform: zone.uniform,
            profile,
        });
    }
    check_roles(&zones)?;
    Ok(SettlementCatalog {
        schema_version: raw.schema_version,
        spacing: raw.spacing,
        chance: raw.chance,
        layout,
        wilderness,
        greens,
        zones,
    })
}

#[cfg(test)]
#[path = "catalog.test.rs"]
mod tests;
