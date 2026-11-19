use super::*;
use crate::entities::{
    Entity, EntityAsset, EntityBlueprint, EntityLengthAxis, EntityPlacement, EntityShape,
};
use crate::terrain::{TerrainConfig, TerrainMaterial};

fn world() -> TerrainWorld {
    TerrainWorld::new(TerrainGenerator::new(TerrainConfig::default()).unwrap())
}

#[test]
fn discovered_chunks_survive_hiding_and_revisiting() {
    let mut world = world();
    let chunk = ChunkCoord { cx: -1, cy: 0 };
    let point = WorldCoord { x: -1, y: 3 };
    assert!(world.show_chunk(chunk));
    assert_eq!(world.discovered_count(), 1);
    assert_eq!(world.visible_count(), 1);
    assert!(!world.show_chunk(chunk));

    world.edit_column(point, 4, TerrainMaterial::Path).unwrap();
    world.hide_chunk(chunk);
    assert_eq!(world.visible_count(), 0);
    assert_eq!(world.discovered_count(), 1);
    assert_eq!(
        world.column_at(point).unwrap().surface,
        TerrainMaterial::Path
    );

    assert!(!world.show_chunk(chunk));
    let edited = world.column_at(point).unwrap();
    assert_eq!(edited.elevation, 4);
    assert!(edited.walkable);
}

#[test]
fn edits_require_discovery_and_do_not_change_other_chunks() {
    let mut world = world();
    let west = ChunkCoord { cx: -1, cy: 0 };
    let east = ChunkCoord { cx: 0, cy: 0 };
    let west_point = WorldCoord { x: -1, y: 0 };
    let east_point = WorldCoord { x: 0, y: 0 };
    assert_eq!(
        world.edit_column(west_point, 2, TerrainMaterial::Grass),
        Err(EditError::Undiscovered(west))
    );
    world.show_chunk(west);
    world.show_chunk(east);
    let original_east = world.column_at(east_point).copied();
    assert_eq!(
        world.edit_column(west_point, 2, TerrainMaterial::Water),
        Err(EditError::InvalidSurface)
    );
    world
        .edit_column(west_point, -2, TerrainMaterial::Water)
        .unwrap();
    assert_eq!(world.column_at(east_point).copied(), original_east);
    assert!(!world.column_at(west_point).unwrap().walkable);
    assert_eq!(
        world.chunk(west).unwrap().len(),
        (CHUNK_SIZE * CHUNK_SIZE) as usize
    );
}

#[test]
fn visibility_is_independent_of_discovery_order() {
    let mut world = world();
    let chunks = [ChunkCoord { cx: 1, cy: -1 }, ChunkCoord { cx: -1, cy: 0 }];
    for chunk in chunks.into_iter().rev() {
        world.show_chunk(chunk);
    }
    assert_eq!(
        world.visible_chunks(),
        &chunks.into_iter().rev().collect::<Vec<_>>()[..]
    );
    world.hide_chunk(chunks[0]);
    assert_eq!(world.visible_chunks(), &[chunks[1]]);
}

#[test]
fn road_enabled_structures_materialize_paths_without_overwriting_their_footprints() {
    let mut world = world();
    let chunk = ChunkCoord { cx: 0, cy: 0 };
    world.show_chunk(chunk);
    let blueprint = EntityBlueprint {
        id: "house".to_owned(),
        asset: EntityAsset {
            sprite: "/assets/house/block.svg".to_owned(),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
            draw_under_player: false,
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
            road_access: true,
        },
    };
    let entities = [
        Entity::new(4, 4, &blueprint, 0),
        Entity::new(12, 4, &blueprint, 0),
    ];

    assert_eq!(world.connect_roads(chunk, &entities), 2);
    assert_eq!(
        world.column_at(WorldCoord { x: 4, y: 4 }).unwrap().surface,
        TerrainMaterial::Grass
    );
    assert_eq!(
        world.column_at(WorldCoord { x: 12, y: 4 }).unwrap().surface,
        TerrainMaterial::Grass
    );
    assert!(
        world
            .chunk(chunk)
            .unwrap()
            .iter()
            .any(|column| column.surface == TerrainMaterial::Path)
    );
}

#[test]
fn the_road_carves_through_a_zero_collision_prop_and_keeps_it_on_the_path() {
    let mut world = world();
    let chunk = ChunkCoord { cx: 0, cy: 0 };
    world.show_chunk(chunk);

    for y in 0..16 {
        for x in 0..16 {
            if y == 8 {
                world
                    .edit_column(WorldCoord { x, y }, 0, TerrainMaterial::Grass)
                    .unwrap();
            } else {
                world
                    .edit_column(WorldCoord { x, y }, -1, TerrainMaterial::Water)
                    .unwrap();
            }
        }
    }
    let house = EntityBlueprint {
        id: "house".to_owned(),
        asset: EntityAsset {
            sprite: "/assets/house/block.svg".to_owned(),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
            draw_under_player: false,
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
            road_access: true,
        },
    };
    let rock = EntityBlueprint {
        id: "rock_small".to_owned(),
        asset: EntityAsset {
            sprite: "/assets/rock/block.png".to_owned(),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
            draw_under_player: false,
        },
        shape: EntityShape {
            height: 1,
            length: 1,
            axis: EntityLengthAxis::X,
            collision: vec![0.0],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            additional_surfaces: vec![TerrainMaterial::Path],
            road_access: false,
        },
    };
    let entities = [
        Entity::new(2, 7, &house, 0),
        Entity::new(13, 7, &house, 0),
        Entity::new(8, 8, &rock, 0),
    ];

    assert_eq!(world.connect_roads(chunk, &entities), 2);
    assert_eq!(
        world.column_at(WorldCoord { x: 8, y: 8 }).unwrap().surface,
        TerrainMaterial::Path,
        "the rock's cell carries the road; its collision never blocks the carve"
    );
}
