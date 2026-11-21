//! Tests for patching part of a chunk's baked map: which columns, what is baked, what is copied.

use super::*;
use crate::grid::{ChunkCoord, WorldRect};

fn rect(min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> WorldRect {
    WorldRect {
        min_x,
        min_y,
        max_x,
        max_y,
    }
}

#[test]
fn a_patch_covers_the_stale_columns_inside_the_chunk_s_map() {
    let patch = patch_of(ChunkCoord { cx: 0, cy: 0 }, rect(-8, 4, 8, 20)).unwrap();
    assert_eq!(
        patch.inner,
        MapArea {
            min_x: -1,
            min_y: 4,
            max_x: 8,
            max_y: 20
        }
    );
    assert_eq!(
        patch.baked,
        MapArea {
            min_x: -1,
            min_y: 3,
            max_x: 9,
            max_y: 21
        }
    );
}

#[test]
fn a_chunk_the_stale_columns_miss_needs_no_patch() {
    assert_eq!(
        patch_of(ChunkCoord { cx: 2, cy: 0 }, rect(0, 0, 8, 8)),
        None
    );
}

#[test]
fn the_baked_area_never_leaves_the_chunk_s_map() {
    let patch = patch_of(ChunkCoord { cx: 0, cy: 0 }, rect(25, 25, 40, 40)).unwrap();
    assert_eq!(patch.inner.max_x, CHUNK_SIZE);
    assert_eq!(patch.baked.max_x, CHUNK_SIZE);
    assert_eq!(patch.baked.min_x, 24);
}

#[test]
fn the_copy_is_the_inner_rows_and_where_they_go_in_the_slot() {
    let area = MapArea {
        min_x: -1,
        min_y: -1,
        max_x: 1,
        max_y: 1,
    };
    let mut map = ShadowMap::new(area, 2);
    for (index, texel) in map.alpha.iter_mut().enumerate() {
        *texel = index as u8;
    }
    let inner = MapArea {
        min_x: 0,
        min_y: 0,
        max_x: 0,
        max_y: 0,
    };
    let chunk_map = MapArea {
        min_x: -1,
        min_y: -1,
        max_x: 30,
        max_y: 30,
    };
    let copy = copy_patch(&map, inner, chunk_map);
    assert_eq!((copy.x, copy.y, copy.width, copy.height), (2, 2, 2, 2));
    assert_eq!(copy.alpha, vec![14, 15, 20, 21]);
}
