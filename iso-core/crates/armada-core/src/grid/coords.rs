//! Integer world, chunk, and local coordinates. World axes match the TypeScript contracts.

use std::fmt;

pub const CHUNK_SIZE: i32 = 32;
pub const MAX_GRID_COORD: i32 = (1 << 20) - 1;
const SPAN: u64 = (2 * MAX_GRID_COORD + 1) as u64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct WorldCoord {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct ChunkCoord {
    pub cx: i32,
    pub cy: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct LocalCoord {
    pub lx: i32,
    pub ly: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WorldRect {
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32,
    pub max_y: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct CellKey(u64);

impl CellKey {
    pub const fn as_u64(self) -> u64 {
        self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct ChunkKey(u64);

impl ChunkKey {
    pub const fn as_u64(self) -> u64 {
        self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GridCoordOutOfRange {
    pub x: i32,
    pub y: i32,
}

impl fmt::Display for GridCoordOutOfRange {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Grid coordinate out of range: ({}, {})", self.x, self.y)
    }
}

impl std::error::Error for GridCoordOutOfRange {}

pub fn assert_grid_coord(coord: WorldCoord) -> Result<(), GridCoordOutOfRange> {
    let range = -MAX_GRID_COORD..=MAX_GRID_COORD;
    if range.contains(&coord.x) && range.contains(&coord.y) {
        Ok(())
    } else {
        Err(GridCoordOutOfRange {
            x: coord.x,
            y: coord.y,
        })
    }
}

fn pack_key(coord: WorldCoord) -> Result<u64, GridCoordOutOfRange> {
    assert_grid_coord(coord)?;
    let x = (coord.x + MAX_GRID_COORD) as u64;
    let y = (coord.y + MAX_GRID_COORD) as u64;
    Ok(x * SPAN + y)
}

fn unpack_key(key: u64) -> WorldCoord {
    WorldCoord {
        x: (key / SPAN) as i32 - MAX_GRID_COORD,
        y: (key % SPAN) as i32 - MAX_GRID_COORD,
    }
}

pub fn cell_key(coord: WorldCoord) -> Result<CellKey, GridCoordOutOfRange> {
    pack_key(coord).map(CellKey)
}

pub fn cell_from_key(key: CellKey) -> WorldCoord {
    unpack_key(key.0)
}

pub fn chunk_key(coord: ChunkCoord) -> Result<ChunkKey, GridCoordOutOfRange> {
    pack_key(WorldCoord {
        x: coord.cx,
        y: coord.cy,
    })
    .map(ChunkKey)
}

pub fn chunk_from_key(key: ChunkKey) -> ChunkCoord {
    let coord = unpack_key(key.0);
    ChunkCoord {
        cx: coord.x,
        cy: coord.y,
    }
}

pub fn to_chunk_coord(coord: WorldCoord) -> ChunkCoord {
    ChunkCoord {
        cx: coord.x.div_euclid(CHUNK_SIZE),
        cy: coord.y.div_euclid(CHUNK_SIZE),
    }
}

pub fn to_local_coord(coord: WorldCoord) -> LocalCoord {
    LocalCoord {
        lx: coord.x.rem_euclid(CHUNK_SIZE),
        ly: coord.y.rem_euclid(CHUNK_SIZE),
    }
}

pub fn to_world_coord(chunk: ChunkCoord, local: LocalCoord) -> WorldCoord {
    WorldCoord {
        x: chunk.cx * CHUNK_SIZE + local.lx,
        y: chunk.cy * CHUNK_SIZE + local.ly,
    }
}

pub fn chunk_rect(chunk: ChunkCoord) -> WorldRect {
    WorldRect {
        min_x: chunk.cx * CHUNK_SIZE,
        min_y: chunk.cy * CHUNK_SIZE,
        max_x: (chunk.cx + 1) * CHUNK_SIZE - 1,
        max_y: (chunk.cy + 1) * CHUNK_SIZE - 1,
    }
}

pub fn chunks_around(centre: ChunkCoord, radius: i32) -> Vec<ChunkCoord> {
    let mut chunks = Vec::new();
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            chunks.push(ChunkCoord {
                cx: centre.cx + dx,
                cy: centre.cy + dy,
            });
        }
    }
    chunks
}

pub fn chunks_in_rect(rect: WorldRect) -> Vec<ChunkCoord> {
    if rect.max_x < rect.min_x || rect.max_y < rect.min_y {
        return Vec::new();
    }
    let min = to_chunk_coord(WorldCoord {
        x: rect.min_x,
        y: rect.min_y,
    });
    let max = to_chunk_coord(WorldCoord {
        x: rect.max_x,
        y: rect.max_y,
    });
    let mut chunks = Vec::new();
    for cy in min.cy..=max.cy {
        for cx in min.cx..=max.cx {
            chunks.push(ChunkCoord { cx, cy });
        }
    }
    chunks
}

#[cfg(test)]
#[path = "coords.test.rs"]
mod tests;
