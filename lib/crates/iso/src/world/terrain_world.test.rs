use super::*;
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
