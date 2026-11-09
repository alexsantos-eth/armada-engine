use super::*;

#[test]
fn deserializes_the_versioned_blueprint_contract() {
    let blueprint: EntityBlueprintV2 = serde_json::from_value(serde_json::json!({
        "id": "oak",
        "asset": {
            "sprite": "/assets/tree/oak.svg",
            "reflection": "/assets/tree/oak-reflection.svg",
            "colorReplacements": { "trunk": "#523" },
            "contactShadow": true
        },
        "shape": {
            "height": 3,
            "length": 1,
            "collision": [1.0]
        },
        "placement": { "surfaces": ["grass"] }
    }))
    .expect("blueprint contract deserializes");

    assert_eq!(blueprint.shape.axis, EntityLengthAxis::X);
    assert_eq!(blueprint.asset.contact_shadow, Some(true));
    assert!(blueprint.asset.color_replacements.is_some());
    assert_eq!(blueprint.placement.surfaces, [TerrainMaterial::Grass]);
}

#[test]
fn serializes_catalog_schema_version_in_camel_case() {
    let catalog = EntityCatalogV2 {
        schema_version: 1,
        entities: Vec::new(),
    };
    let json = serde_json::to_value(catalog).expect("catalog serializes");

    assert_eq!(json["schemaVersion"], 1);
    assert!(json.get("schema_version").is_none());
}
