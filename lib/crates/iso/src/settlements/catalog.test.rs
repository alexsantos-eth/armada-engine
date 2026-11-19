use super::*;
use crate::entities::EntityCatalog;
use crate::entities::blueprint::*;
use crate::terrain::TerrainMaterial;

fn blueprint(id: &str) -> EntityBlueprint {
    EntityBlueprint {
        id: id.to_owned(),
        asset: EntityAsset {
            sprite: format!("/assets/{id}.svg"),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
            draw_under_player: false,
            fire: false,
        },
        shape: EntityShape {
            height: 1,
            length: 1,
            axis: EntityLengthAxis::X,
            collision: vec![1.0],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            additional_surfaces: vec![],
            road_access: false,
        },
    }
}

fn entities() -> EntityCatalog {
    EntityCatalog {
        schema_version: 1,
        entities: vec![
            blueprint("hut"),
            blueprint("mead_hall_x"),
            blueprint("mead_hall_y"),
            blueprint("tree"),
        ],
    }
}

fn wfc() -> crate::entities::wfc::WfcCatalog {
    let json = r#"{
      "schemaVersion": 2,
      "emptyWeight": 100.0,
      "weights": { "hut": 1.0, "mead_hall_x": 1.0, "mead_hall_y": 1.0, "tree": 1.0 },
      "families": { "mead_hall": ["mead_hall_x", "mead_hall_y"] }
    }"#;
    crate::entities::wfc::parse_wfc(json, &entities(), None).expect("fixture wfc validates")
}

fn content(zones: &str) -> String {
    format!(
        r#"{{
      "schemaVersion": 1,
      "spacing": 100,
      "chance": 0.5,
      "radius": {{ "min": 8.0, "max": 16.0 }},
      "wilderness": {{ "default": 1.0, "greens": 0.0, "weights": {{ "hut": 0.0 }} }},
      "greens": {{ "spacing": 5.0, "tight": 2.0, "near": 3.0, "far": 9.0, "front": 2,
                   "patio": {{ "chance": 0.75, "min": 2, "max": 4, "reach": 2, "groveChance": 0.3 }} }},
      "zones": {zones}
    }}"#
    )
}

fn one_zone() -> String {
    content(
        r#"[{ "id": "center", "seeds": 1, "ring": [0.0, 0.2], "pull": 0.1,
              "default": 0.0, "greens": 1.0,
              "weights": { "mead_hall": 40.0, "hut": 2.0 } }]"#,
    )
}

fn parse(json: &str) -> Result<SettlementCatalog, SettlementError> {
    parse_settlements(json, &entities(), &wfc())
}

#[test]
fn reads_the_field_shape_and_the_zones() {
    let catalog = parse(&one_zone()).expect("the fixture validates");
    assert_eq!(catalog.schema_version, SETTLEMENTS_SCHEMA_VERSION);
    assert_eq!(catalog.spacing, 100);
    assert_eq!(catalog.chance, 0.5);
    assert_eq!(catalog.radius_min, 8.0);
    assert_eq!(catalog.radius_max, 16.0);
    assert_eq!(catalog.zones.len(), 1);
    let zone = &catalog.zones[0];
    assert_eq!(zone.id, "center");
    assert_eq!(zone.seeds, 1);
    assert_eq!(zone.ring, (0.0, 0.2));
    assert_eq!(zone.pull, 0.1);
}

#[test]
fn resolves_a_family_key_onto_every_member_and_keeps_the_default_for_the_rest() {
    let catalog = parse(&one_zone()).expect("the fixture validates");
    let profile = &catalog.zones[0].profile;
    let order = &entities();
    let index = |id: &str| {
        order
            .entities
            .iter()
            .position(|blueprint| blueprint.id == id)
            .expect("fixture blueprint")
    };
    assert_eq!(profile.multiplier(index("mead_hall_x")), 40.0);
    assert_eq!(profile.multiplier(index("mead_hall_y")), 40.0);
    assert_eq!(profile.multiplier(index("hut")), 2.0);
    assert_eq!(profile.multiplier(index("tree")), 0.0);
    assert_eq!(profile.greens, 1.0);
}

#[test]
fn a_blueprint_key_wins_over_the_family_it_belongs_to() {
    let json = content(
        r#"[{ "id": "center", "seeds": 1, "ring": [0.0, 0.2], "pull": 0.0,
              "default": 0.0, "greens": 1.0,
              "weights": { "mead_hall": 40.0, "mead_hall_y": 1.0 } }]"#,
    );
    let catalog = parse(&json).expect("the fixture validates");
    let profile = &catalog.zones[0].profile;
    assert_eq!(profile.multiplier(0), 0.0);
    assert_eq!(profile.multiplier(1), 40.0);
    assert_eq!(profile.multiplier(2), 1.0);
}

#[test]
fn the_wilderness_profile_is_read_like_a_zone() {
    let catalog = parse(&one_zone()).expect("the fixture validates");
    assert_eq!(catalog.wilderness.multiplier(0), 0.0);
    assert_eq!(catalog.wilderness.multiplier(3), 1.0);
    assert_eq!(catalog.wilderness.greens, 0.0);
}

#[test]
fn rejects_unreadable_json() {
    assert!(matches!(parse("{"), Err(SettlementError::Json(_))));
}

#[test]
fn rejects_another_schema() {
    let json = one_zone().replace("\"schemaVersion\": 1", "\"schemaVersion\": 7");
    assert_eq!(
        parse(&json),
        Err(SettlementError::UnsupportedSchema {
            found: 7,
            expected: SETTLEMENTS_SCHEMA_VERSION,
        })
    );
}

#[test]
fn rejects_a_catalogue_without_zones() {
    assert_eq!(parse(&content("[]")), Err(SettlementError::NoZones));
}

#[test]
fn rejects_two_zones_sharing_an_id() {
    let json = content(
        r#"[{ "id": "center", "seeds": 1, "ring": [0.0, 0.2], "pull": 0.0,
              "default": 0.0, "greens": 1.0, "weights": {} },
            { "id": "center", "seeds": 1, "ring": [0.5, 0.9], "pull": 0.0,
              "default": 0.0, "greens": 1.0, "weights": {} }]"#,
    );
    assert_eq!(
        parse(&json),
        Err(SettlementError::DuplicateZone {
            id: "center".to_owned()
        })
    );
}

#[test]
fn rejects_an_empty_zone_id() {
    let json = one_zone().replace("\"center\"", "\"\"");
    assert_eq!(parse(&json), Err(SettlementError::EmptyZoneId));
}

#[test]
fn rejects_a_zone_with_no_seed() {
    let json = one_zone().replace("\"seeds\": 1", "\"seeds\": 0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidSeeds {
            zone: "center".to_owned(),
            found: 0,
        })
    );
}

#[test]
fn rejects_a_ring_outside_the_radius_or_turned_around() {
    let json = one_zone().replace("[0.0, 0.2]", "[0.6, 0.3]");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidRing {
            zone: "center".to_owned()
        })
    );
    let json = one_zone().replace("[0.0, 0.2]", "[0.0, 1.4]");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidRing {
            zone: "center".to_owned()
        })
    );
}

#[test]
fn rejects_a_negative_pull_or_coverage_or_default() {
    let json = one_zone().replace("\"pull\": 0.1", "\"pull\": -0.1");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidPull {
            zone: "center".to_owned()
        })
    );
    let json = one_zone().replace("\"greens\": 1.0", "\"greens\": -1.0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidGreens {
            zone: "center".to_owned()
        })
    );
    let json = one_zone().replace("\"default\": 0.0", "\"default\": -2.0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidDefault {
            zone: "center".to_owned()
        })
    );
}

#[test]
fn rejects_a_weight_that_is_not_a_finite_multiplier() {
    let json = one_zone().replace("\"hut\": 2.0", "\"hut\": -2.0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidMultiplier {
            zone: "center".to_owned(),
            key: "hut".to_owned(),
        })
    );
}

#[test]
fn rejects_a_weight_key_that_names_neither_a_blueprint_nor_a_family() {
    let json = one_zone().replace("\"hut\": 2.0", "\"longhouse\": 2.0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::UnknownKey {
            zone: "center".to_owned(),
            key: "longhouse".to_owned(),
        })
    );
}

#[test]
fn rejects_a_field_that_cannot_be_laid_out() {
    let json = one_zone().replace("\"spacing\": 100", "\"spacing\": 0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidSpacing { found: 0 })
    );
    let json = one_zone().replace("\"chance\": 0.5", "\"chance\": 1.5");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidChance { found: 1.5 })
    );
    let json = one_zone().replace("\"min\": 8.0", "\"min\": 20.0");
    assert_eq!(parse(&json), Err(SettlementError::InvalidRadius));
}

#[test]
fn rejects_a_spacing_that_lets_two_settlements_overlap() {
    let json = one_zone().replace("\"spacing\": 100", "\"spacing\": 20");
    assert_eq!(
        parse(&json),
        Err(SettlementError::SettlementsOverlap {
            spacing: 20,
            radius_max: 16.0,
        })
    );
}

#[test]
fn every_error_says_what_the_content_got_wrong() {
    let errors = [
        SettlementError::Json("eof".to_owned()),
        SettlementError::UnsupportedSchema {
            found: 2,
            expected: 1,
        },
        SettlementError::NoZones,
        SettlementError::EmptyZoneId,
        SettlementError::DuplicateZone { id: "a".to_owned() },
        SettlementError::InvalidSpacing { found: -1 },
        SettlementError::InvalidChance { found: 0.0 },
        SettlementError::InvalidRadius,
        SettlementError::SettlementsOverlap {
            spacing: 4,
            radius_max: 9.0,
        },
        SettlementError::InvalidSeeds {
            zone: "a".to_owned(),
            found: 0,
        },
        SettlementError::InvalidRing {
            zone: "a".to_owned(),
        },
        SettlementError::InvalidPull {
            zone: "a".to_owned(),
        },
        SettlementError::InvalidGreens {
            zone: "a".to_owned(),
        },
        SettlementError::InvalidGreensRules,
        SettlementError::InvalidPatio,
        SettlementError::InvalidDefault {
            zone: "a".to_owned(),
        },
        SettlementError::InvalidMultiplier {
            zone: "a".to_owned(),
            key: "b".to_owned(),
        },
        SettlementError::UnknownKey {
            zone: "a".to_owned(),
            key: "b".to_owned(),
        },
    ];
    for error in errors {
        assert!(!error.to_string().is_empty());
    }
}

#[test]
fn reads_how_the_greenery_clusters() {
    let catalog = parse(&one_zone()).expect("the fixture validates");
    assert_eq!(catalog.greens.spacing, 5.0);
    assert_eq!(catalog.greens.tight, 2.0);
    assert_eq!(catalog.greens.near, 3.0);
    assert_eq!(catalog.greens.far, 9.0);
    assert_eq!(catalog.greens.front, 2);
    assert_eq!(catalog.greens.patio.chance, 0.75);
    assert_eq!(catalog.greens.patio.min, 2);
    assert_eq!(catalog.greens.patio.max, 4);
    assert_eq!(catalog.greens.patio.reach, 2);
    assert_eq!(catalog.greens.patio.grove_chance, 0.3);
}

#[test]
fn rejects_greenery_rules_that_do_not_read_as_distances() {
    let json = one_zone().replace("\"tight\": 2.0", "\"tight\": 9.0");
    assert_eq!(parse(&json), Err(SettlementError::InvalidGreensRules));
    let json = one_zone().replace("\"near\": 3.0", "\"near\": 12.0");
    assert_eq!(parse(&json), Err(SettlementError::InvalidGreensRules));
    let json = one_zone().replace("\"front\": 2", "\"front\": -1");
    assert_eq!(parse(&json), Err(SettlementError::InvalidGreensRules));
}

#[test]
fn rejects_a_patio_that_could_never_be_planted() {
    let json = one_zone().replace("\"chance\": 0.75", "\"chance\": 1.5");
    assert_eq!(parse(&json), Err(SettlementError::InvalidPatio));
    let json = one_zone().replace("\"min\": 2", "\"min\": 9");
    assert_eq!(parse(&json), Err(SettlementError::InvalidPatio));
    let json = one_zone().replace("\"reach\": 2", "\"reach\": 0");
    assert_eq!(parse(&json), Err(SettlementError::InvalidPatio));
}
