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

/// One band of a sprite's artwork: the part of it that stands on a single cell.
///
/// A convex polygon in screen pixels, with at most eight corners. Its corners carry no texture
/// coordinates because they are implied: the artwork maps linearly onto the sprite's rectangle,
/// so a corner at `(x, y)` samples `((x - layout.x) / width, (y - layout.y) / height)`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpriteBand {
    corners: [(f64, f64); 8],
    len: usize,
}

impl SpriteBand {
    pub fn corners(&self) -> &[(f64, f64)] {
        &self.corners[..self.len]
    }
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
/// **The cut follows the cells' shared edge, not a vertical line.** What one cell can hide is
/// everything in the column of space above its own diamond, and on screen two neighbouring
/// columns overlap by half a tile: the artwork in that overlap belongs to the nearer cell, which
/// is in front. Cutting straight down instead handed the near cell's own corner to the band
/// behind it, and the ground in front of that corner — a whole row nearer — then painted over
/// it, taking a bite out of the base of every long building, one per cell.
///
/// So the boundary is the line through the midpoint of the two cells' centres, parallel to the
/// footprint's other axis, which is exactly the diamond edge the two cells share, continued up
/// the screen. `step` is the screen offset from one footprint cell to the next and `other` the
/// offset along the axis the footprint does not run along; `centre` is the anchor cell's
/// projected ground centre. The two end bands are cut on their inner side only, so the artwork
/// that overhangs the footprint stays with the cell it overhangs from.
///
/// `bleed` widens every band by that many screen pixels on each cut, so that neighbouring bands
/// overlap instead of meeting exactly: two polygons sharing an edge leave a hairline of whatever
/// is behind them showing through, and half a pixel of overlap costs nothing, since the band
/// drawn second is the one nearer the camera.
///
/// Returns `None` when no part of the drawing falls in that band.
pub fn footprint_band(
    layout: SpriteLayout,
    centre: ScreenPoint,
    step: (f64, f64),
    other: (f64, f64),
    index: i32,
    cells: i32,
    bleed: f64,
) -> Option<SpriteBand> {
    let mut band = SpriteBand {
        corners: [
            (layout.x, layout.y),
            (layout.x + layout.width, layout.y),
            (layout.x + layout.width, layout.y + layout.height),
            (layout.x, layout.y + layout.height),
            (0.0, 0.0),
            (0.0, 0.0),
            (0.0, 0.0),
            (0.0, 0.0),
        ],
        len: 4,
    };
    if cells <= 1 {
        return Some(band);
    }
    // How far the next cell lies from this one, measured across the shared edge. Positive on the
    // far side, so the band keeps what is within half a cell of its own centre.
    let span = other.0 * step.1 - other.1 * step.0;
    if span == 0.0 {
        return Some(band);
    }
    let at = (
        centre.x + f64::from(index) * step.0,
        centre.y + f64::from(index) * step.1,
    );
    // Distance across the footprint, as a positive measure growing towards the far side. The
    // cross product grows by the length of `other` for each pixel away from the cut, which is
    // what turns the bleed from pixels into the same measure.
    let sign = span.signum();
    let across =
        move |p: (f64, f64)| (other.0 * (p.1 - at.1) - other.1 * (p.0 - at.0)) * sign;
    let limit = (span / 2.0).abs() + bleed * other.0.hypot(other.1);
    // Towards the far side: drop everything past the edge this cell shares with the next one.
    if index < cells - 1 {
        band = clip(band, |p| limit - across(p))?;
    }
    // And towards the camera, the edge it shares with the cell in front.
    if index > 0 {
        band = clip(band, |p| across(p) + limit)?;
    }
    Some(band)
}

/// Sutherland–Hodgman: the part of a convex polygon where `inside` is not negative.
fn clip(band: SpriteBand, inside: impl Fn((f64, f64)) -> f64) -> Option<SpriteBand> {
    let mut out = SpriteBand { corners: [(0.0, 0.0); 8], len: 0 };
    let corners = band.corners();
    for (i, &to) in corners.iter().enumerate() {
        let from = corners[(i + corners.len() - 1) % corners.len()];
        let (d_from, d_to) = (inside(from), inside(to));
        if (d_from < 0.0) != (d_to < 0.0) {
            // The edge crosses the cut: keep the crossing point.
            let t = d_from / (d_from - d_to);
            out.push((
                from.0 + (to.0 - from.0) * t,
                from.1 + (to.1 - from.1) * t,
            ));
        }
        if d_to >= 0.0 {
            out.push(to);
        }
    }
    (out.len >= 3).then_some(out)
}

impl SpriteBand {
    fn push(&mut self, corner: (f64, f64)) {
        // A corner sitting exactly on the cut is found twice, once as a crossing and once as
        // itself; keeping it twice would leave a triangle with no area in the mesh.
        let same = |a: (f64, f64)| (a.0 - corner.0).abs() < 1e-9 && (a.1 - corner.1).abs() < 1e-9;
        if self.len > 0 && (same(self.corners[self.len - 1]) || same(self.corners[0])) {
            return;
        }
        if self.len < self.corners.len() {
            self.corners[self.len] = corner;
            self.len += 1;
        }
    }
}

#[cfg(test)]
#[path = "layout.test.rs"]
mod tests;
