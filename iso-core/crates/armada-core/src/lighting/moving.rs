//! The shadow of something that moves, laid on the surfaces it reaches.
//!
//! Everything else in [`super`] is baked: the sun holds still, so a chunk's shadows are computed
//! once and read back frame after frame ([`super::bake`]). The player cannot be: it walks, and a
//! caster that moves makes the map it was baked into wrong. The TypeScript client answers that by
//! invalidating the maps a moving caster touches and gathering them again
//! (`core/engine/shadows/moving-shadow.ts`), which it can afford because its shadows are a render
//! texture on the GPU; a rebake here is tens of milliseconds, so the same answer would stutter at
//! every step.
//!
//! So a moving caster's shadow is not baked at all: it is laid straight onto the ground as
//! geometry, from the same [`silhouette_matrix`] the bake uses, and cut into the pieces the world
//! actually shows — one per cell top and per exposed vertical face it lands on
//! ([`ShadowSurface`]). Each piece can then be drawn on its own surface and sorted with it.
//! Without the cut the shadow would be a single quad on the caster's own cell, which the terrain
//! drawn in front of it covers: the shadow of a figure two tiles long came out as a stub under
//! its feet.
//!
//! **A ray lands once.** The silhouette is a bundle of sun rays, and a ray stops at the first
//! surface it meets. Laying the whole silhouette on every level it passes over draws the figure
//! again at each step of a beach, which is what the first version did and what it looked like.
//! So every surface takes only the rays that nothing nearer the sun already caught: a cell's top
//! blocks whatever is further down the light and lower than it ([`blocked_by`]). What is left is
//! one shadow that steps down the terrain — over a top, down the wall under it, on along the next
//! top — instead of one copy per level.
//!
//! **Walls.** The TypeScript client bends its shadow onto the vertical sides of the ground, and
//! so does this: a wall is just another surface with its own two parameters, and because the map
//! from them to the artwork is affine ([`SurfaceReading`]) a wall costs exactly what a cell top
//! costs. Only the two sides the camera sees are ever asked about ([`super::faces`]).
//!
//! What is left out is what a bake has and a frame cannot afford: the shadow does not climb the
//! trees and entities it runs into, and the ground's own horizon is not consulted, so a ridge
//! between the caster and a lower surface does not stop it. Both are the bake's work
//! ([`super::terrain`]), and a single figure is not worth them per frame.

use super::bake::SpriteExtent;
use super::faces::TerrainFace;
use super::shadow::{Affine2D, ShadowProjection, lift_reach, silhouette_matrix};

/// How far below a moving caster's own ground its shadow is still laid, in blocks.
///
/// A lift carries the shadow [`lift_reach`] further along its direction — at dawn about one and
/// three quarter tiles a block — so what is past this is both far from the figure and, after
/// [`blocked_by`], only the little the nearer ground did not already catch. It also bounds the
/// square of cells a frame looks at. There is no cap the other way: ground that rises towards the
/// caster takes whatever part of it still stands above that plane, which runs out on its own.
pub const MAX_SHADOW_LIFT: f64 = 2.0;

/// Area, in a surface's own parameters, below which a piece is dropped rather than drawn.
///
/// A piece that merely touches a cell's edge clips to a sliver of a few millionths of it; it
/// draws nothing and costs a mesh.
const MIN_PIECE_AREA: f64 = 1e-6;

/// How many pieces one surface may be cut into before the rest are dropped.
///
/// Each blocker can cut a piece into four, so the count is bounded by the blockers in the worst
/// case only. Terrain does not do that — a surface has one or two blockers over it — and this is
/// here so that a strange one cannot cost a frame.
const MAX_PIECES_PER_SURFACE: usize = 24;

/// A surface a shadow can land on: the top of a cell, or one exposed vertical face of the ground.
///
/// Both are read with two parameters in `[0, 1]`, `across` and `down`, so one piece of geometry
/// covers either.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ShadowSurface {
    /// A cell's top face, at the level that top is drawn at.
    Ground { cell: (i32, i32), level: f64 },
    /// One exposed vertical side of a column, as [`super::faces`] finds it.
    Face(TerrainFace),
}

impl ShadowSurface {
    /// The world point `across` the surface and `down` it, with its height in blocks.
    ///
    /// On a cell top, `across` runs with the world's `x` and `down` with its `y`, both over the
    /// cell's own square; on a face they are the face's own two directions
    /// ([`TerrainFace::point`]).
    pub fn point(&self, across: f64, down: f64) -> (f64, f64, f64) {
        match self {
            Self::Ground { cell, level } => (
                f64::from(cell.0) + across,
                f64::from(cell.1) + down,
                *level,
            ),
            Self::Face(face) => face.point(across, down),
        }
    }

    /// The cell it belongs to, which is what the scene sorts it by.
    pub fn cell(&self) -> (i32, i32) {
        match self {
            Self::Ground { cell, .. } => *cell,
            Self::Face(face) => (face.x, face.y),
        }
    }

    /// The highest point of it, in blocks.
    pub fn top(&self) -> f64 {
        match self {
            Self::Ground { level, .. } => *level,
            Self::Face(face) => face.top,
        }
    }

    /// The lowest point of it, in blocks.
    pub fn bottom(&self) -> f64 {
        match self {
            Self::Ground { level, .. } => *level,
            Self::Face(face) => face.bottom,
        }
    }
}

/// One surface's share of a moving caster's shadow.
///
/// The polygon is in the surface's own `(across, down)` parameters, so the client has only to ask
/// the surface where each corner is and project it; `uv` runs with it, corner for corner, as a
/// fraction across (`0` left) and down (`0` top) the caster's artwork, which is what reads the
/// silhouette out of its sprite.
#[derive(Clone, Debug, PartialEq)]
pub struct ShadowPiece {
    pub surface: ShadowSurface,
    /// The piece in the surface's own parameters, anticlockwise.
    pub points: Vec<(f64, f64)>,
    /// Where each of those corners reads the artwork, in `[0, 1]`.
    pub uv: Vec<(f64, f64)>,
}

/// A half-plane over a surface's parameters: the side where `a·across + b·down + c` is positive.
#[derive(Clone, Copy, Debug)]
struct Plane {
    a: f64,
    b: f64,
    c: f64,
}

impl Plane {
    fn at(&self, point: (f64, f64)) -> f64 {
        self.a * point.0 + self.b * point.1 + self.c
    }

    /// The other side of the same line.
    fn flipped(&self) -> Self {
        Self {
            a: -self.a,
            b: -self.b,
            c: -self.c,
        }
    }
}

/// How a surface reads the caster's artwork: the affine map from its two parameters to the
/// silhouette's own screen pixels.
///
/// It is affine because every step of the way is. A surface's world point is affine in its
/// parameters; the ray through a point at height `h` left the caster's plane
/// [`lift_reach`] further back, which is linear in `h`; and the silhouette's map onto the ground
/// is affine and so is its inverse. That one fact is what lets a wall cost what a cell top costs:
/// four corners and straight lines between them, with no sampling anywhere.
#[derive(Clone, Copy, Debug)]
struct SurfaceReading {
    /// Where `(0, 0)` reads the artwork, in screen pixels from the caster's feet.
    origin: (f64, f64),
    /// What one unit of `across` adds to it.
    across: (f64, f64),
    /// What one unit of `down` adds to it.
    down: (f64, f64),
    /// The surface in the world, in tiles, as `(origin, across, down)`.
    world: ((f64, f64), (f64, f64), (f64, f64)),
    /// The surface's height in blocks, as `(origin, across, down)`.
    height: (f64, f64, f64),
}

impl SurfaceReading {
    fn sprite_x(&self) -> Plane {
        Plane {
            a: self.across.0,
            b: self.down.0,
            c: self.origin.0,
        }
    }

    fn sprite_y(&self) -> Plane {
        Plane {
            a: self.across.1,
            b: self.down.1,
            c: self.origin.1,
        }
    }

    fn at(&self, point: (f64, f64)) -> (f64, f64) {
        (self.sprite_x().at(point), self.sprite_y().at(point))
    }
}

/// The square of cells a moving caster's shadow could reach, as `((min_x, min_y), (max_x,
/// max_y))`, or `None` when it throws none at all.
///
/// The client asks for this before the pieces, because the surfaces it has to offer — the cell
/// tops and the exposed faces of the ground — are its own to gather. It depends on the caster
/// and not on the terrain: the reach is counted in lifts away from the caster's own plane, from
/// the head's own height above it down to [`MAX_SHADOW_LIFT`] below.
pub fn moving_shadow_area(
    light: &ShadowProjection,
    extent: SpriteExtent,
    foot: (f64, f64),
    tile_width: f64,
    box_height: f64,
) -> Option<((i32, i32), (i32, i32))> {
    let above_foot = (-extent.top).clamp(0.0, extent.height);
    if above_foot <= 0.0 || extent.width <= 0.0 || extent.height <= 0.0 || light.stretch <= 0.0 {
        return None;
    }
    let matrix = silhouette_matrix(light, foot, 0.0, tile_width, box_height);
    let corners = [
        (extent.left, extent.top),
        (extent.left + extent.width, extent.top),
        (extent.left + extent.width, 0.0),
        (extent.left, 0.0),
    ];
    // The highest ground that still takes anything is the one the figure's own head reaches.
    let highest = -above_foot / box_height;
    let (mut min_x, mut min_y) = (f64::INFINITY, f64::INFINITY);
    let (mut max_x, mut max_y) = (f64::NEG_INFINITY, f64::NEG_INFINITY);
    for lift in [highest, 0.0, MAX_SHADOW_LIFT] {
        let shift = lift_reach(light, lift, tile_width, box_height);
        for corner in corners {
            let (x, y) = matrix.apply(corner);
            let (x, y) = (x + shift * light.dir_x, y + shift * light.dir_y);
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }
    let cell = |value: f64| i32::try_from(value.floor() as i64).ok();
    Some((
        (cell(min_x)?, cell(min_y)?),
        (cell(max_x)?, cell(max_y)?),
    ))
}

/// Lays `extent`'s silhouette on `surfaces` as the shadow of something standing on `foot`, and
/// appends the pieces to `out`.
///
/// * `extent` — where the artwork is drawn around the ground point it stands on, in screen pixels
///   (`crate::lighting::ShadowReceiver::extent`'s convention). Only the part above that point
///   casts: rows drawn below the feet are inside the ground.
/// * `foot` — world tiles of that ground point.
/// * `level` — the level it is drawn standing on, in blocks, a jump included.
/// * `surfaces` — every cell top and face the shadow may land on, which is what
///   [`moving_shadow_area`] bounds.
/// * `blockers` — the cells whose tops catch rays, as `(cell, level)`: the same cell tops, and
///   nothing else, because a wall catches only what its own top already let past.
#[allow(clippy::too_many_arguments)]
pub fn moving_shadow_pieces(
    light: &ShadowProjection,
    extent: SpriteExtent,
    foot: (f64, f64),
    level: f64,
    tile_width: f64,
    box_height: f64,
    surfaces: &[ShadowSurface],
    blockers: &[((i32, i32), f64)],
    out: &mut Vec<ShadowPiece>,
) {
    let above_foot = (-extent.top).clamp(0.0, extent.height);
    if above_foot <= 0.0 || extent.width <= 0.0 || extent.height <= 0.0 || light.stretch <= 0.0 {
        return;
    }
    let matrix = silhouette_matrix(light, foot, 0.0, tile_width, box_height);
    let Some(inverse) = matrix.inverse() else {
        return;
    };
    let per_block = lift_reach(light, 1.0, tile_width, box_height);
    let mut pieces: Vec<Vec<(f64, f64)>> = Vec::new();
    for surface in surfaces {
        let reading = read_surface(surface, &inverse, light, level, per_block);
        pieces.clear();
        pieces.push(vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]);
        // Inside the artwork, above the caster's own feet, and above the receiving point: a ray
        // runs downhill, so what lands on a point left the figure higher than that point is.
        let sprite_x = reading.sprite_x();
        let sprite_y = reading.sprite_y();
        let keep = [
            offset(sprite_x, -extent.left),
            offset(sprite_x, -(extent.left + extent.width)).flipped(),
            offset(sprite_y, -extent.top),
            sprite_y.flipped(),
            Plane {
                a: -reading.height.1 * box_height - sprite_y.a,
                b: -reading.height.2 * box_height - sprite_y.b,
                c: (level - reading.height.0) * box_height - sprite_y.c,
            },
        ];
        for plane in keep {
            for piece in &mut pieces {
                clip(piece, plane);
            }
            pieces.retain(|piece| piece.len() >= 3);
            if pieces.is_empty() {
                break;
            }
        }
        if pieces.is_empty() {
            continue;
        }
        // And nothing nearer the sun caught the ray first.
        for &(cell, blocker) in blockers {
            if blocker <= surface.bottom() + f64::EPSILON {
                continue;
            }
            blocked_by(&mut pieces, &reading, light, per_block, cell, blocker);
            if pieces.is_empty() {
                break;
            }
        }
        for piece in pieces.drain(..) {
            if piece.len() < 3 || area(&piece).abs() < MIN_PIECE_AREA {
                continue;
            }
            let piece = anticlockwise(piece);
            let uv = piece
                .iter()
                .map(|&point| {
                    let (x, y) = reading.at(point);
                    (
                        ((x - extent.left) / extent.width).clamp(0.0, 1.0),
                        ((y - extent.top) / extent.height).clamp(0.0, 1.0),
                    )
                })
                .collect();
            out.push(ShadowPiece {
                surface: *surface,
                points: piece,
                uv,
            });
        }
    }
}

/// How `surface` reads the artwork of a caster standing at `level`.
fn read_surface(
    surface: &ShadowSurface,
    inverse: &Affine2D,
    light: &ShadowProjection,
    level: f64,
    per_block: f64,
) -> SurfaceReading {
    let corner = surface.point(0.0, 0.0);
    let across = surface.point(1.0, 0.0);
    let down = surface.point(0.0, 1.0);
    // Where the ray through a point left the caster's own plane: back up the light by what the
    // drop between the two is worth.
    let laid = |(x, y, height): (f64, f64, f64)| {
        let shift = per_block * (level - height);
        (x - shift * light.dir_x, y - shift * light.dir_y)
    };
    let origin = inverse.apply(laid(corner));
    let at_across = inverse.apply(laid(across));
    let at_down = inverse.apply(laid(down));
    SurfaceReading {
        origin,
        across: (at_across.0 - origin.0, at_across.1 - origin.1),
        down: (at_down.0 - origin.0, at_down.1 - origin.1),
        world: (
            (corner.0, corner.1),
            (across.0 - corner.0, across.1 - corner.1),
            (down.0 - corner.0, down.1 - corner.1),
        ),
        height: (corner.2, across.2 - corner.2, down.2 - corner.2),
    }
}

/// Cuts out of `pieces` whatever the top of `cell`, at `blocker` blocks, catches first.
///
/// The ray that reaches a point of the surface was, when it was level with the blocker's top,
/// further back up the light by what the drop between the two is worth; if that place is inside
/// the blocker's own cell, the ground there took the ray and this surface never saw it. Every
/// step of that is affine in the surface's parameters, so what it removes is the inside of four
/// straight lines — the cell's four sides — and of a fifth that drops the part of the surface
/// standing above the blocker, which nothing up there can catch.
fn blocked_by(
    pieces: &mut Vec<Vec<(f64, f64)>>,
    reading: &SurfaceReading,
    light: &ShadowProjection,
    per_block: f64,
    cell: (i32, i32),
    blocker: f64,
) {
    let (origin, across, down) = reading.world;
    let (height, height_across, height_down) = reading.height;
    // The ray's place at the blocker's height, as an affine function of the parameters.
    let ray = |axis: usize| {
        let (world, raised, direction) = match axis {
            0 => (
                (origin.0, across.0, down.0),
                (0.0, height_across, height_down),
                light.dir_x,
            ),
            _ => (
                (origin.1, across.1, down.1),
                (0.0, height_across, height_down),
                light.dir_y,
            ),
        };
        let drop = per_block * (blocker - height);
        Plane {
            a: world.1 + per_block * raised.1 * direction,
            b: world.2 + per_block * raised.2 * direction,
            c: world.0 - drop * direction,
        }
    };
    let (at_x, at_y) = (ray(0), ray(1));
    let inside = [
        offset(at_x, -f64::from(cell.0)),
        offset(at_x, -(f64::from(cell.0) + 1.0)).flipped(),
        offset(at_y, -f64::from(cell.1)),
        offset(at_y, -(f64::from(cell.1) + 1.0)).flipped(),
        // Nothing is caught by ground below it.
        Plane {
            a: -height_across,
            b: -height_down,
            c: blocker - height,
        },
    ];
    subtract(pieces, &inside);
}

/// Takes the part of every piece that is inside all of `inside` away, leaving the rest.
///
/// A convex region cut out of a convex piece leaves up to one piece per side of the cut, each
/// convex and none overlapping another: the part outside the first line, then the part inside
/// that one but outside the second, and so on. The piece that is inside all of them is the one
/// that was caught, and it is the one dropped.
fn subtract(pieces: &mut Vec<Vec<(f64, f64)>>, inside: &[Plane]) {
    let mut kept: Vec<Vec<(f64, f64)>> = Vec::with_capacity(pieces.len());
    for piece in pieces.drain(..) {
        // Wholly on the outer side of any one line: the cut takes nothing from it.
        if inside
            .iter()
            .any(|plane| piece.iter().all(|&corner| plane.at(corner) < 0.0))
        {
            kept.push(piece);
            continue;
        }
        let mut left = piece;
        for &plane in inside {
            let mut outside = left.clone();
            clip(&mut outside, plane.flipped());
            if outside.len() >= 3 && area(&outside).abs() >= MIN_PIECE_AREA {
                kept.push(outside);
            }
            clip(&mut left, plane);
            if left.len() < 3 {
                break;
            }
        }
    }
    kept.truncate(MAX_PIECES_PER_SURFACE);
    *pieces = kept;
}

/// Cuts `polygon` down to the side of `plane` where it is positive, in place.
///
/// Sutherland and Hodgman's clip. A surface's square and everything cut out of it are convex, so
/// this leaves one convex piece and never a hole.
fn clip(polygon: &mut Vec<(f64, f64)>, plane: Plane) {
    if polygon.is_empty() {
        return;
    }
    let mut kept: Vec<(f64, f64)> = Vec::with_capacity(polygon.len() + 1);
    for index in 0..polygon.len() {
        let current = polygon[index];
        let next = polygon[(index + 1) % polygon.len()];
        let (here, there) = (plane.at(current), plane.at(next));
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

/// `plane` moved by a constant, which is the same line slid along its own normal.
fn offset(plane: Plane, by: f64) -> Plane {
    Plane {
        c: plane.c + by,
        ..plane
    }
}

/// The same polygon wound anticlockwise.
fn anticlockwise(polygon: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    if area(&polygon) >= 0.0 {
        return polygon;
    }
    polygon.into_iter().rev().collect()
}

/// The signed area of `polygon`: positive when it is wound anticlockwise.
fn area(polygon: &[(f64, f64)]) -> f64 {
    let mut sum = 0.0;
    for index in 0..polygon.len() {
        let (a, b) = (polygon[index], polygon[(index + 1) % polygon.len()]);
        sum += a.0 * b.1 - b.0 * a.1;
    }
    sum / 2.0
}

#[cfg(test)]
#[path = "moving.test.rs"]
mod tests;
