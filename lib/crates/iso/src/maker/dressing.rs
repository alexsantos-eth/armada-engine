//! The dressing chosen by hand over a cell: the colour zone and the top it grows.
//!
//! The noise decides how the whole world is dressed; an override replaces that answer for one
//! cell, so the maker can paint a meadow of flowers or a darker patch where the field would
//! have said otherwise. An empty dressing answers nothing and the noise stands. The overrides
//! live in the grid's own per-cell store, grouped by chunk, which is what a save of one edited
//! chunk will walk.

use crate::grid::{CellMap, WorldCoord};

/// What one cell was dressed with by hand.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct CellDressing {
    /// The colour zone chosen for the cell, or `None` to leave it to the noise.
    tint: Option<usize>,
    /// What the cell grows: `None` leaves it to the noise, `Some(None)` is the plain block.
    top: Option<Option<usize>>,
}

impl CellDressing {
    /// Whether this cell is back to following the noise in every respect.
    fn is_empty(self) -> bool {
        self.tint.is_none() && self.top.is_none()
    }
}

/// Per-cell dressing overrides, by cell.
#[derive(Clone, Default)]
pub struct Dressing {
    cells: CellMap<CellDressing>,
}

impl Dressing {
    /// Whether nothing has been overridden, so every cell keeps the dressing of the noise.
    pub fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }

    /// The dressing of `cell`, or its empty default where there is none.
    fn at(&self, cell: WorldCoord) -> CellDressing {
        self.cells
            .get(cell)
            .ok()
            .flatten()
            .copied()
            .unwrap_or_default()
    }

    /// Writes `dressing` over `cell`, dropping the entry once the cell follows the noise again.
    fn write(&mut self, cell: WorldCoord, dressing: CellDressing) {
        if dressing.is_empty() {
            let _ = self.cells.remove(cell);
            return;
        }
        let _ = self.cells.insert(cell, dressing);
    }

    /// The colour zone chosen for `cell`, or `None` when the noise still decides it.
    pub fn tint(&self, cell: WorldCoord) -> Option<usize> {
        self.at(cell).tint
    }

    /// Chooses the colour zone of `cell`; `None` gives the cell back to the noise.
    pub fn set_tint(&mut self, cell: WorldCoord, zone: Option<usize>) {
        let mut dressing = self.at(cell);
        dressing.tint = zone;
        self.write(cell, dressing);
    }

    /// What `cell` grows: `None` when the noise decides it, `Some(None)` for a plain block and
    /// `Some(Some(top))` for the chosen top.
    pub fn top(&self, cell: WorldCoord) -> Option<Option<usize>> {
        self.at(cell).top
    }

    /// Chooses what `cell` grows; `None` gives the cell back to the noise.
    pub fn set_top(&mut self, cell: WorldCoord, top: Option<Option<usize>>) {
        let mut dressing = self.at(cell);
        dressing.top = top;
        self.write(cell, dressing);
    }

    /// Drops every override of `cell`, and says whether it had any.
    pub fn clear(&mut self, cell: WorldCoord) -> bool {
        self.cells.remove(cell).ok().flatten().is_some()
    }
}

#[cfg(test)]
#[path = "dressing.test.rs"]
mod tests;
