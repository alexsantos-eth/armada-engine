//! Tests for the biome catalog: parsing, cross-validation against the entity catalog and errors.

use super::*;
use crate::entities::EntityCatalog;
use crate::entities::blueprint::*;
use crate::terrain::TerrainMaterial;

fn entities() -> EntityCatalog {
    let blueprint = |id: &str| EntityBlueprint {
        id: id.to_owned(),
        asset: EntityAsset {
            sprite: format!("/assets/{id}.svg"),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
        },
        shape: EntityShape {
            height: 2,
            length: 1,
            axis: EntityLengthAxis::X,
            collision: vec![0.15],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            road_access: false,
        },
    };
    EntityCatalog {
        schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
        entities: [
            "tree", "tree_2", "tree_3", "tree_4", "tree_5", "tree_6", "tree_7", "tree_8",
        ]
        .into_iter()
        .map(blueprint)
        .collect(),
    }
}

fn catalog_json() -> &'static str {
    r#"{
        "schemaVersion": 1,
        "biomes": [
            {
                "id": "temperate_forest",
                "share": 35.0,
                "treeCoverage": 0.03,
                "trees": [
                    { "blueprint": "tree", "weight": 30.0 },
                    { "blueprint": "tree_2", "weight": 30.0 }
                ],
                "grassTints": ["bfd5bd", "dde9d4", "ffffff", "fff0c0", "ffe49c"],
                "groundTints": ["ffffff", "fffbea", "f4f9df", "f2f5d6", "f2f5d6"]
            },
            {
                "id": "taiga",
                "share": 25.0,
                "treeCoverage": 0.036,
                "trees": [
                    { "blueprint": "tree_3", "weight": 60.0 }
                ],
                "grassTints": ["8fa884", "a9bda0", "c8d4b6", "cfdcc4", "dde5cd"],
                "groundTints": ["8f8878", "a49d8d", "b8b1a1", "cfc9ba", "e2ddd2"]
            }
        ]
    }"#
}

#[test]
fn parses_a_valid_catalog() {
    let parsed = parse_biomes(catalog_json(), &entities()).expect("valid biomes");
    assert_eq!(parsed.schema_version, BIOMES_SCHEMA_VERSION);
    assert_eq!(parsed.biomes.len(), 2);
    let temperate = &parsed.biomes[0];
    assert_eq!(temperate.id, "temperate_forest");
    assert_eq!(temperate.share, 35.0);
    assert_eq!(temperate.tree_coverage, 0.03);
    assert_eq!(temperate.trees.len(), 2);
    assert_eq!(temperate.trees[0].blueprint, "tree");
    assert_eq!(temperate.grass_tints[0], 0x00bf_d5bd);
    assert_eq!(temperate.ground_tints[0], 0x00ff_ffff);
}

#[test]
fn rejects_an_unsupported_schema_version() {
    let json = catalog_json().replace("\"schemaVersion\": 1", "\"schemaVersion\": 2");
    let error = parse_biomes(&json, &entities()).unwrap_err();
    assert_eq!(
        error,
        BiomeError::UnsupportedSchema {
            found: 2,
            expected: BIOMES_SCHEMA_VERSION,
        }
    );
}

#[test]
fn rejects_malformed_json_with_context() {
    let error = parse_biomes("{ not json", &entities()).unwrap_err();
    assert!(matches!(error, BiomeError::Json(_)));
}

#[test]
fn rejects_an_empty_catalog() {
    let error = parse_biomes(r#"{ "schemaVersion": 1, "biomes": [] }"#, &entities()).unwrap_err();
    assert_eq!(error, BiomeError::NoBiomes);
}

#[test]
fn rejects_duplicate_biome_ids() {
    let json = r#"{
        "schemaVersion": 1,
        "biomes": [
            { "id": "a", "share": 1.0, "treeCoverage": 0.03, "trees": [],
              "grassTints": ["ffffff"], "groundTints": ["ffffff"] },
            { "id": "a", "share": 1.0, "treeCoverage": 0.03, "trees": [],
              "grassTints": ["ffffff"], "groundTints": ["ffffff"] }
        ]
    }"#;
    let error = parse_biomes(json, &entities()).unwrap_err();
    assert_eq!(error, BiomeError::DuplicateId { id: "a".to_owned() });
}

#[test]
fn rejects_non_finite_or_zero_shares() {
    for share in [0.0, -1.0] {
        let json = format!(
            r#"{{ "schemaVersion": 1, "biomes": [
                {{ "id": "a", "share": {share}, "treeCoverage": 0.03, "trees": [],
                   "grassTints": ["ffffff"], "groundTints": ["ffffff"] }}
            ] }}"#
        );
        let error = parse_biomes(&json, &entities()).unwrap_err();
        assert_eq!(
            error,
            BiomeError::InvalidShare { id: "a".to_owned() },
            "share {share} must be rejected"
        );
    }
}

#[test]
fn rejects_out_of_range_tree_coverage() {
    for coverage in [-0.1, 0.0, 1.5] {
        let json = format!(
            r#"{{ "schemaVersion": 1, "biomes": [
                {{ "id": "a", "share": 1.0, "treeCoverage": {coverage}, "trees": [],
                   "grassTints": ["ffffff"], "groundTints": ["ffffff"] }}
            ] }}"#
        );
        let error = parse_biomes(&json, &entities()).unwrap_err();
        assert_eq!(
            error,
            BiomeError::InvalidTreeCoverage { id: "a".to_owned() },
            "coverage {coverage} must be rejected"
        );
    }
}

#[test]
fn rejects_non_positive_or_non_finite_weights() {
    for weight in [0.0, -2.0] {
        let json = format!(
            r#"{{ "schemaVersion": 1, "biomes": [
                {{ "id": "a", "share": 1.0, "treeCoverage": 0.03,
                   "trees": [ {{ "blueprint": "tree", "weight": {weight} }} ],
                   "grassTints": ["ffffff"], "groundTints": ["ffffff"] }}
            ] }}"#
        );
        let error = parse_biomes(&json, &entities()).unwrap_err();
        assert_eq!(
            error,
            BiomeError::InvalidWeight {
                biome: "a".to_owned(),
                blueprint: "tree".to_owned(),
            }
        );
    }
}

#[test]
fn rejects_a_blueprint_that_the_entity_catalog_does_not_have() {
    let json = r#"{
        "schemaVersion": 1,
        "biomes": [
            { "id": "a", "share": 1.0, "treeCoverage": 0.03,
              "trees": [ { "blueprint": "baobab", "weight": 1.0 } ],
              "grassTints": ["ffffff"], "groundTints": ["ffffff"] }
        ]
    }"#;
    let error = parse_biomes(json, &entities()).unwrap_err();
    assert_eq!(
        error,
        BiomeError::UnknownBlueprint {
            biome: "a".to_owned(),
            blueprint: "baobab".to_owned(),
        }
    );
}

#[test]
fn rejects_invalid_hex_colours() {
    for value in ["xyz", "ffff", "1000000", ""] {
        let json = format!(
            r#"{{ "schemaVersion": 1, "biomes": [
                {{ "id": "a", "share": 1.0, "treeCoverage": 0.03, "trees": [],
                   "grassTints": ["{value}"], "groundTints": ["ffffff"] }}
            ] }}"#
        );
        let error = parse_biomes(&json, &entities()).unwrap_err();
        assert!(
            matches!(error, BiomeError::InvalidColor { .. }),
            "colour {value:?} must be rejected"
        );
    }
}

#[test]
fn parses_wind_strength_and_defaults_it_to_one() {
    let parsed = parse_biomes(catalog_json(), &entities()).expect("valid biomes");
    assert_eq!(
        parsed.biomes[0].wind_strength, 1.0,
        "undeclared defaults to 1"
    );

    let json = catalog_json().replace(
        "\"treeCoverage\": 0.03,",
        "\"treeCoverage\": 0.03, \"windStrength\": 2.5,",
    );
    let parsed = parse_biomes(&json, &entities()).expect("valid biomes");
    assert_eq!(parsed.biomes[0].wind_strength, 2.5);
    assert_eq!(
        parsed.biomes[1].wind_strength, 1.0,
        "the other biome keeps the default"
    );
}

#[test]
fn rejects_a_negative_wind_strength() {
    let json = catalog_json().replace(
        "\"treeCoverage\": 0.03,",
        "\"treeCoverage\": 0.03, \"windStrength\": -0.5,",
    );
    let error = parse_biomes(&json, &entities()).unwrap_err();
    assert_eq!(
        error,
        BiomeError::InvalidWindStrength {
            id: "temperate_forest".to_owned(),
        }
    );
}

#[test]
fn a_zero_wind_strength_is_a_biome_with_still_air() {
    let json = catalog_json().replace(
        "\"treeCoverage\": 0.03,",
        "\"treeCoverage\": 0.03, \"windStrength\": 0.0,",
    );
    let parsed = parse_biomes(&json, &entities()).expect("a still biome is valid");
    assert_eq!(parsed.biomes[0].wind_strength, 0.0);
}
