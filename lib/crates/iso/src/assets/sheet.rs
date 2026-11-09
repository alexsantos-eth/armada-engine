//! The grid of a player sprite sheet, read from the SVG that holds it.

use super::ink::{InkBox, SVG_ANCHOR, SVG_BLOCK_HEIGHT, SVG_TILE_WIDTH, attribute};

/// Top of the character template's canvas in the SVG's own units.
pub const SVG_CANVAS_TOP: f64 = -SVG_BLOCK_HEIGHT;

/// A rectangle of the character's canvas, in the SVG's own units.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SheetCell {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// How a sheet is laid out: its cells, the gap between them, and what each row and column is.
#[derive(Clone, Debug, PartialEq)]
pub struct SheetGrid<'a> {
    pub cell: SheetCell,
    pub gap: f64,
    pub columns: usize,
    pub facings: Vec<&'a str>,
    pub poses: Vec<&'a str>,
}

impl SheetGrid<'_> {
    /// Rows of the sheet: one per facing.
    pub fn rows(&self) -> usize {
        self.facings.len()
    }

    /// The id of the group holding the pose in `column` of `facing`'s row, as the artwork names
    pub fn cell_id(&self, facing: usize, column: usize) -> Option<String> {
        let facing = self.facings.get(facing)?;
        if self.poses.is_empty() {
            (column < self.columns).then(|| format!("{facing}-{column}"))
        } else {
            self.poses
                .get(column)
                .map(|pose| format!("{facing}-{pose}"))
        }
    }

    /// Where the artwork of every cell belongs over the ground the player stands on, in tile
    pub fn ink(&self) -> InkBox {
        InkBox {
            x: (self.cell.x - SVG_ANCHOR.0) / SVG_TILE_WIDTH,
            y: (self.cell.y + SVG_CANVAS_TOP - SVG_ANCHOR.1) / SVG_TILE_WIDTH,
            width: self.cell.width / SVG_TILE_WIDTH,
            height: self.cell.height / SVG_TILE_WIDTH,
        }
    }
}

/// Reads the grid out of a sheet's SVG, or `None` if it is not one (no `data-frames`).
pub fn parse_sheet(svg: &str) -> Option<SheetGrid<'_>> {
    let columns: usize = attribute(svg, "data-frames")?.trim().parse().ok()?;
    let cell = attribute(svg, "data-cell")?;
    let mut numbers = cell.split_whitespace().map(str::parse::<f64>);
    let mut next = || numbers.next().and_then(Result::ok);
    let cell = SheetCell {
        x: next()?,
        y: next()?,
        width: next()?,
        height: next()?,
    };
    if cell.width <= 0.0 || cell.height <= 0.0 || columns == 0 {
        return None;
    }
    let facings: Vec<&str> = attribute(svg, "data-facings")?.split_whitespace().collect();
    if facings.is_empty() {
        return None;
    }
    Some(SheetGrid {
        cell,
        gap: attribute(svg, "data-gap")
            .and_then(|gap| gap.trim().parse().ok())
            .unwrap_or(0.0),
        columns,
        facings,
        poses: attribute(svg, "data-poses")
            .map(|poses| poses.split_whitespace().collect())
            .unwrap_or_default(),
    })
}

#[cfg(test)]
#[path = "sheet.test.rs"]
mod tests;
