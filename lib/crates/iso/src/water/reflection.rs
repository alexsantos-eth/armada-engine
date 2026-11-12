//! What the water shows of the things standing around it.

use crate::assets::SpriteLayout;
use crate::projection::{GridPoint, ProjectionConfig, project_block};

/// How many cells from the first a reflection is followed, along either axis.
pub const MAX_REFLECTION_CELLS: i32 = 24;

/// Screen area, in pixels, below which a piece is dropped rather than drawn.
const MIN_PIECE_AREA: f64 = 0.01;

/// How many copies of a reflection the water's broken surface may smear it into.
pub const BLUR_TAPS: usize = 5;

/// How far the water smears what it mirrors right at its surface, in pixels.
const BLUR_AT_SURFACE: f64 = 2.5;

/// How much wider the smear grows for every pixel a reflection hangs below the surface.
const BLUR_PER_PIXEL: f64 = 0.11;

/// How wide the smear ever grows, in pixels.
const MAX_BLUR: f64 = 22.0;

/// How far apart the copies of a smear are drawn, in pixels: a narrow smear takes fewer of them.
const BLUR_SPACING: f64 = 4.0;

/// Screen `y` of the water's surface under something standing on `feet_y`, in pixels.
pub fn waterline(feet_y: f64, elevation: f64, level: f64, box_height: f64) -> f64 {
    feet_y + (elevation - level) * box_height
}

/// Where a sprite's reflection is drawn, and how it reads its artwork there.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ReflectedSprite {
    /// The rectangle the artwork is drawn into, in screen pixels.
    pub rect: SpriteLayout,
    /// Whether the artwork is read right to left: a half turn, not a flip.
    pub flip_u: bool,
    /// Whether it is read bottom to top, which is what a mirror in the water does.
    pub flip_v: bool,
}

/// The reflection of the sprite drawn into `layout`: the same drawing upside down about
pub fn mirror_sprite(
    layout: SpriteLayout,
    waterline: f64,
    turn_at: Option<f64>,
) -> ReflectedSprite {
    let mut rect = SpriteLayout {
        y: 2.0 * waterline - (layout.y + layout.height),
        ..layout
    };
    if let Some(turn) = turn_at {
        rect.x = 2.0 * turn - (layout.x + layout.width);
    }
    ReflectedSprite {
        rect,
        flip_u: turn_at.is_some(),
        flip_v: true,
    }
}

/// A sprite that is already drawn as the water shows it: laid where it was placed, unflipped.
pub fn lay_on_water(layout: SpriteLayout) -> ReflectedSprite {
    ReflectedSprite {
        rect: layout,
        flip_u: false,
        flip_v: false,
    }
}

/// The four corners of a cell's top face on screen, from the corner towards the camera.
pub fn cell_top(cell: (i32, i32), level: f64, projection: ProjectionConfig) -> [(f64, f64); 4] {
    [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)].map(|(dx, dy)| {
        let at = project_block(
            GridPoint {
                x: f64::from(cell.0) + dx,
                y: f64::from(cell.1) + dy,
            },
            level,
            projection,
        );
        (at.screen_x, at.screen_y)
    })
}

/// The cells whose tops a reflection could fall on, as inclusive `((min_x, min_y), (max_x,
pub fn reflection_cells(
    sprite: &ReflectedSprite,
    level: f64,
    projection: ProjectionConfig,
) -> Option<((i32, i32), (i32, i32))> {
    let rect = sprite.rect;
    if !(rect.width > 0.0 && rect.height > 0.0)
        || projection.tile_width <= 0.0
        || projection.tile_height <= 0.0
    {
        return None;
    }
    let step = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    let (mut min_x, mut min_y) = (f64::INFINITY, f64::INFINITY);
    let (mut max_x, mut max_y) = (f64::NEG_INFINITY, f64::NEG_INFINITY);
    for (x, y) in [
        (rect.x, rect.y),
        (rect.x + rect.width, rect.y),
        (rect.x + rect.width, rect.y + rect.height),
        (rect.x, rect.y + rect.height),
    ] {
        let across = 2.0 * (x - projection.origin_x) / projection.tile_width;
        let away = 2.0 * (projection.origin_y - level * step - y) / projection.tile_height;
        let (cell_x, cell_y) = ((away + across) / 2.0, (away - across) / 2.0);
        min_x = min_x.min(cell_x);
        min_y = min_y.min(cell_y);
        max_x = max_x.max(cell_x);
        max_y = max_y.max(cell_y);
    }
    let low = |value: f64| i32::try_from(value.floor() as i64).ok();
    let (min_x, min_y) = (low(min_x)?, low(min_y)?);
    let high = |value: f64, from: i32| {
        i32::try_from(value.floor() as i64)
            .ok()
            .map(|to| to.min(from.saturating_add(MAX_REFLECTION_CELLS)))
    };
    Some(((min_x, min_y), (high(max_x, min_x)?, high(max_y, min_y)?)))
}

/// One cell's share of a reflection: where it is on screen and what it reads of the artwork.
#[derive(Clone, Debug, PartialEq)]
pub struct ReflectionPiece {
    /// The piece on screen, convex, in the order the rectangle's corners survived the cut.
    pub points: Vec<(f64, f64)>,
    /// Where each of those corners reads the artwork, in `[0, 1]`, corner for corner.
    pub uv: Vec<(f64, f64)>,
}

/// The part of `sprite` that falls on the cell top `cell`, or `None` when none of it does.
pub fn reflection_piece(
    sprite: &ReflectedSprite,
    cell: &[(f64, f64); 4],
) -> Option<ReflectionPiece> {
    let rect = sprite.rect;
    if !(rect.width > 0.0 && rect.height > 0.0) {
        return None;
    }
    let mut points = vec![
        (rect.x, rect.y),
        (rect.x + rect.width, rect.y),
        (rect.x + rect.width, rect.y + rect.height),
        (rect.x, rect.y + rect.height),
    ];
    let turn = if area(cell) >= 0.0 { 1.0 } else { -1.0 };
    for index in 0..cell.len() {
        let from = cell[index];
        let to = cell[(index + 1) % cell.len()];
        clip(&mut points, from, to, turn);
        if points.len() < 3 {
            return None;
        }
    }
    if area(&points).abs() < MIN_PIECE_AREA {
        return None;
    }
    let uv = points
        .iter()
        .map(|&(x, y)| {
            let u = ((x - rect.x) / rect.width).clamp(0.0, 1.0);
            let v = ((y - rect.y) / rect.height).clamp(0.0, 1.0);
            (
                if sprite.flip_u { 1.0 - u } else { u },
                if sprite.flip_v { 1.0 - v } else { v },
            )
        })
        .collect();
    Some(ReflectionPiece { points, uv })
}

/// How wide the water smears a reflection hanging `depth` pixels below its surface, in pixels.
pub fn blur_radius(depth: f64) -> f64 {
    (BLUR_AT_SURFACE + BLUR_PER_PIXEL * depth.max(0.0)).min(MAX_BLUR)
}

/// One of the copies a reflection is smeared into: how far below the reflection it is drawn, and
/// how opaque it is drawn over the copies before it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BlurTap {
    /// Pixels deeper into the water than the reflection itself.
    pub offset: f64,
    /// Opacity over everything already drawn; `0.0` for a copy this smear does not need.
    pub alpha: f64,
}

/// The copies a smear `radius` pixels wide is drawn as, from the reflection itself downwards.
pub fn blur_taps(radius: f64) -> [BlurTap; BLUR_TAPS] {
    let mut taps = [BlurTap {
        offset: 0.0,
        alpha: 0.0,
    }; BLUR_TAPS];
    let span = radius.max(0.0);
    let copies = ((span / BLUR_SPACING).ceil() as usize + 1).clamp(1, BLUR_TAPS);
    if copies < 2 {
        taps[0].alpha = 1.0;
        return taps;
    }
    let sigma = span / 2.0;
    let steps = (copies - 1) as f64;
    let mut total = 0.0;
    for (index, tap) in taps.iter_mut().take(copies).enumerate() {
        let offset = span * index as f64 / steps;
        let weight = (-0.5 * (offset / sigma).powi(2)).exp();
        total += weight;
        *tap = BlurTap {
            offset,
            alpha: weight / total,
        };
    }
    taps
}

/// The same reflection drawn `by` pixels deeper in the water.
pub fn smear_sprite(sprite: &ReflectedSprite, by: f64) -> ReflectedSprite {
    ReflectedSprite {
        rect: SpriteLayout {
            y: sprite.rect.y + by,
            ..sprite.rect
        },
        ..*sprite
    }
}

/// How far below `surface` a piece of a reflection hangs, in pixels, taken at its middle.
pub fn piece_depth(piece: &ReflectionPiece, surface: f64) -> f64 {
    if piece.points.is_empty() {
        return 0.0;
    }
    let middle = piece.points.iter().map(|&(_, y)| y).sum::<f64>() / piece.points.len() as f64;
    (middle - surface).max(0.0)
}

/// Cuts `polygon` down to the inner side of the edge from `from` to `to`, in place.
fn clip(polygon: &mut Vec<(f64, f64)>, from: (f64, f64), to: (f64, f64), turn: f64) {
    let side = |point: (f64, f64)| {
        turn * ((to.0 - from.0) * (point.1 - from.1) - (to.1 - from.1) * (point.0 - from.0))
    };
    let mut kept: Vec<(f64, f64)> = Vec::with_capacity(polygon.len() + 1);
    for index in 0..polygon.len() {
        let current = polygon[index];
        let next = polygon[(index + 1) % polygon.len()];
        let (here, there) = (side(current), side(next));
        if here >= 0.0 {
            kept.push(current);
        }
        if (here >= 0.0) != (there >= 0.0) {
            let span = here - there;
            if span != 0.0 {
                let along = here / span;
                kept.push((
                    current.0 + (next.0 - current.0) * along,
                    current.1 + (next.1 - current.1) * along,
                ));
            }
        }
    }
    *polygon = kept;
}

/// The signed area of a polygon, positive when it is wound one way and negative the other.
fn area(polygon: &[(f64, f64)]) -> f64 {
    let mut sum = 0.0;
    for index in 0..polygon.len() {
        let (a, b) = (polygon[index], polygon[(index + 1) % polygon.len()]);
        sum += a.0 * b.1 - b.0 * a.1;
    }
    sum / 2.0
}

#[cfg(test)]
#[path = "reflection.test.rs"]
mod tests;
