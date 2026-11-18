//! Tests for the post-road decor: the zero-collision props scattered on the surfaces the
//! pre-road passes never see (the carved path cells among them).

use super::*;
use crate::entities::blueprint::{EntityAsset, EntityLengthAxis, EntityPlacement, EntityShape};
use crate::grid::WorldCoord;
use crate::terrain::TerrainMaterial;

fn column(x: i32, y: i32, surface: TerrainMaterial, elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x, y },
        elevation,
        surface,
        walkable: surface != TerrainMaterial::Water,
    }
}

fn path_chunk(side: i32) -> Vec<TerrainColumn> {
    (0..side)
        .flat_map(|x| (0..side).map(move |y| column(x, y, TerrainMaterial::Path, 2)))
        .collect()
}

fn rock(
    id: &str,
    collision: Vec<f64>,
    additional: Vec<TerrainMaterial>,
) -> crate::entities::blueprint::EntityBlueprint {
    crate::entities::blueprint::EntityBlueprint {
        id: id.to_owned(),
        asset: EntityAsset {
            sprite: format!("/assets/rock/{id}.png"),
            reflection: None,
            color_replacements: None,
            sway: None,
            draw_under_player: false,
            contact_shadow: None,
        },
        shape: EntityShape {
            height: 1,
            length: 1,
            axis: EntityLengthAxis::X,
            collision,
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            additional_surfaces: additional,
            road_access: false,
        },
    }
}

fn catalog(blueprints: Vec<crate::entities::blueprint::EntityBlueprint>) -> EntityCatalog {
    EntityCatalog {
        schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
        entities: blueprints,
    }
}

#[test]
fn the_decor_scatters_on_the_additional_surfaces_after_the_roads_carve() {
    let columns = path_chunk(16);
    let catalog = catalog(vec![rock(
        "rock_small",
        vec![0.0],
        vec![TerrainMaterial::Path],
    )]);
    let mut placed = SpatialIndex::new();
    let decor = place_decor(&columns, &catalog, &mut placed);
    assert!(!decor.is_empty(), "some rock must land on the carved path");
    for entity in &decor {
        let column = columns
            .iter()
            .find(|column| column.coord.x == entity.x() && column.coord.y == entity.y())
            .expect("the anchor is inside the chunk");
        assert_eq!(column.surface, TerrainMaterial::Path);
        assert_eq!(column.elevation, 2);
        assert_eq!(entity.collision_at(entity.x(), entity.y()), 0.0);
    }
}

#[test]
fn the_decor_never_covers_what_already_stands() {
    let columns = path_chunk(16);
    let house = crate::entities::blueprint::EntityBlueprint {
        id: "house".to_owned(),
        asset: EntityAsset {
            sprite: "/assets/house/block.png".to_owned(),
            reflection: None,
            color_replacements: None,
            sway: None,
            draw_under_player: false,
            contact_shadow: None,
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
    let house = Entity::new(8, 8, &house, 2);
    let catalog = catalog(vec![rock(
        "rock_small",
        vec![0.0],
        vec![TerrainMaterial::Path],
    )]);
    let mut placed = SpatialIndex::new();
    placed
        .insert(house.clone(), &[WorldCoord { x: 8, y: 8 }])
        .expect("the house stands");
    let decor = place_decor(&columns, &catalog, &mut placed);
    assert!(
        decor
            .iter()
            .all(|entity| (entity.x(), entity.y()) != (8, 8)),
        "no rock may take the house's cell"
    );
}

#[test]
fn a_blueprint_with_any_collision_is_not_decor() {
    let columns = path_chunk(16);
    let catalog = catalog(vec![rock(
        "rock_small",
        vec![0.5],
        vec![TerrainMaterial::Path],
    )]);
    let mut placed = SpatialIndex::new();
    let decor = place_decor(&columns, &catalog, &mut placed);
    assert!(decor.is_empty());
}

#[test]
fn the_decor_is_a_deterministic_function_of_the_columns() {
    let columns = path_chunk(16);
    let catalog = catalog(vec![rock(
        "rock_small",
        vec![0.0],
        vec![TerrainMaterial::Path],
    )]);
    let first = place_decor(&columns, &catalog, &mut SpatialIndex::new());
    let second = place_decor(&columns, &catalog, &mut SpatialIndex::new());
    let ids: Vec<_> = first
        .iter()
        .map(|entity| (entity.x(), entity.y()))
        .collect();
    let ids_again: Vec<_> = second
        .iter()
        .map(|entity| (entity.x(), entity.y()))
        .collect();
    assert_eq!(ids, ids_again);
}

#[test]
fn a_blueprint_without_additional_surfaces_stays_out() {
    let columns = path_chunk(16);
    let catalog = catalog(vec![rock("rock_small", vec![0.0], vec![])]);
    let mut placed = SpatialIndex::new();
    let decor = place_decor(&columns, &catalog, &mut placed);
    assert!(decor.is_empty());
}
