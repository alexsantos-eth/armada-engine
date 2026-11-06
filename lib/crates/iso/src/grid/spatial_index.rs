//! Derived multi-cell occupancy index.

use std::collections::HashMap;
use std::fmt;
use std::hash::{DefaultHasher, Hash, Hasher};

use super::coords::{GridCoordOutOfRange, WorldCoord, WorldRect, assert_grid_coord};

/// A derived lookup of items that occupy one or more world columns.
///
/// Several items may share a cell. Rectangular results preserve item insertion order,
/// including after an item is moved (moving places it last). Rebuild this index from
/// world entities after loading; do not serialize it.
///
/// Each item is stored exactly once, in `items`, and everything else refers to it by slot. The
/// earlier layout kept a clone per footprint cell plus one as a map key, so indexing an entity
/// with a three-cell footprint stored five copies of it. For entities that carry blueprint data
/// that is the difference between an index that costs a pointer per cell and one that deep-copies
/// a JSON tree per cell.
#[derive(Debug)]
pub struct SpatialIndex<T: Eq + Hash + Clone> {
    /// One slot per insertion, in order. `None` marks a removed item; [`Self::compact`] reclaims
    /// the holes once they outnumber the live items.
    items: Vec<Option<T>>,
    /// Footprint of the item in the matching slot.
    cells: Vec<Vec<WorldCoord>>,
    /// Slots occupying each cell, in insertion order.
    by_cell: HashMap<WorldCoord, Vec<usize>>,
    /// Slots whose item has this hash. Lookup by item hashes, then confirms by equality, which
    /// is what lets the index find an item without keeping a copy of it as a key.
    slots_by_hash: HashMap<u64, Vec<usize>>,
    /// Live items, which is `items.len()` minus the holes.
    len: usize,
}

impl<T: Eq + Hash + Clone> Default for SpatialIndex<T> {
    fn default() -> Self {
        Self {
            items: Vec::new(),
            cells: Vec::new(),
            by_cell: HashMap::new(),
            slots_by_hash: HashMap::new(),
            len: 0,
        }
    }
}

fn hash_of<T: Hash>(item: &T) -> u64 {
    let mut hasher = DefaultHasher::new();
    item.hash(&mut hasher);
    hasher.finish()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpatialIndexError {
    AlreadyIndexed,
    CoordinateOutOfRange(GridCoordOutOfRange),
}

impl fmt::Display for SpatialIndexError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AlreadyIndexed => write!(f, "item is already indexed; use move_item"),
            Self::CoordinateOutOfRange(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for SpatialIndexError {}

impl<T: Eq + Hash + Clone> SpatialIndex<T> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Slot holding `item`, found by hash and confirmed by equality.
    fn slot_of(&self, item: &T) -> Option<usize> {
        self.slots_by_hash
            .get(&hash_of(item))?
            .iter()
            .copied()
            .find(|&slot| self.items[slot].as_ref() == Some(item))
    }

    pub fn contains(&self, item: &T) -> bool {
        self.slot_of(item).is_some()
    }

    /// Live items with their slot, in insertion order.
    fn live(&self) -> impl Iterator<Item = (usize, &T)> {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(slot, item)| item.as_ref().map(|item| (slot, item)))
    }

    /// Insert an item, ignoring repeated cells in its footprint.
    /// An empty footprint is allowed, matching the domain index contract.
    pub fn insert(&mut self, item: T, cells: &[WorldCoord]) -> Result<(), SpatialIndexError> {
        if self.contains(&item) {
            return Err(SpatialIndexError::AlreadyIndexed);
        }
        // Every coordinate is validated before anything is written, so a rejected footprint
        // leaves the index exactly as it was.
        let mut unique = Vec::with_capacity(cells.len());
        for &cell in cells {
            assert_grid_coord(cell).map_err(SpatialIndexError::CoordinateOutOfRange)?;
            if !unique.contains(&cell) {
                unique.push(cell);
            }
        }
        let slot = self.items.len();
        for &cell in &unique {
            self.by_cell.entry(cell).or_default().push(slot);
        }
        self.slots_by_hash
            .entry(hash_of(&item))
            .or_default()
            .push(slot);
        self.cells.push(unique);
        self.items.push(Some(item));
        self.len += 1;
        Ok(())
    }

    pub fn remove(&mut self, item: &T) -> bool {
        let Some(slot) = self.slot_of(item) else {
            return false;
        };
        for cell in std::mem::take(&mut self.cells[slot]) {
            if let Some(slots) = self.by_cell.get_mut(&cell) {
                slots.retain(|&other| other != slot);
                if slots.is_empty() {
                    self.by_cell.remove(&cell);
                }
            }
        }
        let hash = hash_of(item);
        if let Some(slots) = self.slots_by_hash.get_mut(&hash) {
            slots.retain(|&other| other != slot);
            if slots.is_empty() {
                self.slots_by_hash.remove(&hash);
            }
        }
        self.items[slot] = None;
        self.len -= 1;
        self.compact_if_sparse();
        true
    }

    /// Reclaims removed slots once they outnumber the live items, so an index that is moved
    /// through repeatedly does not grow without bound. Insertion order is preserved.
    fn compact_if_sparse(&mut self) {
        if self.items.len() < 32 || self.len * 2 > self.items.len() {
            return;
        }
        let mut items = Vec::with_capacity(self.len);
        let mut cells = Vec::with_capacity(self.len);
        for (slot, _) in self.live().map(|(slot, _)| (slot, ())).collect::<Vec<_>>() {
            items.push(self.items[slot].take());
            cells.push(std::mem::take(&mut self.cells[slot]));
        }
        self.by_cell.clear();
        self.slots_by_hash.clear();
        for (slot, footprint) in cells.iter().enumerate() {
            for &cell in footprint {
                self.by_cell.entry(cell).or_default().push(slot);
            }
            let item = items[slot].as_ref().expect("compacted slots are live");
            self.slots_by_hash
                .entry(hash_of(item))
                .or_default()
                .push(slot);
        }
        self.items = items;
        self.cells = cells;
    }

    /// Move an existing item or insert a missing one. Invalid coordinates leave the index intact.
    pub fn move_item(&mut self, item: T, cells: &[WorldCoord]) -> Result<(), SpatialIndexError> {
        for &cell in cells {
            assert_grid_coord(cell).map_err(SpatialIndexError::CoordinateOutOfRange)?;
        }
        self.remove(&item);
        self.insert(item, cells)
    }

    /// Items occupying `cell`, in insertion order.
    pub fn at(&self, cell: WorldCoord) -> impl Iterator<Item = &T> {
        self.by_cell
            .get(&cell)
            .map(Vec::as_slice)
            .unwrap_or(&[])
            .iter()
            .filter_map(|&slot| self.items[slot].as_ref())
    }

    pub fn is_occupied(&self, cell: WorldCoord) -> bool {
        self.by_cell.contains_key(&cell)
    }

    pub fn cells_of(&self, item: &T) -> &[WorldCoord] {
        self.slot_of(item)
            .map(|slot| self.cells[slot].as_slice())
            .unwrap_or(&[])
    }

    pub fn items(&self) -> impl Iterator<Item = &T> {
        self.live().map(|(_, item)| item)
    }

    pub fn query_rect(&self, rect: WorldRect) -> Vec<&T> {
        self.query_rect_where(rect, |_| true)
    }

    pub fn query_rect_where(&self, rect: WorldRect, mut filter: impl FnMut(&T) -> bool) -> Vec<&T> {
        if rect.max_x < rect.min_x || rect.max_y < rect.min_y {
            return Vec::new();
        }
        self.live()
            .filter(|(slot, item)| {
                filter(item)
                    && self.cells[*slot].iter().any(|cell| {
                        cell.x >= rect.min_x
                            && cell.x <= rect.max_x
                            && cell.y >= rect.min_y
                            && cell.y <= rect.max_y
                    })
            })
            .map(|(_, item)| item)
            .collect()
    }

    pub fn any_in_rect(&self, rect: WorldRect, mut filter: impl FnMut(&T) -> bool) -> bool {
        if rect.max_x < rect.min_x || rect.max_y < rect.min_y {
            return false;
        }
        let width = i128::from(rect.max_x) - i128::from(rect.min_x) + 1;
        let height = i128::from(rect.max_y) - i128::from(rect.min_y) + 1;
        if width * height <= self.by_cell.len() as i128 {
            for x in rect.min_x..=rect.max_x {
                for y in rect.min_y..=rect.max_y {
                    if self.at(WorldCoord { x, y }).any(&mut filter) {
                        return true;
                    }
                }
            }
            return false;
        }
        self.live().any(|(slot, item)| {
            filter(item)
                && self.cells[slot].iter().any(|cell| {
                    cell.x >= rect.min_x
                        && cell.x <= rect.max_x
                        && cell.y >= rect.min_y
                        && cell.y <= rect.max_y
                })
        })
    }

    /// Chebyshev-radius query, including diagonal cells.
    pub fn query_radius(&self, centre: WorldCoord, radius: i32) -> Vec<&T> {
        if radius < 0 {
            return Vec::new();
        }
        self.query_rect(WorldRect {
            min_x: centre.x.saturating_sub(radius),
            min_y: centre.y.saturating_sub(radius),
            max_x: centre.x.saturating_add(radius),
            max_y: centre.y.saturating_add(radius),
        })
    }
}

#[cfg(test)]
#[path = "spatial_index.test.rs"]
mod tests;
