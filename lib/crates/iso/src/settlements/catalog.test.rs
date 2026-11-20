use super::*;
use crate::entities::EntityCatalog;
use crate::entities::blueprint::*;
use crate::terrain::TerrainMaterial;

fn blueprint(id: &str) -> EntityBlueprint {
    EntityBlueprint {
        npc: None,
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
      "schemaVersion": 2,
      "spacing": 100,
      "chance": 0.5,
      "layout": {{ "blocks": {{ "min": 3, "max": 4 }}, "block": 5, "street": 1, "edge": 2,
                   "exit": 4, "trim": 0.25, "frontPark": 0.5, "lots": {{ "min": 1, "max": 2 }} }},
      "wilderness": {{ "default": 1.0, "greens": 0.0, "weights": {{ "hut": 0.0 }} }},
      "greens": {{ "spacing": 5.0, "tight": 2.0, "near": 3.0, "far": 9.0, "front": 2,
                   "patio": {{ "chance": 0.75, "min": 2, "max": 5, "reach": 2, "groveChance": 0.3 }} }},
      "zones": {zones}
    }}"#
    )
}

const CENTER: &str = r#"{ "id": "center", "role": "center", "default": 0.0, "greens": 1.0,
      "weights": { "mead_hall": 40.0, "hut": 2.0 }, "lots": { "mead_hall": 1.0 } }"#;
const HOMES: &str = r#"{ "id": "homes", "role": "residential", "share": 3.0, "greens": 0.5,
      "lots": { "hut": 1.0 } }"#;
const PARK: &str = r#"{ "id": "park", "role": "park", "share": 1.0, "greens": 1.5,
      "weights": { "tree": 2.0 } }"#;
const EDGE: &str = r#"{ "id": "edge", "role": "edge", "greens": 0.8 }"#;
const STREET: &str = r#"{ "id": "street", "role": "street" }"#;

fn zones_json(zones: &[&str]) -> String {
    format!("[{}]", zones.join(", "))
}

fn every_role() -> String {
    content(&zones_json(&[CENTER, HOMES, PARK, EDGE, STREET]))
}

fn parse(json: &str) -> Result<SettlementCatalog, SettlementError> {
    parse_settlements(json, &entities(), &wfc())
}

fn index(id: &str) -> usize {
    entities()
        .entities
        .iter()
        .position(|blueprint| blueprint.id == id)
        .expect("fixture blueprint")
}

#[test]
fn reads_the_field_and_the_block_layout() {
    let catalog = parse(&every_role()).expect("the fixture validates");
    assert_eq!(catalog.schema_version, SETTLEMENTS_SCHEMA_VERSION);
    assert_eq!(catalog.spacing, 100);
    assert_eq!(catalog.chance, 0.5);
    let layout = catalog.layout;
    assert_eq!((layout.blocks_min, layout.blocks_max), (3, 4));
    assert_eq!((layout.block, layout.street), (5, 1));
    assert_eq!((layout.edge, layout.exit), (2, 4));
    assert_eq!(layout.trim, 0.25);
    assert_eq!(layout.front_park, 0.5);
    assert_eq!((layout.lots_min, layout.lots_max), (1, 2));
    assert_eq!(layout.pitch(), 6);
}

#[test]
fn the_widest_settlement_spans_its_blocks_streets_and_the_wider_of_edge_and_exit() {
    let catalog = parse(&every_role()).expect("the fixture validates");
    assert_eq!(catalog.layout.margin(), 4);
    assert_eq!(catalog.layout.max_extent(), 4 * 6 + 1 + 2 * 4);
}

#[test]
fn reads_every_zone_with_its_role_and_share() {
    let catalog = parse(&every_role()).expect("the fixture validates");
    let ids: Vec<_> = catalog.zones.iter().map(|zone| zone.id.as_str()).collect();
    assert_eq!(ids, ["center", "homes", "park", "edge", "street"]);
    let roles: Vec<_> = catalog.zones.iter().map(|zone| zone.role).collect();
    assert_eq!(
        roles,
        [
            ZoneRole::Center,
            ZoneRole::Residential,
            ZoneRole::Park,
            ZoneRole::Edge,
            ZoneRole::Street
        ]
    );
    assert_eq!(catalog.zones[1].share, 3.0);
    assert_eq!(catalog.zones[2].share, 1.0);
    assert_eq!(catalog.zone_of(ZoneRole::Center), 0);
    assert_eq!(catalog.zone_of(ZoneRole::Edge), 3);
    assert_eq!(catalog.zone_of(ZoneRole::Street), 4);
}

#[test]
fn resolves_a_family_key_onto_every_member_and_keeps_the_default_for_the_rest() {
    let catalog = parse(&every_role()).expect("the fixture validates");
    let profile = &catalog.zones[0].profile;
    assert_eq!(profile.multiplier(index("mead_hall_x")), 40.0);
    assert_eq!(profile.multiplier(index("mead_hall_y")), 40.0);
    assert_eq!(profile.multiplier(index("hut")), 2.0);
    assert_eq!(profile.multiplier(index("tree")), 0.0);
    assert_eq!(profile.greens, 1.0);
}

#[test]
fn reads_the_buildings_each_zone_raises_on_its_lots() {
    let catalog = parse(&every_role()).expect("the fixture validates");
    let centre = &catalog.zones[0].profile;
    assert_eq!(centre.lot(index("mead_hall_x")), 1.0);
    assert_eq!(centre.lot(index("mead_hall_y")), 1.0);
    assert_eq!(centre.lot(index("hut")), 0.0);
    let homes = &catalog.zones[1].profile;
    assert_eq!(homes.lot(index("hut")), 1.0);
    assert_eq!(homes.multiplier(index("hut")), 0.0);
    assert_eq!(catalog.zones[2].profile.lot(index("hut")), 0.0);
}

#[test]
fn a_blueprint_key_wins_over_the_family_it_belongs_to() {
    let centre = r#"{ "id": "center", "role": "center", "greens": 1.0,
          "weights": { "mead_hall": 40.0, "mead_hall_y": 1.0 } }"#;
    let catalog = parse(&content(&zones_json(&[centre, HOMES, PARK, EDGE, STREET])))
        .expect("the fixture validates");
    let profile = &catalog.zones[0].profile;
    assert_eq!(profile.multiplier(0), 0.0);
    assert_eq!(profile.multiplier(1), 40.0);
    assert_eq!(profile.multiplier(2), 1.0);
}

#[test]
fn the_wilderness_profile_is_read_like_a_zone() {
    let catalog = parse(&every_role()).expect("the fixture validates");
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
    let json = every_role().replace("\"schemaVersion\": 2", "\"schemaVersion\": 7");
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
    let twin = PARK.replace("\"park\", \"role\"", "\"homes\", \"role\"");
    let json = content(&zones_json(&[CENTER, HOMES, &twin, EDGE, STREET]));
    assert_eq!(
        parse(&json),
        Err(SettlementError::DuplicateZone {
            id: "homes".to_owned()
        })
    );
}

#[test]
fn rejects_an_empty_zone_id() {
    let json = every_role().replace("\"center\", \"role\"", "\"\", \"role\"");
    assert_eq!(parse(&json), Err(SettlementError::EmptyZoneId));
}

#[test]
fn rejects_a_role_that_is_missing_or_declared_twice() {
    let json = content(&zones_json(&[CENTER, HOMES, PARK, EDGE]));
    assert_eq!(
        parse(&json),
        Err(SettlementError::MissingRole {
            role: ZoneRole::Street
        })
    );
    let json = content(&zones_json(&[CENTER, HOMES, EDGE, STREET]));
    assert_eq!(
        parse(&json),
        Err(SettlementError::MissingRole {
            role: ZoneRole::Park
        })
    );
    let second = EDGE.replace("\"edge\", \"role\"", "\"rim\", \"role\"");
    let json = content(&zones_json(&[CENTER, HOMES, PARK, EDGE, &second, STREET]));
    assert_eq!(
        parse(&json),
        Err(SettlementError::DuplicateRole {
            role: ZoneRole::Edge
        })
    );
}

#[test]
fn a_second_residential_or_park_zone_shares_the_blocks() {
    let more = HOMES.replace("\"homes\", \"role\"", "\"farms\", \"role\"");
    let json = content(&zones_json(&[CENTER, HOMES, &more, PARK, EDGE, STREET]));
    let catalog = parse(&json).expect("two residential zones validate");
    assert_eq!(catalog.zones.len(), 6);
}

#[test]
fn rejects_an_unknown_role() {
    let json = every_role().replace("\"role\": \"park\"", "\"role\": \"harbour\"");
    assert!(matches!(parse(&json), Err(SettlementError::Json(_))));
}

#[test]
fn rejects_a_negative_share_greens_or_default() {
    let json = every_role().replace("\"share\": 3.0", "\"share\": -3.0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidShare {
            zone: "homes".to_owned()
        })
    );
    let json = every_role().replace("\"greens\": 1.0", "\"greens\": -1.0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidGreens {
            zone: "center".to_owned()
        })
    );
    let json = every_role().replace("\"default\": 0.0", "\"default\": -2.0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidDefault {
            zone: "center".to_owned()
        })
    );
}

#[test]
fn rejects_a_weight_or_lot_that_is_not_a_finite_multiplier() {
    let json = every_role().replace("\"hut\": 2.0", "\"hut\": -2.0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidMultiplier {
            zone: "center".to_owned(),
            key: "hut".to_owned(),
        })
    );
    let json = every_role().replace("\"lots\": { \"hut\": 1.0 }", "\"lots\": { \"hut\": -1.0 }");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidMultiplier {
            zone: "homes".to_owned(),
            key: "hut".to_owned(),
        })
    );
}

#[test]
fn rejects_a_weight_key_that_names_neither_a_blueprint_nor_a_family() {
    let json = every_role().replace("\"hut\": 2.0", "\"longhouse\": 2.0");
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
    let json = every_role().replace("\"spacing\": 100", "\"spacing\": 0");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidSpacing { found: 0 })
    );
    let json = every_role().replace("\"chance\": 0.5", "\"chance\": 1.5");
    assert_eq!(
        parse(&json),
        Err(SettlementError::InvalidChance { found: 1.5 })
    );
}

#[test]
fn rejects_a_block_layout_that_cannot_hold_a_lot() {
    for (from, to) in [
        ("\"min\": 3, \"max\": 4", "\"min\": 0, \"max\": 4"),
        ("\"min\": 3, \"max\": 4", "\"min\": 5, \"max\": 4"),
        ("\"block\": 5", "\"block\": 2"),
        ("\"street\": 1", "\"street\": 0"),
        ("\"edge\": 2", "\"edge\": -1"),
        ("\"exit\": 4", "\"exit\": -1"),
        ("\"trim\": 0.25", "\"trim\": 1.5"),
        ("\"frontPark\": 0.5", "\"frontPark\": -0.5"),
        ("\"min\": 1, \"max\": 2", "\"min\": 2, \"max\": 1"),
        ("\"min\": 1, \"max\": 2", "\"min\": 1, \"max\": 9"),
    ] {
        let json = every_role().replace(from, to);
        assert_ne!(json, every_role(), "{from} is in the fixture");
        assert_eq!(parse(&json), Err(SettlementError::InvalidLayout), "{to}");
    }
}

#[test]
fn rejects_a_spacing_that_lets_two_settlements_overlap() {
    let json = every_role().replace("\"spacing\": 100", "\"spacing\": 33");
    assert_eq!(
        parse(&json),
        Err(SettlementError::SettlementsOverlap {
            spacing: 33,
            extent: 33,
        })
    );
    let json = every_role().replace("\"spacing\": 100", "\"spacing\": 34");
    assert!(parse(&json).is_ok());
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
        SettlementError::MissingRole {
            role: ZoneRole::Center,
        },
        SettlementError::DuplicateRole {
            role: ZoneRole::Street,
        },
        SettlementError::InvalidSpacing { found: -1 },
        SettlementError::InvalidChance { found: 0.0 },
        SettlementError::InvalidLayout,
        SettlementError::SettlementsOverlap {
            spacing: 4,
            extent: 9,
        },
        SettlementError::InvalidShare {
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
    let catalog = parse(&every_role()).expect("the fixture validates");
    assert_eq!(catalog.greens.spacing, 5.0);
    assert_eq!(catalog.greens.tight, 2.0);
    assert_eq!(catalog.greens.near, 3.0);
    assert_eq!(catalog.greens.far, 9.0);
    assert_eq!(catalog.greens.front, 2);
    assert_eq!(catalog.greens.patio.chance, 0.75);
    assert_eq!(catalog.greens.patio.min, 2);
    assert_eq!(catalog.greens.patio.max, 5);
    assert_eq!(catalog.greens.patio.reach, 2);
    assert_eq!(catalog.greens.patio.grove_chance, 0.3);
}

#[test]
fn rejects_greenery_rules_that_do_not_read_as_distances() {
    let json = every_role().replace("\"tight\": 2.0", "\"tight\": 9.0");
    assert_eq!(parse(&json), Err(SettlementError::InvalidGreensRules));
    let json = every_role().replace("\"near\": 3.0", "\"near\": 12.0");
    assert_eq!(parse(&json), Err(SettlementError::InvalidGreensRules));
    let json = every_role().replace("\"front\": 2", "\"front\": -1");
    assert_eq!(parse(&json), Err(SettlementError::InvalidGreensRules));
}

#[test]
fn rejects_a_patio_that_could_never_be_planted() {
    let json = every_role().replace("\"chance\": 0.75", "\"chance\": 1.5");
    assert_eq!(parse(&json), Err(SettlementError::InvalidPatio));
    let json = every_role().replace("\"min\": 2, \"max\": 5", "\"min\": 9, \"max\": 5");
    assert_eq!(parse(&json), Err(SettlementError::InvalidPatio));
    let json = every_role().replace("\"reach\": 2", "\"reach\": 0");
    assert_eq!(parse(&json), Err(SettlementError::InvalidPatio));
}

#[test]
fn a_block_lays_its_lots_on_every_other_cell_of_its_rim() {
    let catalog = parse(&every_role()).expect("the fixture validates");
    let mut rules = catalog.layout;
    rules.block = 4;
    assert_eq!(
        rules.slots(),
        vec![(0, 0), (0, 2), (2, 0), (1, 3), (3, 1), (3, 3)]
    );
    rules.block = 3;
    assert_eq!(rules.slots(), vec![(0, 0), (0, 2), (2, 0), (2, 2)]);
    assert_eq!(catalog.layout.slots().len(), 8);
}

#[test]
fn a_small_block_may_hold_as_many_lots_as_its_rim_has_slots() {
    let json = every_role()
        .replace("\"block\": 5", "\"block\": 4")
        .replace("\"min\": 1, \"max\": 2", "\"min\": 3, \"max\": 6");
    let catalog = parse(&json).expect("six lots fit a block of four");
    assert_eq!((catalog.layout.block, catalog.layout.lots_max), (4, 6));
    let json = json.replace("\"min\": 3, \"max\": 6", "\"min\": 3, \"max\": 7");
    assert_eq!(parse(&json), Err(SettlementError::InvalidLayout));
}

#[test]
fn a_zone_may_raise_one_building_type_across_its_whole_block() {
    let json = every_role().replace(
        "\"role\": \"residential\", \"share\": 3.0,",
        "\"role\": \"residential\", \"share\": 3.0, \"uniform\": true,",
    );
    let catalog = parse(&json).expect("a uniform zone validates");
    assert!(catalog.zones[1].uniform);
    assert!(!catalog.zones[0].uniform);
}
