//! Where one atlas sprite goes on screen, and how big it is drawn.
//!
//! The pipeline trims every sprite to its artwork before packing it, so a frame holds a drawing
//! and nothing else: no tile, no ground, no indication of where in the world the drawing
//! belongs. That is what [`InkBox`] carries, measured from the asset's source and written into
//! the manifest beside the frame (see [`crate::assets::ink`]). Placing a frame is then one
//! multiplication: the box is in tile widths, so scaling it by the projection's tile width and
//! offsetting it by the projected ground the asset stands on gives the rectangle to draw into.
//!
//! Deriving the rectangle from the world instead — from the footprint and height a blueprint
//! declares — is what this used to do, and it is wrong for every asset that does not fill its
//! template: it stood trees on the south corner of their tile and drew knee-high boulders the
//! size of a whole block.

use crate::assets::ink::InkBox;
use crate::projection::ScreenPoint;

/// Where to draw a frame, in screen pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpriteLayout {
    /// Left edge of the rectangle the frame is drawn into.
    pub x: f64,
    /// Top edge of that rectangle.
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Places an asset's artwork so that it lands where it was drawn, relative to `ground`: the
/// projected centre of the top face of the cell the asset stands on.
///
/// Both axes scale by the tile *width*, because the artwork is drawn in the same 2:1 screen
/// space the projection uses.
pub fn ink_layout(ground: ScreenPoint, ink: InkBox, tile_width: f64) -> SpriteLayout {
    SpriteLayout {
        x: ground.x + ink.x * tile_width,
        y: ground.y + ink.y * tile_width,
        width: ink.width * tile_width,
        height: ink.height * tile_width,
    }
}

/// One vertical band of a sprite: part of its artwork, and the part of the frame to sample.
///
/// `u` is the horizontal range of the frame the band shows, as fractions of the frame's width.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpriteSlice {
    pub layout: SpriteLayout,
    pub u: (f64, f64),
}

/// The band of a multi-cell sprite that stands on the `index`-th cell of its footprint.
///
/// A sprite covering several cells has one drawing and several depths: a three-cell pier is
/// nearer the camera at one end than at the other, and a building's far corner is behind a tree
/// that its near corner is in front of. Drawn as one quad it can only carry one depth key, so
/// whichever cell it sorts by is wrong for the rest of it — sorting by the near cell paints the
/// whole mass over a tree standing beside the far one, and sorting by the far cell lets the
/// ground in front of the near one paint over its base.
///
/// Cutting the drawing where the cells meet gives each part the depth of the cell it stands on.
/// The cut is vertical because that is how the cells divide on screen: consecutive cells of a
/// footprint are half a tile apart across the screen, in the direction `across` gives
/// (rightwards for a footprint along the engine's x, leftwards along its y), so the band between
/// the midpoints either side of a cell's centre contains that cell and no other. The bands at
/// the two ends run out to the drawing's own edges, so nothing is lost: the artwork overhangs
/// its footprint wherever it is taller than a block.
///
/// `anchor_x` is the projected screen x of the anchor cell's centre. Returns `None` when the
/// band falls outside the drawing altogether.
pub fn footprint_slice(
    layout: SpriteLayout,
    anchor_x: f64,
    index: i32,
    cells: i32,
    across: f64,
) -> Option<SpriteSlice> {
    if layout.width <= 0.0 || cells <= 1 {
        return Some(SpriteSlice { layout, u: (0.0, 1.0) });
    }
    let edge = |at: f64| anchor_x + (f64::from(index) + at) * across;
    let (mut left, mut right) = (edge(-0.5), edge(0.5));
    if left > right {
        std::mem::swap(&mut left, &mut right);
    }
    // The outermost bands take whatever the drawing reaches beyond the footprint.
    let last = cells - 1;
    let (first_on_screen, last_on_screen) = if across >= 0.0 { (0, last) } else { (last, 0) };
    if index == first_on_screen {
        left = left.min(layout.x);
    }
    if index == last_on_screen {
        right = right.max(layout.x + layout.width);
    }
    let left = left.max(layout.x);
    let right = right.min(layout.x + layout.width);
    if right <= left {
        return None;
    }
    Some(SpriteSlice {
        layout: SpriteLayout { x: left, y: layout.y, width: right - left, height: layout.height },
        u: (
            (left - layout.x) / layout.width,
            (right - layout.x) / layout.width,
        ),
    })
}

#[cfg(test)]
#[path = "layout.test.rs"]
mod tests;
