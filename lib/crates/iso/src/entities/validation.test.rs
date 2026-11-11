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

fn blueprint(id: &str, length: i32, surfaces: Vec<TerrainMaterial>) -> EntityBlueprint {
    EntityBlueprint {
        id: id.to_owned(),
        asset: asset("/assets/tree/block.svg"),
        shape: EntityShape {
            height: 2,
            length,
            axis: EntityLengthAxis::X,
            collision: vec![0.15; length as usize],
        },
        placement: EntityPlacement {
            surfaces,
            road_access: false,
        },
    }
}

fn catalog(entities: Vec<EntityBlueprint>) -> EntityCatalog {
    EntityCatalog {
        schema_version: CATALOG_SCHEMA_VERSION,
        entities,
    }
}

#[test]
fn accepts_valid_catalog() {
    let catalog = catalog(vec![
        blueprint("tree", 1, vec![TerrainMaterial::Grass]),
        blueprint(
            "pier",
            3,
            vec![
                TerrainMaterial::Water,
                TerrainMaterial::Sand,
                TerrainMaterial::Grass,
            ],
        ),
    ]);
    assert!(validate_catalog(&catalog).is_ok());
}

#[test]
fn rejects_unsupported_schema() {
    let catalog = EntityCatalog {
        schema_version: 2,
        entities: vec![blueprint("tree", 1, vec![TerrainMaterial::Grass])],
    };
    let err = validate_catalog(&catalog).unwrap_err();
    assert!(matches!(
        err,
        CatalogError::UnsupportedSchema {
            found: 2,
            expected: 1
        }
    ));
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
    let mut bp = blueprint(
        "tree",
        2,
        vec![TerrainMaterial::Grass, TerrainMaterial::Grass],
    );
    bp.shape.collision = vec![0.15];
    let catalog = catalog(vec![bp]);
    let err = validate_catalog(&catalog).unwrap_err();
    assert!(matches!(err, CatalogError::InvalidShape { id, .. } if id == "tree"));
}

#[test]
fn rejects_surfaces_length_mismatch() {
    let bp = blueprint("tree", 2, vec![TerrainMaterial::Grass]);
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
    let bp = blueprint(
        "house_2x1",
        2,
        vec![TerrainMaterial::Grass, TerrainMaterial::Grass],
    );
    let catalog = catalog(vec![bp]);
    assert!(validate_catalog(&catalog).is_ok());
}
