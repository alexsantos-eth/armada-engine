//! The grid of a player sprite sheet, read from the SVG that holds it.
//!
//! The player's poses are not drawn one asset to a file: `walk.svg`, `idle.svg`, `jump.svg` and
//! `climb.svg` are sheets of one cell per pose and facing, laid out in a grid with a gap between
//! the cells. Every cell shows the same window of the character's template — the `data-cell`
//! rectangle — so one box places every pose, and the figure stays on its spot as the animation
//! runs.
//!
//! The sheets are the reason the player used to be drawn from a thumbnail of a whole sheet: the
//! atlas packer fitted each file into one cell of its grid, which left a pose about sixteen
//! pixels across. They are packed into textures of their own instead (see `pack_atlas`), one
//! per sheet, and what this module reads is how to cut them up: the facings (the rows), the
//! poses (the columns) and the window every cell shows.
//!
//! The geometry is the same the TypeScript client reads out of `PLAYER_WALK`
//! (`web/src/isometric/content/player.ts`), except that it is read from the artwork itself rather
//! than written out beside it, so a regenerated sheet cannot disagree with its description.

use super::ink::{InkBox, SVG_ANCHOR, SVG_BLOCK_HEIGHT, SVG_TILE_WIDTH, attribute};

/// Top of the character template's canvas in the SVG's own units.
///
/// The template reaches one block above the ground plane so that a figure can stand on a block
/// (`viewBox="0 -341 1024 853"`), and a sheet's `data-cell` is measured from that top, like the
/// `canvas` of the TypeScript client's sheet description.
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
///
/// One row per facing, in the order the artwork declares (counter-clockwise from east, the same
/// order as `PLAYER_FACINGS`), and one column per pose. `poses` names them when the artwork
/// does (a jump's `takeoff rise apex fall landing`); the walk, idle and climb sheets number
/// their columns instead and leave it empty.
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
    /// it: `east-0`, or `east-takeoff` for a sheet whose columns are named.
    pub fn cell_id(&self, facing: usize, column: usize) -> Option<String> {
        let facing = self.facings.get(facing)?;
        if self.poses.is_empty() {
            (column < self.columns).then(|| format!("{facing}-{column}"))
        } else {
            self.poses.get(column).map(|pose| format!("{facing}-{pose}"))
        }
    }

    /// Where the artwork of every cell belongs over the ground the player stands on, in tile
    /// widths: the `data-cell` window, which is the same for every pose.
    ///
    /// A cell is a window on the character template, not a trimmed drawing, so this is the one
    /// box for the whole sheet: the poses move inside it and the box stays still, which is what
    /// keeps a walking figure from sliding about as its pose changes.
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
