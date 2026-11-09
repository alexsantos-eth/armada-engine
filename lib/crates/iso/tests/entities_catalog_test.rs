//! Integration test for the entity catalog.
//! Loads the catalog the client ships (`content/entities.json`) and validates it.

use iso::entities::{CATALOG_SCHEMA_VERSION, validate_catalog};

fn fixture() -> serde_json::Value {
    serde_json::from_str(include_str!("../../../content/entities.json"))
        .expect("catalog fixture is valid JSON")
}

#[test]
fn entity_catalog_matches_contract_fixture() {
    let root = fixture();
    let catalog: iso::entities::EntityCatalog =
        serde_json::from_value(root.clone()).expect("fixture deserializes to the catalog");

    assert_eq!(catalog.schema_version, CATALOG_SCHEMA_VERSION);
    assert!(!catalog.entities.is_empty());

    let mut ids = std::collections::HashSet::new();
    for blueprint in &catalog.entities {
        assert!(
            ids.insert(blueprint.id.clone()),
            "duplicate id: {}",
            blueprint.id
        );
        assert!(!blueprint.id.is_empty(), "empty id");
        assert!(
            blueprint.shape.height >= 1,
            "height >= 1 for {}",
            blueprint.id
        );
        assert!(
            blueprint.shape.length >= 1,
            "length >= 1 for {}",
            blueprint.id
        );
        assert_eq!(
            blueprint.shape.collision.len(),
            blueprint.shape.length as usize,
            "collision per footprint cell for {}",
            blueprint.id
        );
        assert!(
            !blueprint.placement.surfaces.is_empty(),
            "surfaces for {}",
            blueprint.id
        );
        assert_eq!(
            blueprint.placement.surfaces.len(),
            blueprint.shape.length as usize,
            "one surface per footprint cell for {}",
            blueprint.id
        );
        assert!(
            !blueprint.asset.sprite.is_empty(),
            "sprite for {}",
            blueprint.id
        );
    }

    validate_catalog(&catalog).expect("the catalog fixture must validate");
}

#[test]
fn entity_catalog_blueprint_count_matches_the_catalog() {
    let root = fixture();
    let entities = root
        .get("entities")
        .and_then(|v| v.as_array())
        .expect("entities array");
    assert_eq!(entities.len(), 31, "the catalog carries 31 blueprints");
}

#[test]
fn entity_catalog_rejects_unsupported_schema() {
    let mut root = fixture();
    root.as_object_mut()
        .unwrap()
        .insert("schemaVersion".to_owned(), serde_json::Value::from(2));
    let catalog: iso::entities::EntityCatalog =
        serde_json::from_value(root).expect("serde deserializes a different schema version");
    let err = validate_catalog(&catalog).unwrap_err();
    assert!(matches!(
        err,
        iso::entities::CatalogError::UnsupportedSchema {
            found: 2,
            expected: 1
        }
    ));
}
