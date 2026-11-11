//! Tests for the WFC content catalog and the clumped solver itself.

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
            height: 1,
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
            "tree",
            "tree_3",
            "house",
            "bush",
            "large_rock",
            "pier_x_reverse",
        ]
        .into_iter()
        .map(blueprint)
        .collect(),
    }
}

fn biomes() -> crate::biomes::catalog::BiomeCatalog {
    crate::biomes::catalog::parse_biomes(
        r#"{
            "schemaVersion": 1,
            "biomes": [
                { "id": "temperate_forest", "share": 50.0, "treeCoverage": 0.35,
                  "trees": [
                      { "blueprint": "tree", "weight": 100.0 }
                  ],
                  "grassTints": ["bfd5bd"], "groundTints": ["fffbea"] },
                { "id": "taiga", "share": 50.0, "treeCoverage": 0.35,
                  "trees": [
                      { "blueprint": "tree_3", "weight": 100.0 }
                  ],
                  "grassTints": ["8fa884"], "groundTints": ["8f8878"] }
            ]
        }"#,
        &entities(),
    )
    .expect("valid biomes")
}

fn wfc_json() -> &'static str {
    r#"{
        "schemaVersion": 2,
        "emptyWeight": 380.0,
        "weights": {
            "house": 1.0,
            "bush": 1.0,
            "large_rock": 1.0,
            "pier_x_reverse": 1.0
        }
    }"#
}

#[test]
fn parses_a_valid_catalog() {
    let parsed = parse_wfc(wfc_json(), &entities(), Some(&biomes())).expect("valid wfc content");
    assert_eq!(parsed.schema_version, WFC_SCHEMA_VERSION);
    assert_eq!(parsed.empty_weight, 380.0);
    assert_eq!(parsed.weight_of("house"), 1.0);
    assert_eq!(parsed.weight_of("bush"), 1.0);
    assert_eq!(
        parsed.weight_of("tree"),
        0.0,
        "biome trees never grow via wfc"
    );
}

#[test]
fn rejects_an_unsupported_schema_version() {
    let json = wfc_json().replace("\"schemaVersion\": 2", "\"schemaVersion\": 3");
    let error = parse_wfc(&json, &entities(), Some(&biomes())).unwrap_err();
    assert_eq!(
        error,
        WfcError::UnsupportedSchema {
            found: 3,
            expected: WFC_SCHEMA_VERSION,
        }
    );
}

#[test]
fn rejects_malformed_json() {
    let error = parse_wfc("{ nope", &entities(), Some(&biomes())).unwrap_err();
    assert!(matches!(error, WfcError::Json(_)));
}

#[test]
fn rejects_a_non_positive_empty_weight() {
    for empty in [0.0, -1.0] {
        let json = format!(
            r#"{{ "schemaVersion": 2, "emptyWeight": {empty}, "weights": {{ "house": 1.0 }} }}"#
        );
        let error = parse_wfc(&json, &entities(), None).unwrap_err();
        assert_eq!(error, WfcError::InvalidEmptyWeight { found: empty });
    }
}

#[test]
fn rejects_a_non_positive_weight() {
    for weight in [0.0, -2.0] {
        let json = format!(
            r#"{{ "schemaVersion": 2, "emptyWeight": 380.0, "weights": {{ "house": {weight} }} }}"#
        );
        let error = parse_wfc(&json, &entities(), None).unwrap_err();
        assert_eq!(
            error,
            WfcError::InvalidWeight {
                blueprint: "house".to_owned(),
            }
        );
    }
}

#[test]
fn rejects_a_blueprint_the_entity_catalog_does_not_have() {
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 380.0,
        "weights": { "castle": 1.0 }
    }"#;
    let error = parse_wfc(json, &entities(), None).unwrap_err();
    assert_eq!(
        error,
        WfcError::UnknownBlueprint {
            blueprint: "castle".to_owned(),
        }
    );
}

/// A blueprint no biome claims must appear in the wfc weights, or it silently stops growing.
#[test]
fn rejects_a_missing_weight_for_a_blueprint_no_biome_claims() {
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 380.0,
        "weights": { "house": 1.0 }
    }"#;
    let error = parse_wfc(json, &entities(), Some(&biomes())).unwrap_err();
    assert_eq!(
        error,
        WfcError::MissingBlueprint {
            blueprint: "bush".to_owned(),
        }
    );
}

/// With no biomes given there is nothing to exclude, so the completeness check cannot run.
#[test]
fn accepts_a_partial_catalog_without_biomes() {
    let parsed = parse_wfc(wfc_json(), &entities(), None).expect("valid wfc content");
    assert_eq!(parsed.weights.len(), 4);
}

fn column(x: i32, y: i32, surface: TerrainMaterial, elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: crate::grid::WorldCoord { x, y },
        elevation,
        surface,
        walkable: surface != TerrainMaterial::Water,
    }
}

fn grass_columns(side: i32) -> Vec<TerrainColumn> {
    (0..side)
        .flat_map(|x| (0..side).map(move |y| column(x, y, TerrainMaterial::Grass, 0)))
        .collect()
}

fn grassy_wfc() -> (EntityCatalog, crate::biomes::catalog::BiomeCatalog) {
    (entities(), biomes())
}

fn claimed_tree_mask(entities: &EntityCatalog) -> Vec<bool> {
    entities
        .entities
        .iter()
        .map(|bp| matches!(bp.id.as_str(), "tree" | "tree_3"))
        .collect()
}

fn parsed(json: &str) -> WfcCatalog {
    let (entities, _) = grassy_wfc();
    parse_wfc(json, &entities, None).expect("valid wfc content")
}

#[test]
fn the_solver_only_grows_eligible_blueprints() {
    let (entities, _) = grassy_wfc();
    let biomes = biomes();
    let wfc = parse_wfc(wfc_json(), &entities, Some(&biomes)).expect("valid wfc content");
    let claimed = claimed_tree_mask(&entities);
    let columns = grass_columns(24);
    let mut placed = crate::grid::SpatialIndex::new();
    let grown = solve_chunk(&columns, &entities, &wfc, &claimed, &mut placed, 99);
    assert!(!grown.is_empty(), "the chunk must grow something");
    for entity in &grown {
        assert!(
            matches!(
                entity.type_(),
                "house" | "bush" | "large_rock" | "pier_x_reverse"
            ),
            "biome-claimed or unknown blueprint {} grew",
            entity.type_()
        );
        let anchor = columns
            .iter()
            .find(|c| c.coord.x == entity.x() && c.coord.y == entity.y());
        assert_eq!(anchor.map(|c| c.surface), Some(TerrainMaterial::Grass));
    }
}

#[test]
fn the_solver_is_deterministic() {
    let (entities, _) = grassy_wfc();
    let wfc = parsed(wfc_json());
    let claimed = claimed_tree_mask(&entities);
    let columns = grass_columns(24);
    let first = solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed,
        &mut crate::grid::SpatialIndex::new(),
        99,
    );
    let second = solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed,
        &mut crate::grid::SpatialIndex::new(),
        99,
    );
    let ids: Vec<_> = first.iter().map(|e| e.id()).collect();
    let ids_again: Vec<_> = second.iter().map(|e| e.id()).collect();
    assert_eq!(ids, ids_again);
    let other = solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed,
        &mut crate::grid::SpatialIndex::new(),
        100,
    );
    let ids_other: Vec<_> = other.iter().map(|e| e.id()).collect();
    assert_ne!(ids, ids_other);
}

#[test]
fn the_solver_keeps_same_type_instances_apart() {
    let (entities, _) = grassy_wfc();
    let wfc = parsed(wfc_json());
    let claimed = claimed_tree_mask(&entities);
    let columns = grass_columns(24);
    let grown = solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed,
        &mut crate::grid::SpatialIndex::new(),
        7,
    );
    for a in &grown {
        for b in &grown {
            if a.id() == b.id() {
                continue;
            }
            let apart = (a.x() - b.x()).abs().max((a.y() - b.y()).abs());
            assert!(apart > 1, "{} and {} touch", a.id(), b.id());
        }
    }
}

/// An entity the biome pass already placed blocks any wfc anchor whose footprint would cover it.
#[test]
fn the_solver_never_overlaps_entities_already_placed() {
    let (entities, _) = grassy_wfc();
    let wfc = parsed(wfc_json());
    let claimed = claimed_tree_mask(&entities);
    let columns = grass_columns(16);
    let mut placed = crate::grid::SpatialIndex::new();
    let rock = crate::entities::Entity::new(
        5,
        5,
        entities
            .entities
            .iter()
            .find(|bp| bp.id == "large_rock")
            .unwrap(),
        0,
    );
    let footprint = crate::entities::get_entity_footprint(
        crate::grid::WorldCoord { x: 5, y: 5 },
        1,
        EntityLengthAxis::X,
    );
    assert!(placed.insert(rock, &footprint).is_ok());
    let grown = solve_chunk(&columns, &entities, &wfc, &claimed, &mut placed, 11);
    for entity in &grown {
        assert!(
            !(entity.x() == 5 && entity.y() == 5),
            "an entity grew on top of the rock at (5, 5)"
        );
    }
}

#[test]
fn a_huge_empty_weight_grows_nothing() {
    let (entities, _) = grassy_wfc();
    let wfc = parsed(
        r#"{ "schemaVersion": 2, "emptyWeight": 1000000000.0, "weights": { "house": 1.0 } }"#,
    );
    let claimed = claimed_tree_mask(&entities);
    let columns = grass_columns(16);
    let grown = solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed,
        &mut crate::grid::SpatialIndex::new(),
        3,
    );
    assert!(grown.is_empty());
}

/// A pier grows only at a water edge with the footprint it is allowed to span.
#[test]
fn a_pier_grows_at_the_water_edge() {
    let (_, _) = grassy_wfc();
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 0.001,
        "weights": { "pier_x_reverse": 1.0 }
    }"#;
    let entities = EntityCatalog {
        schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
        entities: vec![EntityBlueprint {
            id: "pier_x_reverse".to_owned(),
            asset: EntityAsset {
                sprite: "/assets/pier/block_1x3_over_water.svg".to_owned(),
                reflection: None,
                color_replacements: None,
                sway: None,
                contact_shadow: None,
            },
            shape: EntityShape {
                height: 1,
                length: 3,
                axis: EntityLengthAxis::X,
                collision: vec![1.0, 1.0, 1.0],
            },
            placement: EntityPlacement {
                surfaces: vec![
                    TerrainMaterial::Water,
                    TerrainMaterial::Sand,
                    TerrainMaterial::Grass,
                ],
                road_access: false,
            },
        }],
    };
    let wfc = parse_wfc(json, &entities, None).expect("valid wfc content");
    let claimed = vec![false];
    let mut columns = Vec::new();
    for y in 0..24 {
        for x in 0..24 {
            let surface = if x == 0 {
                TerrainMaterial::Water
            } else if x == 1 {
                TerrainMaterial::Sand
            } else {
                TerrainMaterial::Grass
            };
            columns.push(column(x, y, surface, if x == 0 { -1 } else { 0 }));
        }
    }
    let grown = solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed,
        &mut crate::grid::SpatialIndex::new(),
        42,
    );
    assert!(
        grown.iter().any(|e| e.type_() == "pier_x_reverse"),
        "the pier must grow at the water edge"
    );
    for pier in grown.iter().filter(|e| e.type_() == "pier_x_reverse") {
        assert_eq!(pier.x(), 0, "the pier anchors on the water");
    }
}

#[test]
fn rejects_a_max_per_chunk_key_that_matches_nothing() {
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 380.0,
        "weights": { "house": 1.0 },
        "maxPerChunk": { "castle": 1 }
    }"#;
    let error = parse_wfc(json, &entities(), None).unwrap_err();
    assert_eq!(
        error,
        WfcError::UnknownCapKey {
            key: "castle".to_owned(),
        }
    );
}

#[test]
fn rejects_a_max_per_chunk_below_one() {
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 380.0,
        "weights": { "house": 1.0 },
        "maxPerChunk": { "house": 0 }
    }"#;
    let error = parse_wfc(json, &entities(), None).unwrap_err();
    assert_eq!(
        error,
        WfcError::InvalidCap {
            key: "house".to_owned(),
            found: 0.0,
        }
    );
}

#[test]
fn rejects_a_family_with_an_unknown_member() {
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 380.0,
        "weights": { "house": 1.0 },
        "families": { "office": ["house", "bush", "spaceship"] }
    }"#;
    let error = parse_wfc(json, &entities(), None).unwrap_err();
    assert_eq!(
        error,
        WfcError::UnknownBlueprint {
            blueprint: "spaceship".to_owned(),
        }
    );
}

#[test]
fn rejects_a_blueprint_in_two_families() {
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 380.0,
        "weights": { "house": 1.0 },
        "families": { "a": ["house"], "b": ["house"] }
    }"#;
    let error = parse_wfc(json, &entities(), None).unwrap_err();
    assert_eq!(
        error,
        WfcError::BlueprintInTwoFamilies {
            blueprint: "house".to_owned(),
            first: "a".to_owned(),
            second: "b".to_owned(),
        }
    );
}

#[test]
fn the_solver_respects_max_per_chunk_across_a_family() {
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 0.5,
        "weights": {
            "house": 100.0,
            "bush": 1.0
        },
        "families": { "office": ["house"] },
        "maxPerChunk": { "office": 2, "bush": 1 }
    }"#;
    let wfc = parsed2(json);
    let columns = grass_columns(24);
    let grown = solve_chunk(
        &columns,
        &entities(),
        &wfc,
        &claimed_tree_mask(&entities()),
        &mut crate::grid::SpatialIndex::new(),
        5,
    );
    let houses = grown.iter().filter(|e| e.type_() == "house").count();
    let bushes = grown.iter().filter(|e| e.type_() == "bush").count();
    assert_eq!(
        houses, 2,
        "the family cap must stop more houses from growing"
    );
    assert_eq!(bushes, 1, "the solo cap must stop more bushes from growing");
}

#[test]
fn the_solver_respects_a_solo_blueprint_cap() {
    let json = r#"{
        "schemaVersion": 2,
        "emptyWeight": 0.5,
        "weights": {
            "house": 100.0,
            "large_rock": 1.0
        },
        "maxPerChunk": { "house": 3 }
    }"#;
    let entities = entities();
    let wfc = parse_wfc(json, &entities, None).expect("valid wfc content");
    let columns = grass_columns(16);
    let grown = solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed_tree_mask(&entities),
        &mut crate::grid::SpatialIndex::new(),
        9,
    );
    let houses = grown.iter().filter(|e| e.type_() == "house").count();
    assert_eq!(houses, 3);
}
fn parsed2(json: &str) -> WfcCatalog {
    let entities = entities();
    parse_wfc(json, &entities, None).expect("valid wfc content")
}
