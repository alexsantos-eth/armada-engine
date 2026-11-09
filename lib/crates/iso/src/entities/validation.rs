//! Validation of the entity catalog blueprint.

use std::collections::HashSet;

use crate::entities::blueprint::*;

/// The catalog schema this validator accepts.
pub const CATALOG_SCHEMA_VERSION: u32 = 1;

/// Error validating an entity catalog.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CatalogError {
    UnsupportedSchema { found: u32, expected: u32 },
    EmptyId,
    DuplicateId { id: String },
    InvalidShape { id: String, reason: String },
    InvalidPlacement { id: String, reason: String },
    InvalidAsset { id: String, reason: String },
}

impl std::fmt::Display for CatalogError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CatalogError::UnsupportedSchema { found, expected } => {
                write!(f, "unsupported catalog schema version {found}, expected {expected}")
            }
            CatalogError::EmptyId => write!(f, "entity id must not be empty"),
            CatalogError::DuplicateId { id } => write!(f, "duplicate entity id: {id}"),
            CatalogError::InvalidShape { id, reason } => {
                write!(f, "invalid shape for entity {id}: {reason}")
            }
            CatalogError::InvalidPlacement { id, reason } => {
                write!(f, "invalid placement for entity {id}: {reason}")
            }
            CatalogError::InvalidAsset { id, reason } => {
                write!(f, "invalid asset for entity {id}: {reason}")
            }
        }
    }
}

impl std::error::Error for CatalogError {}

/// Validates a whole catalog: schema version, unique ids, and every blueprint.
pub fn validate_catalog(catalog: &EntityCatalogV2) -> Result<(), CatalogError> {
    if catalog.schema_version != CATALOG_SCHEMA_VERSION {
        return Err(CatalogError::UnsupportedSchema {
            found: catalog.schema_version,
            expected: CATALOG_SCHEMA_VERSION,
        });
    }
    let mut seen = HashSet::new();
    for blueprint in &catalog.entities {
        if blueprint.id.is_empty() {
            return Err(CatalogError::EmptyId);
        }
        if !seen.insert(blueprint.id.clone()) {
            return Err(CatalogError::DuplicateId {
                id: blueprint.id.clone(),
            });
        }
        validate_blueprint(blueprint)?;
    }
    Ok(())
}

/// Validates a single blueprint.
fn validate_blueprint(blueprint: &EntityBlueprintV2) -> Result<(), CatalogError> {
    if blueprint.shape.height < 1 {
        return Err(CatalogError::InvalidShape {
            id: blueprint.id.clone(),
            reason: "height must be >= 1".to_owned(),
        });
    }
    if blueprint.shape.length < 1 {
        return Err(CatalogError::InvalidShape {
            id: blueprint.id.clone(),
            reason: "length must be >= 1".to_owned(),
        });
    }
    let length = blueprint.shape.length as usize;
    if blueprint.shape.collision.len() != length {
        return Err(CatalogError::InvalidShape {
            id: blueprint.id.clone(),
            reason: "collision must have one value per footprint cell".to_owned(),
        });
    }
    if blueprint.placement.surfaces.is_empty() {
        return Err(CatalogError::InvalidPlacement {
            id: blueprint.id.clone(),
            reason: "surfaces must not be empty".to_owned(),
        });
    }
    if blueprint.placement.surfaces.len() != length {
        return Err(CatalogError::InvalidPlacement {
            id: blueprint.id.clone(),
            reason: "surfaces must have one value per footprint cell".to_owned(),
        });
    }
    let _ = &blueprint.placement.surfaces;
    if blueprint.asset.sprite.is_empty() {
        return Err(CatalogError::InvalidAsset {
            id: blueprint.id.clone(),
            reason: "sprite must not be empty".to_owned(),
        });
    }
    Ok(())
}

#[cfg(test)]
#[path = "validation.test.rs"]
mod tests;
