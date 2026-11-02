//! One value per world column, grouped by chunk with stable insertion order.

use std::collections::HashMap;

use super::coords::{
    CHUNK_SIZE, ChunkCoord, GridCoordOutOfRange, WorldCoord, assert_grid_coord, to_chunk_coord,
    to_local_coord,
};

struct Bucket<T> {
    chunk: ChunkCoord,
    values: HashMap<i32, T>,
    order: Vec<i32>,
}

/// A chunk-local map whose iteration visits chunks, then cells, in insertion order.
/// Replacing a cell preserves its position. Empty chunks are forgotten, so a later
/// insertion into the same chunk places it at the end of the chunk order.
pub struct CellMap<T> {
    buckets: Vec<Bucket<T>>,
    by_chunk: HashMap<ChunkCoord, usize>,
    len: usize,
}

impl<T> Default for CellMap<T> {
    fn default() -> Self {
        Self {
            buckets: Vec::new(),
            by_chunk: HashMap::new(),
            len: 0,
        }
    }
}

impl<T> CellMap<T> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    fn location(coord: WorldCoord) -> Result<(ChunkCoord, i32), GridCoordOutOfRange> {
        assert_grid_coord(coord)?;
        let chunk = to_chunk_coord(coord);
        let local = to_local_coord(coord);
        Ok((chunk, local.ly * CHUNK_SIZE + local.lx))
    }

    pub fn get(&self, coord: WorldCoord) -> Result<Option<&T>, GridCoordOutOfRange> {
        let (chunk, local) = Self::location(coord)?;
        Ok(self
            .by_chunk
            .get(&chunk)
            .and_then(|&index| self.buckets[index].values.get(&local)))
    }

    pub fn get_mut(&mut self, coord: WorldCoord) -> Result<Option<&mut T>, GridCoordOutOfRange> {
        let (chunk, local) = Self::location(coord)?;
        Ok(self
            .by_chunk
            .get(&chunk)
            .and_then(|&index| self.buckets[index].values.get_mut(&local)))
    }

    pub fn contains(&self, coord: WorldCoord) -> Result<bool, GridCoordOutOfRange> {
        Ok(self.get(coord)?.is_some())
    }

    /// Returns the previous value, if any. A value can itself be an `Option<T>`.
    pub fn insert(
        &mut self,
        coord: WorldCoord,
        value: T,
    ) -> Result<Option<T>, GridCoordOutOfRange> {
        let (chunk, local) = Self::location(coord)?;
        let index = match self.by_chunk.get(&chunk) {
            Some(&index) => index,
            None => {
                let index = self.buckets.len();
                self.buckets.push(Bucket {
                    chunk,
                    values: HashMap::new(),
                    order: Vec::new(),
                });
                self.by_chunk.insert(chunk, index);
                index
            }
        };
        let bucket = &mut self.buckets[index];
        let old = bucket.values.insert(local, value);
        if old.is_none() {
            bucket.order.push(local);
            self.len += 1;
        }
        Ok(old)
    }

    pub fn remove(&mut self, coord: WorldCoord) -> Result<Option<T>, GridCoordOutOfRange> {
        let (chunk, local) = Self::location(coord)?;
        let Some(&index) = self.by_chunk.get(&chunk) else {
            return Ok(None);
        };
        let bucket = &mut self.buckets[index];
        let removed = bucket.values.remove(&local);
        if removed.is_some() {
            bucket.order.retain(|&entry| entry != local);
            self.len -= 1;
            if bucket.values.is_empty() {
                self.buckets.remove(index);
                self.by_chunk.remove(&chunk);
                for position in self.by_chunk.values_mut() {
                    if *position > index {
                        *position -= 1;
                    }
                }
            }
        }
        Ok(removed)
    }

    pub fn entries(&self) -> impl Iterator<Item = (WorldCoord, &T)> {
        self.buckets.iter().flat_map(|bucket| {
            bucket.order.iter().map(move |&local| {
                let coord = WorldCoord {
                    x: bucket.chunk.cx * CHUNK_SIZE + local % CHUNK_SIZE,
                    y: bucket.chunk.cy * CHUNK_SIZE + local / CHUNK_SIZE,
                };
                (coord, &bucket.values[&local])
            })
        })
    }

    pub fn values(&self) -> impl Iterator<Item = &T> {
        self.entries().map(|(_, value)| value)
    }
}

#[cfg(test)]
#[path = "cell_map.test.rs"]
mod tests;
