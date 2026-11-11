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
                id: tree_id,
                asset: EntityAsset {
                    sprite: "/assets/tree/block.svg".to_owned(),
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
            },
            EntityBlueprint {
                id: house_id,
                asset: EntityAsset {
                    sprite: "/assets/house/block.svg".to_owned(),
                    reflection: None,
                    color_replacements: None,
                    sway: None,
                    contact_shadow: None,
                },
                shape: EntityShape {
                    height: 1,
                    length: 1,
                    axis: EntityLengthAxis::X,
                    collision: vec![0.8],
                },
                placement: EntityPlacement {
                    surfaces: vec![TerrainMaterial::Grass],
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

fn job(chunk: crate::grid::ChunkCoord) -> PlacementJob {
    PlacementJob::spawn(
        chunk,
        grass_columns(chunk),
        catalog(),
        Some(biomes(1, &catalog())),
        None,
    )
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
    let from_worker = place(
        grass_columns(chunk),
        &catalog(),
        Some(&biomes(1, &catalog())),
        None,
    );
    let from_thread = PlacementJob::spawn(
        chunk,
        grass_columns(chunk),
        catalog(),
        Some(biomes(1, &catalog())),
        None,
    )
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
fn take_outcome_without_waiting_leaves_the_job_running() {
    let chunk = crate::grid::ChunkCoord { cx: 0, cy: 0 };
    let outcome = PlacementJob::spawn(
        chunk,
        grass_columns(chunk),
        catalog(),
        Some(biomes(1, &catalog())),
        None,
    )
    .take_outcome(true);

    assert!(outcome.is_some());
}

#[test]
fn a_job_that_is_taken_cannot_be_taken_again() {
    let chunk = crate::grid::ChunkCoord { cx: 0, cy: 0 };
    let mut job = PlacementJob::spawn(
        chunk,
        grass_columns(chunk),
        catalog(),
        Some(biomes(1, &catalog())),
        None,
    );

    assert!(job.take_outcome(true).is_some());
    assert!(job.take_outcome(true).is_none());
    assert!(job.is_finished());
}
