//! The biomes content catalogue: which trees grow where, and the soil palette each biome wears.

use std::collections::HashSet;

use crate::entities::EntityCatalog;

/// The schema version of the biomes content this validator accepts.
pub const BIOMES_SCHEMA_VERSION: u32 = 1;

/// One tree species a biome can grow, with the relative weight it takes inside its groves.
#[derive(Clone, Debug, PartialEq)]
pub struct BiomeTree {
    /// The blueprint (`entities.json`) this entry makes eligible; must exist there.
    pub blueprint: String,
    /// Relative share of the biome's groves; only positive, finite weights are allowed.
    pub weight: f64,
}

/// A single biome: its share of the world, its groves and its soil palette.
#[derive(Clone, Debug, PartialEq)]
pub struct Biome {
    /// Stable identifier used by the engine and the content files (`temperate_forest`…).
    pub id: String,
    /// Relative share of the world this biome covers; shares need not add up to anything.
    pub share: f64,
    /// Share of all world columns the biome grows its trees on, groves included.
    pub tree_coverage: f64,
    /// The species eligible here, lightest first; an empty list is a treeless biome.
    pub trees: Vec<BiomeTree>,
    /// Multiplier applied to swaying sprites' amplitude here; `0` is still air, `1` the
    /// authored amplitude. Only validates finite and non-negative.
    pub wind_strength: f64,
    /// Grass and path multipliers `0xRRGGBB`, ordered dark to light.
    pub grass_tints: Vec<u32>,
    /// Bare-ground multipliers `0xRRGGBB`, ordered dark to light.
    pub ground_tints: Vec<u32>,
}

/// The versioned biomes catalogue, `schema_version` is [`BIOMES_SCHEMA_VERSION`].
#[derive(Clone, Debug, PartialEq)]
pub struct BiomeCatalog {
    /// The schema the file declared; always [`BIOMES_SCHEMA_VERSION`] after validation.
    pub schema_version: u32,
    /// The biomes in file order; indices into it are stable for one loaded catalogue.
    pub biomes: Vec<Biome>,
}

/// Error parsing or validating the biomes content.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BiomeError {
    /// The JSON itself could not be read.
    Json(String),
    /// The declared schema is not the one this engine understands.
    UnsupportedSchema {
        /// What the file declared.
        found: u32,
        /// What this engine accepts.
        expected: u32,
    },
    /// The catalogue declares no biome at all.
    NoBiomes,
    /// A biome id was empty.
    EmptyId,
    /// Two biomes share an id.
    DuplicateId {
        /// The duplicated id.
        id: String,
    },
    /// A share was not a positive, finite number.
    InvalidShare {
        /// The offending biome.
        id: String,
    },
    /// A tree coverage was not in `(0, 1]`.
    InvalidTreeCoverage {
        /// The offending biome.
        id: String,
    },
    /// A species weight was not a positive, finite number.
    InvalidWeight {
        /// The biome the weight was declared in.
        biome: String,
        /// The blueprint the weight was declared for.
        blueprint: String,
    },
    /// A blueprint the biomes content references is not in the entity catalogue.
    UnknownBlueprint {
        /// The biome that references it.
        biome: String,
        /// The missing blueprint.
        blueprint: String,
    },
    /// A soil tint was not a six-digit hex multiplier.
    InvalidColor {
        /// The biome the value was declared in.
        biome: String,
        /// Which palette carries it (`grassTints` or `groundTints`).
        field: &'static str,
        /// The value as written.
        value: String,
    },
    /// A wind strength was not a finite, non-negative number.
    InvalidWindStrength {
        /// The offending biome.
        id: String,
    },
}

impl std::fmt::Display for BiomeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BiomeError::Json(reason) => write!(f, "biomes JSON could not be parsed: {reason}"),
            BiomeError::UnsupportedSchema { found, expected } => write!(
                f,
                "unsupported biomes schema version {found}, expected {expected}"
            ),
            BiomeError::NoBiomes => write!(f, "the biomes catalogue declares no biome"),
            BiomeError::EmptyId => write!(f, "biome id must not be empty"),
            BiomeError::DuplicateId { id } => write!(f, "duplicate biome id: {id}"),
            BiomeError::InvalidShare { id } => {
                write!(
                    f,
                    "biome {id} has an invalid share: expected a positive, finite number"
                )
            }
            BiomeError::InvalidTreeCoverage { id } => {
                write!(
                    f,
                    "biome {id} has an invalid treeCoverage: expected a value in (0, 1]"
                )
            }
            BiomeError::InvalidWeight { biome, blueprint } => write!(
                f,
                "biome {biome} gives blueprint {blueprint} an invalid weight: expected a positive, finite number"
            ),
            BiomeError::UnknownBlueprint { biome, blueprint } => write!(
                f,
                "biome {biome} references blueprint {blueprint}, which the entity catalogue does not have"
            ),
            BiomeError::InvalidColor {
                biome,
                field,
                value,
            } => write!(
                f,
                "biome {biome} has an invalid {field} value {value:?}: expected six hex digits"
            ),
            BiomeError::InvalidWindStrength { id } => write!(
                f,
                "biome {id} has an invalid windStrength: expected a finite, non-negative number"
            ),
        }
    }
}

impl std::error::Error for BiomeError {}

#[derive(serde::Deserialize)]
struct RawBiomeTree {
    blueprint: String,
    weight: f64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawBiome {
    id: String,
    share: f64,
    tree_coverage: f64,
    #[serde(default)]
    trees: Vec<RawBiomeTree>,
    #[serde(default = "default_wind_strength")]
    wind_strength: f64,
    grass_tints: Vec<String>,
    ground_tints: Vec<String>,
}

/// A biome that declares no wind sways at the authored amplitude.
fn default_wind_strength() -> f64 {
    1.0
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawBiomeCatalog {
    schema_version: u32,
    biomes: Vec<RawBiome>,
}

/// Parses and validates the biomes content against the entity catalogue it references.
///
/// Cross-validation is the point: a biome may only name blueprints the entity catalogue has, so a
/// typo fails loudly at load instead of silently growing nothing.
pub fn parse_biomes(json: &str, entities: &EntityCatalog) -> Result<BiomeCatalog, BiomeError> {
    let raw: RawBiomeCatalog =
        serde_json::from_str(json).map_err(|err| BiomeError::Json(err.to_string()))?;
    if raw.schema_version != BIOMES_SCHEMA_VERSION {
        return Err(BiomeError::UnsupportedSchema {
            found: raw.schema_version,
            expected: BIOMES_SCHEMA_VERSION,
        });
    }
    if raw.biomes.is_empty() {
        return Err(BiomeError::NoBiomes);
    }
    let blueprint_ids: HashSet<&str> = entities
        .entities
        .iter()
        .map(|blueprint| blueprint.id.as_str())
        .collect();
    let mut seen = HashSet::new();
    let mut biomes = Vec::with_capacity(raw.biomes.len());
    for raw_biome in raw.biomes {
        if raw_biome.id.is_empty() {
            return Err(BiomeError::EmptyId);
        }
        if !seen.insert(raw_biome.id.clone()) {
            return Err(BiomeError::DuplicateId { id: raw_biome.id });
        }
        if !raw_biome.share.is_finite() || raw_biome.share <= 0.0 {
            return Err(BiomeError::InvalidShare { id: raw_biome.id });
        }
        if !raw_biome.wind_strength.is_finite() || raw_biome.wind_strength < 0.0 {
            return Err(BiomeError::InvalidWindStrength { id: raw_biome.id });
        }
        if !raw_biome.tree_coverage.is_finite()
            || raw_biome.tree_coverage <= 0.0
            || raw_biome.tree_coverage > 1.0
        {
            return Err(BiomeError::InvalidTreeCoverage { id: raw_biome.id });
        }
        let mut trees = Vec::with_capacity(raw_biome.trees.len());
        for tree in raw_biome.trees {
            if !tree.weight.is_finite() || tree.weight <= 0.0 {
                return Err(BiomeError::InvalidWeight {
                    biome: raw_biome.id,
                    blueprint: tree.blueprint,
                });
            }
            if !blueprint_ids.contains(tree.blueprint.as_str()) {
                return Err(BiomeError::UnknownBlueprint {
                    biome: raw_biome.id,
                    blueprint: tree.blueprint,
                });
            }
            trees.push(BiomeTree {
                blueprint: tree.blueprint,
                weight: tree.weight,
            });
        }
        let grass_tints = parse_palette(&raw_biome.id, "grassTints", &raw_biome.grass_tints)?;
        let ground_tints = parse_palette(&raw_biome.id, "groundTints", &raw_biome.ground_tints)?;
        biomes.push(Biome {
            id: raw_biome.id,
            share: raw_biome.share,
            tree_coverage: raw_biome.tree_coverage,
            trees,
            wind_strength: raw_biome.wind_strength,
            grass_tints,
            ground_tints,
        });
    }
    Ok(BiomeCatalog {
        schema_version: raw.schema_version,
        biomes,
    })
}

fn parse_palette(
    biome: &str,
    field: &'static str,
    values: &[String],
) -> Result<Vec<u32>, BiomeError> {
    if values.is_empty() {
        return Err(BiomeError::InvalidColor {
            biome: biome.to_owned(),
            field,
            value: String::new(),
        });
    }
    values
        .iter()
        .map(|value| {
            let digits = value.trim_start_matches('#');
            let parsed = u32::from_str_radix(digits, 16)
                .ok()
                .filter(|_| digits.len() == 6);
            parsed.ok_or_else(|| BiomeError::InvalidColor {
                biome: biome.to_owned(),
                field,
                value: value.clone(),
            })
        })
        .collect()
}

#[cfg(test)]
#[path = "catalog.test.rs"]
mod tests;
