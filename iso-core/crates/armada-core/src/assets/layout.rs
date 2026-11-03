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

#[cfg(test)]
#[path = "layout.test.rs"]
mod tests;
