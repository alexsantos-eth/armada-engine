//! What the water shows of the things standing around it.
//!
//! A reflection is the same artwork a second time, upside down and hanging from the waterline:
//! nothing is re-rendered, nothing is lit again, and the sprite the water shows is the sprite the
//! scene already drew. Everything here is that geometry — where the mirrored drawing lands on
//! screen, which cells of water it falls on, and what each of those cells reads of the artwork —
//! so it can be tested without a window. The client owns the atlas, the colour and the draw
//! order ([`crate`] has no graphics anywhere).
//!
//! **The mirror is a flip about the waterline, and that is the whole of it.** The TypeScript
//! client gets there by a longer road: it mirrors each sprite into the plane of the water
//! (`getReflectionMatrix`) and lays the resulting map back on every water top with its screen `y`
//! negated (`getWaterTopMatrix`), because it needs a render texture per chunk to clip the
//! reflections to the water with no masks. Composing those two matrices leaves exactly one thing
//! standing: a point drawn `h` pixels above the waterline shows `h` pixels below it, at the same
//! screen `x`. The lift the first matrix applies — `(elevation − level) · boxHeight / tileHeight`
//! columns towards the camera, for something standing above the water — is what puts the
//! waterline below the foot of a thing standing on a bank rather than at it
//! ([`waterline`]).
//!
//! So this client needs no render texture: it mirrors the rectangle a sprite was drawn into and
//! **cuts the result to the water cells it covers** ([`reflection_piece`]), one convex piece per
//! cell. Each piece can then be sorted by its own cell, so the land drawn in front of the water
//! covers the reflection on it and no mask is needed either.
//!
//! What is left out, and what the TypeScript client has: the camera-facing sides of the terrain
//! blocks behind the water are not mirrored (there, a mesh per material built with the chunk),
//! the open water does not carry the faint wash of the sky, and nothing ripples — the waves this
//! client does not have yet are what sways a reflection there.

use crate::assets::SpriteLayout;
use crate::projection::{GridPoint, ProjectionConfig, project_block};

/// How many cells from the first a reflection is followed, along either axis.
///
/// The cells a reflection falls on are worked out from the drawing itself
/// ([`reflection_cells`]), so this is not the reach — it is a bound on the work one sprite can
/// ask for. A tower mirrored at a shallow zoom covers a dozen cells; nothing covers forty, and a
/// sprite with a broken measurement should not cost a frame.
pub const MAX_REFLECTION_CELLS: i32 = 24;

/// Screen area, in pixels, below which a piece is dropped rather than drawn.
///
/// A mirrored sprite that merely grazes a cell's corner clips to a sliver that draws nothing and
/// costs a mesh.
const MIN_PIECE_AREA: f64 = 0.01;

/// Screen `y` of the water's surface under something standing on `feet_y`, in pixels.
///
/// `elevation` is the level the thing stands on and `level` the level the water's top is drawn
/// at, both in blocks; `box_height` is what one block rises on screen. The two are not the same
/// number whenever something stands on a bank: its reflection hangs from the water, not from its
/// own feet, so the flip is about the water's plane *under its own cell* — which is its feet
/// lowered by the blocks between it and the water. That is the `lift` of the TypeScript client's
/// `getReflectionMatrix`, and `waterlineOf` in its view is this same sum.
pub fn waterline(feet_y: f64, elevation: f64, level: f64, box_height: f64) -> f64 {
    feet_y + (elevation - level) * box_height
}

/// Where a sprite's reflection is drawn, and how it reads its artwork there.
///
/// The drawing maps linearly onto `rect`, so a corner at `(x, y)` reads the artwork at
/// `((x − rect.x) / rect.width, (y − rect.y) / rect.height)` — with either coordinate turned
/// round where the flags say so. [`reflection_piece`] is what applies that.
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
/// `waterline`, as wide as it is and straight below it.
///
/// `turn_at` turns it left to right as well, about that screen `x`, which together with the flip
/// is a **half turn** rather than a mirror. Only a sprite whose footprint runs over several cells
/// needs it: a flip alone reverses the diagonal its row runs along, so a long building's
/// reflection would lean the wrong way across the water. The TypeScript client turns the same
/// sprites about the same point (`turnAt` in `water-reflections.ts`), which is the anchor's
/// screen `x` plus half the footprint's own run.
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
///
/// Some assets carry their own reflection, drawn by their generator rather than mirrored by the
/// client: a pier's posts hang under themselves and its deck lies below them, which no flip of
/// the artwork would produce. Such a drawing is placed exactly as the sprite it belongs to — the
/// generator put it there — so there is nothing to mirror, and all that is left is the cut to the
/// water. This is the TypeScript client's `reflectionSource` path (`getWaterPlaneMatrix`), whose
/// two sign flips cancel for the same reason.
pub fn lay_on_water(layout: SpriteLayout) -> ReflectedSprite {
    ReflectedSprite {
        rect: layout,
        flip_u: false,
        flip_v: false,
    }
}

/// The four corners of a cell's top face on screen, from the corner towards the camera.
///
/// `level` is the level the top is drawn at, in blocks, which is not always the cell's elevation:
/// a material drawn with a sunken top would have its below its own plane. Every terrain block
/// fills its cell now, so the two agree — but the parameter stays, because a reflection mirrors
/// in the drawn plane, not in the elevation.
pub fn cell_top(cell: (i32, i32), level: f64, projection: ProjectionConfig) -> [(f64, f64); 4] {
    // The cell towards the camera is the one with the smallest `x + y`, so its own corner comes
    // first and the rest follow round the diamond.
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
/// max_y))`, or `None` when it falls nowhere a cell could be.
///
/// The client has to offer the surfaces, so it needs the range before the pieces. The reflection
/// lies in
/// the water's own plane, so its rectangle's four corners unproject onto that plane exactly, and
/// the box around them covers every cell any part of it touches. The range is clamped to
/// [`MAX_REFLECTION_CELLS`] from the first cell along either axis.
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
        // The projection read backwards: `x − y` comes from the screen `x` and `x + y` from the
        // screen `y` once the level's own rise is taken off it.
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
    Some((
        (min_x, min_y),
        (high(max_x, min_x)?, high(max_y, min_y)?),
    ))
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
///
/// `cell` is a convex quadrilateral on screen ([`cell_top`]) and the reflection is a rectangle,
/// so the overlap is convex and the cut is one pass of Sutherland and Hodgman's clip per side.
/// The artwork's coordinates are not carried through the clip but worked out from each surviving
/// corner afterwards: the drawing maps linearly onto the rectangle, so position is enough, and
/// interpolating the pair through the cut would only be a second way to say the same thing.
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
    // Which side of an edge the diamond's inside is on depends on how it is wound, and a
    // projection can be wound either way; its own signed area says which.
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

/// Cuts `polygon` down to the inner side of the edge from `from` to `to`, in place.
///
/// `turn` is `1` when the surface is wound so that its inside is to the left of each edge and
/// `−1` when it is wound the other way.
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
