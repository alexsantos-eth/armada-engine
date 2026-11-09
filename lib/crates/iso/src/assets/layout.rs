//! Where one atlas sprite goes on screen, and how big it is drawn.

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
pub fn ink_layout(ground: ScreenPoint, ink: InkBox, tile_width: f64) -> SpriteLayout {
    SpriteLayout {
        x: ground.x + ink.x * tile_width,
        y: ground.y + ink.y * tile_width,
        width: ink.width * tile_width,
        height: ink.height * tile_width,
    }
}

/// One band of a sprite's artwork: the part of it that stands on a single cell.
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
pub fn footprint_band(
    layout: SpriteLayout,
    centre: ScreenPoint,
    step: (f64, f64),
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
    if cells <= 1 || step.0 == 0.0 {
        return Some(band);
    }
    let sign = step.0.signum();
    let along = move |p: (f64, f64)| (p.0 - centre.x) * sign;
    let cell = step.0.abs();
    if index < cells - 1 {
        band = clip(band, |p| f64::from(index + 1) * cell + bleed - along(p))?;
    }
    if index > 0 {
        band = clip(band, |p| along(p) - f64::from(index) * cell + bleed)?;
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
