//! Derived multi-cell occupancy index.

use std::collections::HashMap;
use std::fmt;
use std::hash::Hash;

use super::coords::{GridCoordOutOfRange, WorldCoord, WorldRect, assert_grid_coord};

/// A derived lookup of items that occupy one or more world columns.
///
/// Several items may share a cell. Rectangular results preserve item insertion order,
/// including after an item is moved (moving places it last). Rebuild this index from
/// world entities after loading; do not serialize it.
#[derive(Debug)]
pub struct SpatialIndex<T: Eq + Hash + Clone> {
    by_cell: HashMap<WorldCoord, Vec<T>>,
    cells_by_item: HashMap<T, Vec<WorldCoord>>,
    order: Vec<T>,
}

impl<T: Eq + Hash + Clone> Default for SpatialIndex<T> {
    fn default() -> Self {
        Self {
            by_cell: HashMap::new(),
            cells_by_item: HashMap::new(),
            order: Vec::new(),
        }
    }
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
        self.order.len()
    }

    pub fn is_empty(&self) -> bool {
        self.order.is_empty()
    }

    pub fn contains(&self, item: &T) -> bool {
        self.cells_by_item.contains_key(item)
    }

    /// Insert an item, ignoring repeated cells in its footprint.
    /// An empty footprint is allowed, matching the domain index contract.
    pub fn insert(&mut self, item: T, cells: &[WorldCoord]) -> Result<(), SpatialIndexError> {
        if self.contains(&item) {
            return Err(SpatialIndexError::AlreadyIndexed);
        }
        let mut unique = Vec::with_capacity(cells.len());
        for &cell in cells {
            assert_grid_coord(cell).map_err(SpatialIndexError::CoordinateOutOfRange)?;
            if !unique.contains(&cell) {
                unique.push(cell);
            }
        }
        for &cell in &unique {
            self.by_cell.entry(cell).or_default().push(item.clone());
        }
        self.cells_by_item.insert(item.clone(), unique);
        self.order.push(item);
        Ok(())
    }

    pub fn remove(&mut self, item: &T) -> bool {
        let Some(cells) = self.cells_by_item.remove(item) else {
            return false;
        };
        for cell in cells {
            if let Some(items) = self.by_cell.get_mut(&cell) {
                items.retain(|other| other != item);
                if items.is_empty() {
                    self.by_cell.remove(&cell);
                }
            }
        }
        self.order.retain(|other| other != item);
        true
    }

    /// Move an existing item or insert a missing one. Invalid coordinates leave the index intact.
    pub fn move_item(&mut self, item: T, cells: &[WorldCoord]) -> Result<(), SpatialIndexError> {
        for &cell in cells {
            assert_grid_coord(cell).map_err(SpatialIndexError::CoordinateOutOfRange)?;
        }
        self.remove(&item);
        self.insert(item, cells)
    }

    pub fn at(&self, cell: WorldCoord) -> &[T] {
        self.by_cell.get(&cell).map(Vec::as_slice).unwrap_or(&[])
    }

    pub fn is_occupied(&self, cell: WorldCoord) -> bool {
        self.by_cell.contains_key(&cell)
    }

    pub fn cells_of(&self, item: &T) -> &[WorldCoord] {
        self.cells_by_item
            .get(item)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub fn items(&self) -> impl Iterator<Item = &T> {
        self.order.iter()
    }

    pub fn query_rect(&self, rect: WorldRect) -> Vec<&T> {
        self.query_rect_where(rect, |_| true)
    }

    pub fn query_rect_where(&self, rect: WorldRect, mut filter: impl FnMut(&T) -> bool) -> Vec<&T> {
        if rect.max_x < rect.min_x || rect.max_y < rect.min_y {
            return Vec::new();
        }
        self.order
            .iter()
            .filter(|item| {
                filter(item)
                    && self.cells_by_item[*item].iter().any(|cell| {
                        cell.x >= rect.min_x
                            && cell.x <= rect.max_x
                            && cell.y >= rect.min_y
                            && cell.y <= rect.max_y
                    })
            })
            .collect()
    }

    pub fn any_in_rect(&self, rect: WorldRect, mut filter: impl FnMut(&T) -> bool) -> bool {
        if rect.max_x < rect.min_x || rect.max_y < rect.min_y {
            return false;
        }
        let width = i64::from(rect.max_x) - i64::from(rect.min_x) + 1;
        let height = i64::from(rect.max_y) - i64::from(rect.min_y) + 1;
        if width * height <= self.by_cell.len() as i64 {
            for x in rect.min_x..=rect.max_x {
                for y in rect.min_y..=rect.max_y {
                    if self.at(WorldCoord { x, y }).iter().any(&mut filter) {
                        return true;
                    }
                }
            }
            return false;
        }
        self.order.iter().any(|item| {
            filter(item)
                && self.cells_by_item[item].iter().any(|cell| {
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
