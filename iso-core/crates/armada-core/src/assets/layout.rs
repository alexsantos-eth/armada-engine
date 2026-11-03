//! Where one atlas sprite goes on screen, and how big it is drawn.
//!
//! Every sprite in the atlas is one rasterized SVG, fitted into a square frame with its aspect
//! ratio preserved and centred in it (the frames are 128x128 in the current atlas). That fit is
//! lossy: the frame no longer says how many world tiles the artwork covers, and the manifest's
//! `anchor` points at the *frame*, whose padding depends on the artwork's aspect, not at the
//! artwork itself. So placement is derived from the world instead, from the footprint the
//! blueprint declares.
//!
//! Every block asset is drawn inside the same two-diamond template: a diamond over the ground
//! the object stands on, the body rising `height` elevation steps above it, and the bounds
//! reaching one half tile below the ground diamond's centre. A terrain block is the same shape
//! standing on the column below it. That makes the artwork's extent computable:
//!
//! * width  = `(length + 1) * tile_width / 2`  — the footprint's diagonal on screen;
//! * height = `(length + 1) * tile_height / 2 + height * elevation_step`.
//!
//! The larger of the two is what the frame's side was fitted to, so drawing the whole frame as a
//! square of that side puts the artwork at exactly its world size, whatever its own aspect.

use crate::entities::EntityLengthAxis;
use crate::projection::{ProjectionConfig, ScreenPoint};

/// Where to draw a whole atlas frame, in screen pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpriteLayout {
    /// Left edge of the square the frame is drawn into.
    pub x: f64,
    /// Top edge of that square.
    pub y: f64,
    /// Side of that square. Frames are square, so one number covers both axes.
    pub size: f64,
}

/// Layout of one sprite standing on `ground`, the projected centre of the top face its anchor
/// cell rests on.
///
/// `length` is the footprint along `axis` in cells and `height` the body in elevation steps;
/// both are clamped to sane minimums so a malformed blueprint cannot produce a sprite of
/// negative size.
pub fn sprite_layout(
    ground: ScreenPoint,
    length: i32,
    height: i32,
    axis: EntityLengthAxis,
    config: ProjectionConfig,
) -> SpriteLayout {
    let length = f64::from(length.max(1));
    let height = f64::from(height.max(0));
    let step = config
        .elevation_step
        .unwrap_or(config.tile_height / 2.0);

    let artwork_width = (length + 1.0) * config.tile_width / 2.0;
    let artwork_height = (length + 1.0) * config.tile_height / 2.0 + height * step;
    let size = artwork_width.max(artwork_height);

    // The footprint grows away from the anchor cell, towards +x or +y, and both of those run
    // up and to one side on screen, so the artwork's centre sits half a footprint from the
    // anchor's.
    let sideways = (length - 1.0) * config.tile_width / 4.0;
    let centre_x = match axis {
        EntityLengthAxis::X => ground.x + sideways,
        EntityLengthAxis::Y => ground.x - sideways,
    };
    // The bottom of the artwork is the south corner of the ground diamond, half a tile below
    // its centre; everything else rises from there.
    let centre_y = ground.y + config.tile_height / 2.0 - artwork_height / 2.0;

    SpriteLayout {
        x: centre_x - size / 2.0,
        y: centre_y - size / 2.0,
        size,
    }
}

#[cfg(test)]
#[path = "layout.test.rs"]
mod tests;
