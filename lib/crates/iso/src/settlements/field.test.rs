use super::*;
use crate::entities::EntityCatalog;
use crate::entities::blueprint::*;
use crate::settlements::parse_settlements;
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
    };
    EntityCatalog {
        schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
        entities: ["hut", "mead_hall", "tree"]
            .into_iter()
            .map(blueprint)
            .collect(),
    }
}

fn wfc() -> crate::entities::wfc::WfcCatalog {
    crate::entities::wfc::parse_wfc(
        r#"{
            "schemaVersion": 2,
            "emptyWeight": 100.0,
            "weights": { "hut": 1.0, "mead_hall": 1.0, "tree": 1.0 }
        }"#,
        &entities(),
        None,
    )
    .expect("fixture wfc validates")
}

fn catalog_with(chance: f64, greens: &str) -> SettlementCatalog {
    let json = format!(
        r#"{{
          "schemaVersion": 1,
          "spacing": 100,
          "chance": {chance},
          "radius": {{ "min": 12.0, "max": 12.0 }},
          "wilderness": {{ "default": 1.0, "greens": 0.0, "weights": {{ "mead_hall": 0.0 }} }},
          "greens": {{ "spacing": 6.0, "tight": 2.0, "near": 3.0, "far": 9.0, "front": 2,
                       "patio": {{ "chance": 0.8, "min": 2, "max": 4, "reach": 2, "groveChance": 0.3 }} }},
          "zones": [
            {{ "id": "center", "seeds": 1, "ring": [0.0, 0.0], "pull": 0.0,
               "default": 0.0, "greens": 0.0, "weights": {{ "mead_hall": 40.0 }} }},
            {{ "id": "green", "seeds": 3, "ring": [0.75, 0.95], "pull": 0.0,
               "default": 0.0, "greens": {greens}, "weights": {{ "hut": 1.0 }} }}
          ]
        }}"#
    );
    parse_settlements(&json, &entities(), &wfc()).expect("the fixture validates")
}

fn catalog() -> SettlementCatalog {
    catalog_with(1.0, "1.0")
}

fn field_of(catalog: &SettlementCatalog) -> WorldSettlements {
    WorldSettlements::new(99, catalog)
}

/// The centre of the settlement whose site is the grid cell containing `(x, y)`.
fn some_settlement(world: &WorldSettlements) -> Settlement {
    for y in -200..200 {
        for x in -200..200 {
            if let Some(settlement) = world.settlement_at(x, y) {
                return settlement;
            }
        }
    }
    panic!("no settlement in the scanned region");
}

#[test]
fn with_every_site_hosting_one_the_field_lays_a_settlement_per_grid_cell() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let mut centres = std::collections::HashSet::new();
    for y in 0..200 {
        for x in 0..200 {
            if let Some(settlement) = world.settlement_at(x, y) {
                centres.insert((settlement.center.x, settlement.center.y));
            }
        }
    }
    assert_eq!(centres.len(), 4);
}

#[test]
fn a_column_is_in_a_zone_exactly_when_it_is_inside_the_radius() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let centre = settlement.center;
    for dy in -20..=20 {
        for dx in -20..=20 {
            let x = centre.x + dx;
            let y = centre.y + dy;
            let distance = f64::from(dx).hypot(f64::from(dy));
            let inside = distance <= settlement.radius;
            assert_eq!(
                world.zone_at(x, y).is_some(),
                inside,
                "column ({x}, {y}) at distance {distance} of radius {}",
                settlement.radius
            );
        }
    }
}

#[test]
fn the_centre_column_belongs_to_the_zone_seeded_at_the_centre() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    assert_eq!(
        world.zone_id_at(settlement.center.x, settlement.center.y),
        Some("center")
    );
}

#[test]
fn the_outer_ring_belongs_to_the_zone_seeded_there() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let edge = (settlement.radius * 0.9).round() as i32;
    let ids: std::collections::HashSet<_> = (0..360)
        .step_by(5)
        .map(|degrees| {
            let angle = f64::from(degrees).to_radians();
            let x = settlement.center.x + (f64::from(edge) * angle.cos()).round() as i32;
            let y = settlement.center.y + (f64::from(edge) * angle.sin()).round() as i32;
            world.zone_id_at(x, y)
        })
        .collect();
    assert!(
        ids.contains(&Some("green")),
        "the outer ring never reaches the green zone: {ids:?}"
    );
}

#[test]
fn outside_every_settlement_the_wilderness_profile_rules() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let far_x = settlement.center.x + 40;
    assert_eq!(world.zone_at(far_x, settlement.center.y), None);
    assert_eq!(world.zone_id_at(far_x, settlement.center.y), None);
    let profile = world.profile_at(far_x, settlement.center.y);
    assert_eq!(profile.multiplier(0), 1.0);
    assert_eq!(profile.multiplier(1), 0.0);
}

#[test]
fn inside_a_settlement_the_zone_profile_rules() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let profile = world.profile_at(settlement.center.x, settlement.center.y);
    assert_eq!(profile.multiplier(1), 40.0);
    assert_eq!(profile.multiplier(0), 0.0);
}

#[test]
fn the_zone_of_a_column_never_depends_on_which_column_was_asked_first() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let forward: Vec<_> = (-15..15)
        .map(|dx| world.zone_at(settlement.center.x + dx, settlement.center.y))
        .collect();
    let rebuilt = field_of(&catalog);
    let backward: Vec<_> = (-15..15)
        .rev()
        .map(|dx| rebuilt.zone_at(settlement.center.x + dx, settlement.center.y))
        .collect();
    assert_eq!(
        forward,
        backward.into_iter().rev().collect::<Vec<_>>(),
        "the field answered differently in another order"
    );
}

#[test]
fn another_seed_moves_the_settlements() {
    let catalog = catalog();
    let here = WorldSettlements::new(1, &catalog);
    let there = WorldSettlements::new(2, &catalog);
    let differences = (0..200)
        .filter(|&x| here.zone_at(x, 50) != there.zone_at(x, 50))
        .count();
    assert!(
        differences > 0,
        "two worlds laid their settlements identically"
    );
}

#[test]
fn a_chance_below_one_leaves_sites_empty() {
    let full = catalog_with(1.0, "1.0");
    let some = catalog_with(0.3, "1.0");
    let dense = WorldSettlements::new(99, &full);
    let sparse = WorldSettlements::new(99, &some);
    let count = |world: &WorldSettlements| {
        let mut centres = std::collections::HashSet::new();
        for y in 0..600 {
            for x in 0..600 {
                if let Some(settlement) = world.settlement_at(x, y) {
                    centres.insert((settlement.center.x, settlement.center.y));
                }
            }
        }
        centres.len()
    };
    assert!(
        count(&sparse) < count(&dense),
        "a lower chance hosted as many settlements"
    );
}

#[test]
fn resolving_a_whole_area_answers_exactly_what_the_columns_answer_one_by_one() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let coords: Vec<crate::grid::WorldCoord> = (-20..20)
        .flat_map(|dy| {
            (-20..20).map(move |dx| crate::grid::WorldCoord {
                x: settlement.center.x + dx,
                y: settlement.center.y + dy,
            })
        })
        .collect();
    let area = world.zones_over(&coords);
    let one_by_one: Vec<_> = coords
        .iter()
        .map(|coord| world.zone_at(coord.x, coord.y))
        .collect();
    assert_eq!(area, one_by_one);
    assert!(
        one_by_one.iter().any(Option::is_some),
        "the sampled area never touched the settlement"
    );
}

#[test]
fn a_zone_resolved_once_answers_the_same_profile_and_tree_gate_as_the_column() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    for dx in -20..20 {
        let (x, y) = (settlement.center.x + dx, settlement.center.y);
        let zone = world.zone_at(x, y);
        assert_eq!(world.profile_of(zone).greens, world.profile_at(x, y).greens);
    }
}

#[test]
fn a_zone_that_grows_no_greenery_asks_for_no_spacing() {
    let bare = catalog_with(1.0, "0.0");
    let world = WorldSettlements::new(99, &bare);
    let settlement = some_settlement(&world);
    let zone = world.zone_at(settlement.center.x, settlement.center.y);
    assert_eq!(world.greens_of(zone), 0.0);
    assert_eq!(world.greens_spacing(zone, 0.0), None);
    assert_eq!(world.greens_spacing(None, 0.0), None);
}

#[test]
fn the_greenery_hugs_a_wall_and_opens_up_in_the_clearing() {
    let catalog = catalog_with(1.0, "1.0");
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let green = (0..360).step_by(5).find_map(|degrees| {
        let angle = f64::from(degrees).to_radians();
        let reach = settlement.radius * 0.85;
        let x = settlement.center.x + (reach * angle.cos()).round() as i32;
        let y = settlement.center.y + (reach * angle.sin()).round() as i32;
        world
            .zone_at(x, y)
            .filter(|_| world.zone_id_at(x, y) == Some("green"))
    });
    let green = green.expect("the fixture settlement has a green zone");
    let beside = world.greens_spacing(Some(green), 0.0).expect("greens");
    let middling = world.greens_spacing(Some(green), 6.0).expect("greens");
    let open = world.greens_spacing(Some(green), 20.0).expect("greens");
    assert_eq!(beside, 2.0);
    assert_eq!(open, 6.0);
    assert!(
        beside < middling && middling < open,
        "{beside} {middling} {open}"
    );
}

#[test]
fn a_denser_zone_tightens_the_spacing() {
    let catalog = catalog_with(1.0, "2.0");
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let green = (0..360).step_by(5).find_map(|degrees| {
        let angle = f64::from(degrees).to_radians();
        let reach = settlement.radius * 0.85;
        let x = settlement.center.x + (reach * angle.cos()).round() as i32;
        let y = settlement.center.y + (reach * angle.sin()).round() as i32;
        world
            .zone_at(x, y)
            .filter(|_| world.zone_id_at(x, y) == Some("green"))
    });
    let green = green.expect("the fixture settlement has a green zone");
    assert_eq!(world.greens_spacing(Some(green), 20.0), Some(3.0));
}
