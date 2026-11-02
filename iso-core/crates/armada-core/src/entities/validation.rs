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
    // Every `TerrainMaterial` variant is a valid placement surface.
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
mod tests {
    use super::*;
    use crate::terrain::TerrainMaterial;

    fn asset(sprite: &str) -> EntityAsset {
        EntityAsset {
            sprite: sprite.to_owned(),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
        }
    }

    fn blueprint(id: &str, length: i32, surfaces: Vec<TerrainMaterial>) -> EntityBlueprintV2 {
        EntityBlueprintV2 {
            id: id.to_owned(),
            asset: asset("/assets/tree/block.svg"),
            shape: EntityShape {
                height: 2,
                length,
                axis: EntityLengthAxis::X,
                collision: vec![0.15; length as usize],
            },
            placement: EntityPlacement { surfaces },
        }
    }

    fn catalog(entities: Vec<EntityBlueprintV2>) -> EntityCatalogV2 {
        EntityCatalogV2 {
            schema_version: CATALOG_SCHEMA_VERSION,
            entities,
        }
    }

    #[test]
    fn accepts_valid_catalog() {
        let catalog = catalog(vec![
            blueprint("tree", 1, vec![TerrainMaterial::Grass]),
            blueprint("pier", 3, vec![TerrainMaterial::Water, TerrainMaterial::Sand, TerrainMaterial::Grass]),
        ]);
        assert!(validate_catalog(&catalog).is_ok());
    }

    #[test]
    fn rejects_unsupported_schema() {
        let catalog = EntityCatalogV2 {
            schema_version: 2,
            entities: vec![blueprint("tree", 1, vec![TerrainMaterial::Grass])],
        };
        let err = validate_catalog(&catalog).unwrap_err();
        assert!(matches!(err, CatalogError::UnsupportedSchema { found: 2, expected: 1 }));
    }

    #[test]
    fn rejects_duplicate_id() {
        let catalog = catalog(vec![
            blueprint("tree", 1, vec![TerrainMaterial::Grass]),
            blueprint("tree", 1, vec![TerrainMaterial::Grass]),
        ]);
        let err = validate_catalog(&catalog).unwrap_err();
        assert!(matches!(err, CatalogError::DuplicateId { id } if id == "tree"));
    }

    #[test]
    fn rejects_empty_id() {
        let catalog = catalog(vec![blueprint("", 1, vec![TerrainMaterial::Grass])]);
        let err = validate_catalog(&catalog).unwrap_err();
        assert!(matches!(err, CatalogError::EmptyId));
    }

    #[test]
    fn rejects_collision_length_mismatch() {
        let mut bp = blueprint("tree", 2, vec![TerrainMaterial::Grass, TerrainMaterial::Grass]);
        bp.shape.collision = vec![0.15]; // one value for two cells
        let catalog = catalog(vec![bp]);
        let err = validate_catalog(&catalog).unwrap_err();
        assert!(matches!(err, CatalogError::InvalidShape { id, .. } if id == "tree"));
    }

    #[test]
    fn rejects_surfaces_length_mismatch() {
        let bp = blueprint("tree", 2, vec![TerrainMaterial::Grass]); // one surface for two cells
        let catalog = catalog(vec![bp]);
        let err = validate_catalog(&catalog).unwrap_err();
        assert!(matches!(err, CatalogError::InvalidPlacement { id, .. } if id == "tree"));
    }

    #[test]
    fn rejects_empty_sprite() {
        let mut bp = blueprint("tree", 1, vec![TerrainMaterial::Grass]);
        bp.asset.sprite = String::new();
        let catalog = catalog(vec![bp]);
        let err = validate_catalog(&catalog).unwrap_err();
        assert!(matches!(err, CatalogError::InvalidAsset { id, .. } if id == "tree"));
    }

    #[test]
    fn accepts_single_surface_for_multi_cell() {
        // A single surface value is not enough: every cell needs its own entry.
        let bp = blueprint("house_2x1", 2, vec![TerrainMaterial::Grass, TerrainMaterial::Grass]);
        let catalog = catalog(vec![bp]);
        assert!(validate_catalog(&catalog).is_ok());
    }
}
