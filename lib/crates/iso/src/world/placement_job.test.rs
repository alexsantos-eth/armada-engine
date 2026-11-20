use super::*;
use crate::biomes::{WorldBiomes, parse_biomes};
use crate::entities::EntityCatalog;
use crate::entities::blueprint::{
    EntityAsset, EntityBlueprint, EntityLengthAxis, EntityPlacement, EntityShape,
};
use crate::entities::validation::CATALOG_SCHEMA_VERSION;
use crate::terrain::{TerrainColumn, TerrainMaterial};

fn grass_columns(chunk: crate::grid::ChunkCoord) -> Vec<TerrainColumn> {
    let min_x = chunk.cx * crate::grid::CHUNK_SIZE;
    let min_y = chunk.cy * crate::grid::CHUNK_SIZE;
    (min_x..min_x + crate::grid::CHUNK_SIZE)
        .flat_map(|x| {
            (min_y..min_y + crate::grid::CHUNK_SIZE).map(move |y| TerrainColumn {
                coord: crate::grid::WorldCoord { x, y },
                elevation: 0,
                surface: TerrainMaterial::Grass,
                walkable: true,
            })
        })
        .collect()
}

fn catalog() -> EntityCatalog {
    let tree_id = "tree".to_owned();
    let house_id = "house".to_owned();
    EntityCatalog {
        schema_version: CATALOG_SCHEMA_VERSION,
        entities: vec![
            EntityBlueprint {
                npc: None,
                id: tree_id,
                asset: EntityAsset {
                    sprite: "/assets/tree/block.svg".to_owned(),
                    reflection: None,
                    color_replacements: None,
                    sway: None,
                    contact_shadow: None,
                    draw_under_player: false,
                    fire: false,
                },
                shape: EntityShape {
                    height: 2,
                    length: 1,
                    axis: EntityLengthAxis::X,
                    collision: vec![0.15],
                },
                placement: EntityPlacement {
                    surfaces: vec![TerrainMaterial::Grass],
                    additional_surfaces: vec![],
                    road_access: false,
                },
            },
            EntityBlueprint {
                npc: None,
                id: house_id,
                asset: EntityAsset {
                    sprite: "/assets/house/block.svg".to_owned(),
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
                    collision: vec![0.8],
                },
                placement: EntityPlacement {
                    surfaces: vec![TerrainMaterial::Grass],
                    additional_surfaces: vec![],
                    road_access: true,
                },
            },
        ],
    }
}

fn biomes(seed: u64, catalog: &EntityCatalog) -> WorldBiomes {
    let biomes = parse_biomes(
        r#"{
            "schemaVersion": 1,
            "biomes": [
                { "id": "meadow", "share": 1.0, "treeCoverage": 1.0,
                  "trees": [ { "blueprint": "tree", "weight": 1.0 },
                             { "blueprint": "house", "weight": 1.0 } ],
                  "grassTints": ["ffffff"], "groundTints": ["ffffff"] }
            ]
        }"#,
        catalog,
    )
    .expect("valid biomes");
    WorldBiomes::new(seed, &biomes)
}

fn content() -> ChunkContent {
    ChunkContent {
        biomes: Some(biomes(1, &catalog())),
        wfc: None,
        settlements: None,
    }
}

fn job(chunk: crate::grid::ChunkCoord) -> PlacementJob {
    PlacementJob::spawn(chunk, grass_columns(chunk), catalog(), content())
}

#[test]
fn the_placement_worker_produces_entities_in_the_same_place_twice() {
    let chunk = crate::grid::ChunkCoord { cx: 0, cy: 0 };

    let first = job(chunk).take_outcome(true).expect("first outcome");
    let second = job(chunk).take_outcome(true).expect("second outcome");

    assert!(!first.entities.is_empty(), "a meadow grows something");
    assert_eq!(first.entities.len(), second.entities.len());
    for (one, other) in first.entities.iter().zip(second.entities.iter()) {
        assert_eq!(
            (one.x(), one.y(), one.type_()),
            (other.x(), other.y(), other.type_())
        );
        assert_eq!(one.elevation(), other.elevation());
    }
    assert_eq!(first.columns.len(), second.columns.len());
    for (one, other) in first.columns.iter().zip(second.columns.iter()) {
        assert_eq!(one.coord, other.coord);
        assert_eq!(one.elevation, other.elevation);
        assert_eq!(one.surface, other.surface);
        assert_eq!(one.walkable, other.walkable);
    }
}

#[test]
fn the_placement_worker_materializes_road_cells_for_road_access_blueprints() {
    let chunk = crate::grid::ChunkCoord { cx: 0, cy: 0 };

    let outcome = job(chunk).take_outcome(true).expect("outcome");
    let roads = outcome
        .columns
        .iter()
        .filter(|column| column.surface == TerrainMaterial::Path)
        .count();

    assert_ne!(
        roads, 0,
        "road access blueprints produce at least one road cell"
    );
    assert!(
        outcome.columns.iter().all(|column| column.walkable),
        "a path cell stays walkable over grass"
    );
    assert!(
        outcome.columns.iter().all(|column| column.elevation == 0),
        "roads materialized in place keep the ground level"
    );
}

#[test]
fn an_inline_placement_is_identical_to_a_spawned_one() {
    let chunk = crate::grid::ChunkCoord { cx: 0, cy: 0 };

    let grass = grass_columns(chunk);
    let from_worker = place(grass_columns(chunk), &catalog(), &content());
    let from_thread = PlacementJob::spawn(chunk, grass_columns(chunk), catalog(), content())
        .take_outcome(true)
        .expect("threaded outcome");

    assert_eq!(grass.len(), from_worker.columns.len());
    assert_eq!(from_worker.entities.len(), from_thread.entities.len());
    for (one, other) in from_worker.entities.iter().zip(from_thread.entities.iter()) {
        assert_eq!(
            (one.x(), one.y(), one.type_()),
            (other.x(), other.y(), other.type_())
        );
    }
    for (one, other) in from_worker.columns.iter().zip(from_thread.columns.iter()) {
        assert_eq!(one.surface, other.surface);
    }
}

#[test]
fn a_job_that_is_taken_cannot_be_taken_again() {
    let chunk = crate::grid::ChunkCoord { cx: 0, cy: 0 };
    let mut job = PlacementJob::spawn(chunk, grass_columns(chunk), catalog(), content());

    assert!(job.take_outcome(true).is_some());
    assert!(job.take_outcome(true).is_none());
    assert!(job.is_finished());
}

fn village(catalog: &EntityCatalog) -> crate::settlements::WorldSettlements {
    let wfc = crate::entities::wfc::parse_wfc(
        r#"{ "schemaVersion": 2, "emptyWeight": 10.0, "weights": { "house": 1.0 } }"#,
        catalog,
        None,
    )
    .expect("fixture wfc validates");
    let json = r#"{
      "schemaVersion": 2, "spacing": 32, "chance": 1.0,
      "layout": { "blocks": { "min": 2, "max": 2 }, "block": 5, "street": 1, "edge": 2,
                  "exit": 3, "trim": 0.0, "frontPark": 0.0, "lots": { "min": 1, "max": 1 } },
      "wilderness": { "default": 1.0 },
      "greens": { "spacing": 6.0, "tight": 2.0, "near": 3.0, "far": 9.0, "front": 2,
                  "patio": { "chance": 0.0, "min": 0, "max": 0, "reach": 1, "groveChance": 0.0 } },
      "zones": [
        { "id": "center", "role": "center", "lots": { "house": 1.0 } },
        { "id": "homes", "role": "residential", "share": 1.0, "lots": { "house": 1.0 } },
        { "id": "park", "role": "park", "share": 0.0 },
        { "id": "edge", "role": "edge" },
        { "id": "street", "role": "street" }
      ]
    }"#;
    crate::settlements::WorldSettlements::new(
        5,
        &crate::settlements::parse_settlements(json, catalog, &wfc)
            .expect("fixture settlements validate"),
    )
}

#[test]
fn a_settlement_chunk_paves_its_streets_and_raises_a_house_on_every_lot() {
    let chunk = crate::grid::ChunkCoord { cx: 0, cy: 0 };
    let catalog = catalog();
    let settlements = village(&catalog);
    let columns = grass_columns(chunk);
    let coords: Vec<_> = columns.iter().map(|column| column.coord).collect();
    let streets = settlements.streets_over(&coords);
    let content = ChunkContent {
        biomes: None,
        wfc: None,
        settlements: Some(settlements.clone()),
    };
    let outcome = PlacementJob::spawn(chunk, columns, catalog, content)
        .take_outcome(true)
        .expect("outcome");

    assert!(streets.iter().any(|&street| street));
    for (column, &street) in outcome.columns.iter().zip(&streets) {
        if street {
            assert_eq!(column.surface, TerrainMaterial::Path, "{:?}", column.coord);
        }
    }
    let area = crate::grid::WorldRect {
        min_x: 0,
        min_y: 0,
        max_x: 31,
        max_y: 31,
    };
    let lots = settlements.lots_in(area);
    assert!(!lots.is_empty());
    for lot in lots {
        assert!(
            outcome
                .entities
                .iter()
                .any(|entity| entity.type_() == "house"
                    && (entity.x(), entity.y()) == (lot.anchor.x, lot.anchor.y)),
            "{lot:?}"
        );
    }
}

#[test]
fn turfing_grows_grass_on_the_bare_ground_of_marked_columns_only() {
    let mut columns: Vec<_> = (0..4)
        .map(|x| TerrainColumn {
            coord: crate::grid::WorldCoord { x, y: 0 },
            elevation: 0,
            surface: TerrainMaterial::Ground,
            walkable: true,
        })
        .collect();
    columns[2].surface = TerrainMaterial::Sand;

    let turfed = turf(&mut columns, &[true, false, true, true]);

    assert_eq!(turfed, 2);
    assert_eq!(columns[0].surface, TerrainMaterial::Grass);
    assert_eq!(columns[1].surface, TerrainMaterial::Ground);
    assert_eq!(columns[2].surface, TerrainMaterial::Sand);
    assert_eq!(columns[3].surface, TerrainMaterial::Grass);
}

#[test]
fn a_settlement_chunk_on_bare_ground_still_raises_a_house_on_every_lot() {
    let chunk = crate::grid::ChunkCoord { cx: 0, cy: 0 };
    let catalog = catalog();
    let settlements = village(&catalog);
    let columns: Vec<_> = grass_columns(chunk)
        .into_iter()
        .map(|column| TerrainColumn {
            surface: TerrainMaterial::Ground,
            ..column
        })
        .collect();
    let content = ChunkContent {
        biomes: None,
        wfc: None,
        settlements: Some(settlements.clone()),
    };
    let outcome = PlacementJob::spawn(chunk, columns, catalog, content)
        .take_outcome(true)
        .expect("outcome");
    let area = crate::grid::WorldRect {
        min_x: 0,
        min_y: 0,
        max_x: 31,
        max_y: 31,
    };
    let lots = settlements.lots_in(area);
    assert!(!lots.is_empty());
    for lot in lots {
        assert!(
            outcome
                .entities
                .iter()
                .any(|entity| (entity.x(), entity.y()) == (lot.anchor.x, lot.anchor.y)),
            "{lot:?}"
        );
    }
}
