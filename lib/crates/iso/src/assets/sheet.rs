//! The grid of a player sprite sheet, read from its JSON sidecar beside the artwork.
//!
//! The sidecar is the whole sheet declaration: `{"frames": 9, "gap": 48, "cell": [x, y, w, h],
//! "facings": ["east", …], "poses": ["takeoff", …]}`. It is not the artwork; it says where
//! every cell of it sits and what each row and column of the sheet is.

use serde::Deserialize;

use super::ink::{InkBox, SVG_ANCHOR, SVG_BLOCK_HEIGHT, SVG_TILE_WIDTH};

/// Top of the character template's canvas in the sidecar's own units.
pub const SVG_CANVAS_TOP: f64 = -SVG_BLOCK_HEIGHT;

/// A rectangle of the character's canvas, in the sidecar's own units.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SheetCell {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// How a sheet is laid out: its cells, the gap between them, and what each row and column is.
#[derive(Clone, Debug, PartialEq)]
pub struct SheetGrid {
    pub cell: SheetCell,
    pub gap: f64,
    pub columns: usize,
    pub facings: Vec<String>,
    pub poses: Vec<String>,
}

impl SheetGrid {
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

/// The file the sidecar is, in the shape `parse_sheet` validates.
#[derive(Deserialize)]
struct SheetFile {
    frames: usize,
    #[serde(default)]
    gap: f64,
    cell: [f64; 4],
    facings: Vec<String>,
    #[serde(default)]
    poses: Vec<String>,
}

/// Reads the grid out of a sheet's JSON sidecar, or `None` if there is none or it is not one.
pub fn parse_sheet(json: &str) -> Option<SheetGrid> {
    let file: SheetFile = serde_json::from_str(json).ok()?;
    let [x, y, width, height] = file.cell;
    if width <= 0.0 || height <= 0.0 || file.frames == 0 || file.facings.is_empty() {
        return None;
    }
    Some(SheetGrid {
        cell: SheetCell {
            x,
            y,
            width,
            height,
        },
        gap: file.gap,
        columns: file.frames,
        facings: file.facings,
        poses: file.poses,
    })
}

#[cfg(test)]
#[path = "sheet.test.rs"]
mod tests;
