use super::*;
use crate::entities::blueprint::*;
use crate::entities::validation::CATALOG_SCHEMA_VERSION;
use crate::terrain::TerrainMaterial;

fn blueprint(id: &str, length: i32, axis: EntityLengthAxis, road_access: bool) -> EntityBlueprint {
    EntityBlueprint {
        id: id.to_owned(),
        asset: EntityAsset {
            sprite: format!("/assets/{id}.svg"),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
            draw_under_player: false,
        },
        shape: EntityShape {
            height: 2,
            length,
            axis,
            collision: vec![0.5; length as usize],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass; length as usize],
            additional_surfaces: vec![],
            road_access,
        },
    }
}

fn catalog() -> EntityCatalog {
    EntityCatalog {
        schema_version: CATALOG_SCHEMA_VERSION,
        entities: vec![
            blueprint("hut", 1, EntityLengthAxis::X, true),
            blueprint("mead_hall_x", 2, EntityLengthAxis::X, true),
            blueprint("tree", 1, EntityLengthAxis::X, false),
            blueprint("grove_x", 2, EntityLengthAxis::X, false),
            blueprint("grove_y", 2, EntityLengthAxis::Y, false),
        ],
    }
}

fn biomes(catalog: &EntityCatalog) -> WorldBiomes {
    let json = r#"{
        "schemaVersion": 1,
        "biomes": [
            { "id": "temperate_forest", "share": 100.0, "treeCoverage": 0.3,
              "trees": [{ "blueprint": "tree", "weight": 100.0 }],
              "grassTints": ["bfd5bd"], "groundTints": ["fffbea"] }
        ]
    }"#;
    let parsed = crate::biomes::catalog::parse_biomes(json, catalog).expect("valid biomes");
    WorldBiomes::new(5, &parsed)
}

fn settlements(catalog: &EntityCatalog, greens: &str, patio: &str) -> WorldSettlements {
    let wfc = crate::entities::wfc::parse_wfc(
        r#"{ "schemaVersion": 2, "emptyWeight": 10.0,
             "weights": { "hut": 1.0, "mead_hall_x": 1.0, "grove_x": 1.0, "grove_y": 1.0 } }"#,
        catalog,
        None,
    )
    .expect("valid wfc content");
    let json = format!(
        r#"{{
          "schemaVersion": 1,
          "spacing": 80,
          "chance": 1.0,
          "radius": {{ "min": 30.0, "max": 30.0 }},
          "wilderness": {{ "default": 0.0, "greens": 0.0, "weights": {{}} }},
          "greens": {{ "spacing": 6.0, "tight": 2.0, "near": 3.0, "far": 9.0, "front": 2,
                       "patio": {patio} }},
          "zones": [
            {{ "id": "green", "seeds": 1, "ring": [0.0, 0.0], "pull": 1.0,
               "default": 0.0, "greens": {greens}, "weights": {{}} }}
          ]
        }}"#
    );
    let parsed =
        crate::settlements::parse_settlements(&json, catalog, &wfc).expect("valid settlements");
    WorldSettlements::new(3, &parsed)
}

fn no_patio() -> &'static str {
    r#"{ "chance": 0.0, "min": 2, "max": 4, "reach": 2, "groveChance": 0.0 }"#
}

fn every_patio() -> &'static str {
    r#"{ "chance": 1.0, "min": 2, "max": 2, "reach": 2, "groveChance": 0.0 }"#
}

fn columns(area: i32) -> Vec<TerrainColumn> {
    (-area..=area)
        .flat_map(|x| {
            (-area..=area).map(move |y| TerrainColumn {
                coord: WorldCoord { x, y },
                elevation: 0,
                surface: TerrainMaterial::Grass,
                walkable: true,
            })
        })
        .collect()
}

/// The chunk's columns centred on the settlement the field lays over the origin.
fn village(field: &WorldSettlements) -> (WorldCoord, Vec<TerrainColumn>) {
    let centre = (-100..100)
        .flat_map(|y| (-100..100).map(move |x| WorldCoord { x, y }))
        .find_map(|at| field.settlement_at(at.x, at.y))
        .expect("the fixture field lays a settlement")
        .center;
    let columns = columns(20)
        .into_iter()
        .map(|column| TerrainColumn {
            coord: WorldCoord {
                x: column.coord.x + centre.x,
                y: column.coord.y + centre.y,
            },
            ..column
        })
        .collect();
    (centre, columns)
}

fn hut_at(catalog: &EntityCatalog, at: WorldCoord) -> Entity {
    let blueprint = catalog
        .entities
        .iter()
        .find(|blueprint| blueprint.id == "hut")
        .expect("fixture hut");
    Entity::new(at.x, at.y, blueprint, 0)
}

fn plant(
    catalog: &EntityCatalog,
    field: &WorldSettlements,
    biomes: &WorldBiomes,
    columns: &[TerrainColumn],
    standing: &[Entity],
) -> Vec<Entity> {
    let mut placed = SpatialIndex::new();
    for entity in standing {
        let footprint = get_entity_footprint_for(entity);
        let _ = placed.insert(entity.clone(), &footprint);
    }
    plant_greens(
        columns,
        catalog,
        standing,
        &mut placed,
        GreensContent {
            settlements: field,
            biomes: Some(biomes),
            seed: 11,
        },
    )
}

#[test]
fn a_zone_that_grows_no_greenery_plants_nothing() {
    let catalog = catalog();
    let field = settlements(&catalog, "0.0", every_patio());
    let biomes = biomes(&catalog);
    let (centre, columns) = village(&field);
    let standing = vec![hut_at(&catalog, centre)];
    assert!(plant(&catalog, &field, &biomes, &columns, &standing).is_empty());
}

#[test]
fn without_biomes_a_settlement_grows_no_greenery() {
    let catalog = catalog();
    let field = settlements(&catalog, "1.0", every_patio());
    let (centre, columns) = village(&field);
    let standing = vec![hut_at(&catalog, centre)];
    let mut placed = SpatialIndex::new();
    let grown = plant_greens(
        &columns,
        &catalog,
        &standing,
        &mut placed,
        GreensContent {
            settlements: &field,
            biomes: None,
            seed: 11,
        },
    );
    assert!(grown.is_empty());
}

#[test]
fn the_scatter_fills_the_green_ground() {
    let catalog = catalog();
    let field = settlements(&catalog, "1.0", no_patio());
    let biomes = biomes(&catalog);
    let (_, columns) = village(&field);
    let grown = plant(&catalog, &field, &biomes, &columns, &[]);
    assert!(grown.len() > 10, "the green ground grew {}", grown.len());
    for entity in &grown {
        assert_eq!(entity.type_(), "tree");
    }
}

#[test]
fn nothing_grows_in_front_of_a_facade() {
    let catalog = catalog();
    let field = settlements(&catalog, "1.0", no_patio());
    let biomes = biomes(&catalog);
    let (centre, columns) = village(&field);
    let standing = vec![hut_at(&catalog, centre)];
    let grown = plant(&catalog, &field, &biomes, &columns, &standing);
    for entity in &grown {
        let (dx, dy) = (entity.x() - centre.x, entity.y() - centre.y);
        let in_front = (-2..=0).contains(&dx) && (-2..=0).contains(&dy) && (dx, dy) != (0, 0);
        assert!(!in_front, "{} grew in front of the hut", entity.id());
    }
}

#[test]
fn a_patio_hangs_off_the_back_of_a_building() {
    let catalog = catalog();
    let field = settlements(&catalog, "1.0", every_patio());
    let biomes = biomes(&catalog);
    let (centre, columns) = village(&field);
    let standing = vec![hut_at(&catalog, centre)];
    let grown = plant(&catalog, &field, &biomes, &columns, &standing);
    let behind = grown
        .iter()
        .filter(|entity| {
            let (dx, dy) = (entity.x() - centre.x, entity.y() - centre.y);
            (0..=2).contains(&dx) && (0..=2).contains(&dy) && (dx, dy) != (0, 0)
        })
        .count();
    assert!(behind >= 2, "the patio grew {behind} plants behind the hut");
}

#[test]
fn a_patio_only_grows_where_the_content_asks_for_one() {
    let catalog = catalog();
    let biomes = biomes(&catalog);
    let with = settlements(&catalog, "1.0", every_patio());
    let (centre, columns) = village(&with);
    let standing = vec![hut_at(&catalog, centre)];
    let behind = |field: &WorldSettlements, columns: &[TerrainColumn]| {
        plant(&catalog, field, &biomes, columns, &standing)
            .iter()
            .filter(|entity| {
                let (dx, dy) = (entity.x() - centre.x, entity.y() - centre.y);
                (1..=2).contains(&dx) && (1..=2).contains(&dy)
            })
            .count()
    };
    let without = settlements(&catalog, "1.0", no_patio());
    assert!(behind(&with, &columns) > behind(&without, &columns));
}

#[test]
fn the_greenery_clumps_against_a_wall_and_opens_up_away_from_it() {
    let catalog = catalog();
    let field = settlements(&catalog, "1.0", no_patio());
    let biomes = biomes(&catalog);
    let (centre, columns) = village(&field);
    let standing = vec![hut_at(&catalog, centre)];
    let grown = plant(&catalog, &field, &biomes, &columns, &standing);
    let near = grown
        .iter()
        .filter(|entity| {
            f64::from(entity.x() - centre.x).hypot(f64::from(entity.y() - centre.y)) <= 4.0
        })
        .count();
    let near_area = std::f64::consts::PI * 16.0;
    let all_area = 41.0 * 41.0;
    assert!(
        near as f64 / near_area > grown.len() as f64 / all_area,
        "the greenery did not clump against the hut: {near} of {}",
        grown.len()
    );
}

#[test]
fn greenery_never_stands_where_something_already_does() {
    let catalog = catalog();
    let field = settlements(&catalog, "1.0", every_patio());
    let biomes = biomes(&catalog);
    let (centre, columns) = village(&field);
    let standing = vec![hut_at(&catalog, centre)];
    let grown = plant(&catalog, &field, &biomes, &columns, &standing);
    for entity in &grown {
        assert!(
            !(entity.x() == centre.x && entity.y() == centre.y),
            "greenery grew on top of the hut"
        );
    }
    let mut seen = std::collections::HashSet::new();
    for entity in &grown {
        for cell in get_entity_footprint_for(entity) {
            assert!(seen.insert((cell.x, cell.y)), "two plants share {cell:?}");
        }
    }
}

#[test]
fn the_same_seed_grows_the_same_greenery() {
    let catalog = catalog();
    let field = settlements(&catalog, "1.0", every_patio());
    let biomes = biomes(&catalog);
    let (centre, columns) = village(&field);
    let standing = vec![hut_at(&catalog, centre)];
    let first = plant(&catalog, &field, &biomes, &columns, &standing);
    let second = plant(&catalog, &field, &biomes, &columns, &standing);
    fn ids(grown: &[Entity]) -> Vec<&str> {
        grown.iter().map(|entity| entity.id()).collect()
    }
    assert_eq!(ids(&first), ids(&second));
}

#[test]
fn a_patio_can_grow_a_grove_when_the_content_asks_for_groves() {
    let catalog = catalog();
    let patio = r#"{ "chance": 1.0, "min": 3, "max": 3, "reach": 3, "groveChance": 1.0 }"#;
    let field = settlements(&catalog, "1.0", patio);
    let biomes = biomes(&catalog);
    let (centre, columns) = village(&field);
    let standing = vec![hut_at(&catalog, centre)];
    let grown = plant(&catalog, &field, &biomes, &columns, &standing);
    assert!(
        grown
            .iter()
            .any(|entity| entity.type_().starts_with("grove")),
        "no grove grew in the patio"
    );
}
