//! Patching part of a chunk's baked shadow map: when something is taken out of the world, only
//! the columns its shadow could reach are baked again, over a small map, and copied over the
//! chunk's map in place, instead of baking the whole chunk.

use crate::grid::{CHUNK_SIZE, ChunkCoord, WorldRect};
use crate::lighting::{MapArea, SHADOW_MAP_MARGIN, ShadowMap};

/// The part of one chunk's map a patch bakes again.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MapPatch {
    pub coord: ChunkCoord,
    /// The columns copied over the chunk's map: the stale ones inside it.
    pub inner: MapArea,
    /// The columns baked: `inner` and a tile around it, so the blur at its edge reads the same
    /// texels the chunk's own bake did, kept inside the chunk's map.
    pub baked: MapArea,
}

/// Texels to copy over a chunk's map: `width` × `height` of them, row by row, landing at
/// `(x, y)` of the chunk's map.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PatchCopy {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub alpha: Vec<u8>,
}

/// The map a chunk's bake covers: its columns and the margin around them.
pub fn chunk_map_area(coord: ChunkCoord) -> MapArea {
    let min_x = coord.cx * CHUNK_SIZE;
    let min_y = coord.cy * CHUNK_SIZE;
    MapArea::around(min_x, min_y, min_x + CHUNK_SIZE - 1, min_y + CHUNK_SIZE - 1)
}

/// The patch `coord`'s map needs for the stale columns `stale`, or `None` when they miss it.
pub fn patch_of(coord: ChunkCoord, stale: WorldRect) -> Option<MapPatch> {
    let map = chunk_map_area(coord);
    let inner = MapArea {
        min_x: stale.min_x.max(map.min_x),
        min_y: stale.min_y.max(map.min_y),
        max_x: stale.max_x.min(map.max_x),
        max_y: stale.max_y.min(map.max_y),
    };
    if inner.min_x > inner.max_x || inner.min_y > inner.max_y {
        return None;
    }
    let baked = MapArea {
        min_x: (inner.min_x - SHADOW_MAP_MARGIN).max(map.min_x),
        min_y: (inner.min_y - SHADOW_MAP_MARGIN).max(map.min_y),
        max_x: (inner.max_x + SHADOW_MAP_MARGIN).min(map.max_x),
        max_y: (inner.max_y + SHADOW_MAP_MARGIN).min(map.max_y),
    };
    Some(MapPatch {
        coord,
        inner,
        baked,
    })
}

/// The texels of `inner` out of `map` (baked over a larger area), and where they land in a
/// chunk map covering `chunk_map`.
pub fn copy_patch(map: &ShadowMap, inner: MapArea, chunk_map: MapArea) -> PatchCopy {
    let per_tile = map.pixels_per_tile;
    let width = inner.columns().max(0) as u32 * per_tile;
    let height = inner.rows().max(0) as u32 * per_tile;
    let from_x = (inner.min_x - map.area.min_x) as u32 * per_tile;
    let from_y = (inner.min_y - map.area.min_y) as u32 * per_tile;
    let mut alpha = Vec::with_capacity((width * height) as usize);
    for row in from_y..from_y + height {
        let start = (row * map.width + from_x) as usize;
        alpha.extend_from_slice(&map.alpha[start..start + width as usize]);
    }
    PatchCopy {
        x: (inner.min_x - chunk_map.min_x) as u32 * per_tile,
        y: (inner.min_y - chunk_map.min_y) as u32 * per_tile,
        width,
        height,
        alpha,
    }
}

#[cfg(test)]
#[path = "patch.test.rs"]
mod tests;
