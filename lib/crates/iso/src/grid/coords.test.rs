use crate::grid::{
    CHUNK_SIZE, ChunkCoord, MAX_GRID_COORD, WorldCoord, WorldRect, assert_grid_coord,
    cell_from_key, cell_key, chunk_from_key, chunk_key, chunk_rect, chunks_around, chunks_in_rect,
    to_chunk_coord, to_local_coord, to_world_coord,
};
use std::collections::HashSet;

#[test]
fn packed_keys_are_distinct_safe_for_javascript_and_round_trip() {
    let mut keys = HashSet::new();
    for x in -3..=3 {
        for y in -3..=3 {
            let point = WorldCoord { x, y };
            let key = cell_key(point).unwrap();
            assert_eq!(cell_from_key(key), point);
            keys.insert(key);
        }
    }
    assert_eq!(keys.len(), 49);
    for edge in [-MAX_GRID_COORD, MAX_GRID_COORD] {
        let point = WorldCoord { x: edge, y: edge };
        let key = cell_key(point).unwrap();
        assert_eq!(cell_from_key(key), point);
        assert!(key.as_u64() < (1_u64 << 53));
    }
    let chunk = ChunkCoord { cx: -2, cy: 5 };
    assert_eq!(chunk_from_key(chunk_key(chunk).unwrap()), chunk);
    assert!(chunk_key(chunk).unwrap().as_u64() < (1_u64 << 53));
}

#[test]
fn key_range_rejects_invalid_coordinates() {
    for point in [
        WorldCoord {
            x: MAX_GRID_COORD + 1,
            y: 0,
        },
        WorldCoord { x: 0, y: i32::MIN },
    ] {
        assert!(assert_grid_coord(point).is_err());
        assert!(cell_key(point).is_err());
    }
    assert_eq!(assert_grid_coord(WorldCoord { x: 0, y: 0 }), Ok(()));
    assert_eq!(
        cell_key(WorldCoord {
            x: MAX_GRID_COORD + 1,
            y: 0,
        })
        .unwrap_err()
        .to_string(),
        format!("Grid coordinate out of range: ({}, 0)", MAX_GRID_COORD + 1)
    );
}

#[test]
fn negative_edges_and_chunk_rectangle_are_consistent() {
    for world in [
        WorldCoord { x: -1, y: -32 },
        WorldCoord { x: -33, y: 32 },
        WorldCoord { x: 31, y: 32 },
    ] {
        let chunk = to_chunk_coord(world);
        let local = to_local_coord(world);
        assert_eq!(to_world_coord(chunk, local), world);
        let rect = chunk_rect(chunk);
        assert!((rect.min_x..=rect.max_x).contains(&world.x));
        assert!((rect.min_y..=rect.max_y).contains(&world.y));
    }
    assert_eq!(
        chunk_rect(ChunkCoord { cx: -1, cy: 2 }),
        WorldRect {
            min_x: -CHUNK_SIZE,
            min_y: 2 * CHUNK_SIZE,
            max_x: -1,
            max_y: 3 * CHUNK_SIZE - 1,
        }
    );
}

#[test]
fn chunk_ranges_follow_row_major_order() {
    assert_eq!(
        chunks_around(ChunkCoord { cx: 0, cy: 0 }, 1),
        vec![
            ChunkCoord { cx: -1, cy: -1 },
            ChunkCoord { cx: 0, cy: -1 },
            ChunkCoord { cx: 1, cy: -1 },
            ChunkCoord { cx: -1, cy: 0 },
            ChunkCoord { cx: 0, cy: 0 },
            ChunkCoord { cx: 1, cy: 0 },
            ChunkCoord { cx: -1, cy: 1 },
            ChunkCoord { cx: 0, cy: 1 },
            ChunkCoord { cx: 1, cy: 1 },
        ]
    );
    assert_eq!(
        chunks_in_rect(WorldRect {
            min_x: -1,
            min_y: 0,
            max_x: CHUNK_SIZE,
            max_y: 3,
        }),
        vec![
            ChunkCoord { cx: -1, cy: 0 },
            ChunkCoord { cx: 0, cy: 0 },
            ChunkCoord { cx: 1, cy: 0 },
        ]
    );
    assert!(
        chunks_in_rect(WorldRect {
            min_x: 5,
            min_y: 5,
            max_x: 4,
            max_y: 9,
        })
        .is_empty()
    );
    assert!(
        chunks_in_rect(WorldRect {
            min_x: 5,
            min_y: 5,
            max_x: 9,
            max_y: 4,
        })
        .is_empty()
    );
}
