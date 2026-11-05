//! Where the sun lays a shadow, in world tiles.
//!
//! The one piece of geometry every shadow in the client is built from. A sprite is an upright
//! cut-out standing on a ground point, turned to face the sun: objects have volume, so a tree's
//! crown throws its full width whatever the sun's azimuth, where a flat card seen edge-on would
//! throw a line. [`silhouette_matrix`] is that cut-out laid flat on the ground, and
//! [`cast_shadow_offset`] is the same ray carried on to another upright cut-out instead.
//!
//! **Units.** Screen pixels are the artwork's own space: `x` right, `y` down, measured from the
//! ground point the sprite stands on (what [`crate::assets::ink_layout`] places it by). World
//! tiles are the engine's grid, and a *cell centre* is the integer cell plus a half along each
//! axis, which is the point the projection draws a column's top around. A lift is in blocks.
//!
//! Ported from the TypeScript engine's `core/engine/lighting/shadow.ts`; the two agree number
//! for number, which is what lets a scene be compared between the clients.

/// An affine map of the plane, in the same convention the TypeScript client's matrices use:
/// `x' = a·x + c·y + tx`, `y' = b·x + d·y + ty`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Affine2D {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub tx: f64,
    pub ty: f64,
}

impl Affine2D {
    /// Where `point` lands.
    pub fn apply(&self, point: (f64, f64)) -> (f64, f64) {
        (
            self.a * point.0 + self.c * point.1 + self.tx,
            self.b * point.0 + self.d * point.1 + self.ty,
        )
    }

    /// The map back, or `None` when this one collapses the plane onto a line.
    ///
    /// A silhouette's map collapses only when the sun is exactly overhead (`stretch` zero),
    /// which is the one case that has no shadow to invert.
    pub fn inverse(&self) -> Option<Self> {
        let determinant = self.a * self.d - self.b * self.c;
        if determinant == 0.0 || !determinant.is_finite() {
            return None;
        }
        let (a, b, c, d) = (
            self.d / determinant,
            -self.b / determinant,
            -self.c / determinant,
            self.a / determinant,
        );
        Some(Self {
            a,
            b,
            c,
            d,
            tx: -(a * self.tx + c * self.ty),
            ty: -(b * self.tx + d * self.ty),
        })
    }
}

/// How the sun lays shadows on the ground at one moment.
///
/// Authored per lighting phase rather than derived from a clock: this client bakes its shadows
/// once, so there is a single sun. See [`super::phases`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShadowProjection {
    /// Unit direction shadows fall along on the ground, world `x`.
    pub dir_x: f64,
    /// Unit direction shadows fall along on the ground, world `y`.
    pub dir_y: f64,
    /// Ground length (tiles) of the shadow of one tile of height: `1 / tan(altitude)`, capped
    /// at [`MAX_SHADOW_STRETCH`].
    pub stretch: f64,
    /// Shadow opacity in `[0, 1]` before the phase's own strength.
    pub alpha: f64,
}

/// Cap on how far a unit of height reaches when the sun is low (`1 / tan(altitude)`).
pub const MAX_SHADOW_STRETCH: f64 = 4.0;

/// Tiles of world length per screen pixel of height.
///
/// In the 2:1 projection a tile edge spans `tile_width / 2` px across the screen at 45° and a
/// vertical unit is `√(5/2)` times shorter than that per pixel, so one pixel of height is
/// `√(5/2) / tile_width` tiles.
pub fn tiles_per_pixel_of_height(tile_width: f64) -> f64 {
    2.5_f64.sqrt() / tile_width
}

/// Tiles of world length per screen pixel *across* the shadow, where the sprite keeps its own
/// width: a screen pixel spans `√2 / tile_width` tiles.
pub fn tiles_per_pixel_across(tile_width: f64) -> f64 {
    std::f64::consts::SQRT_2 / tile_width
}

/// Height of one block in tiles of world length (about half a tile).
///
/// `box_height` is how tall a block's body is drawn, in screen pixels, and `tile_width` how wide
/// a tile is: the client's own two numbers, so a change of either keeps the shadows on the
/// ground. See [`crate::assets::elevation_step`].
pub fn block_height_in_tiles(box_height: f64, tile_width: f64) -> f64 {
    (box_height / tile_width) * 2.5_f64.sqrt()
}

/// Lays a sprite's silhouette on the ground as its shadow: screen pixels relative to the
/// sprite's ground point to world tiles on a ground plane.
///
/// The sprite is treated as an upright cut-out standing on its foot and turned to face the sun.
/// A pixel across the sprite is laid across the shadow, perpendicular to it, at the sprite's own
/// width; a pixel `h` px above the foot is laid `h` px of height × `stretch` away along the
/// shadow direction. With the sun behind the camera this is the sprite seen as it is drawn.
///
/// * `foot` — world tiles (cell centre) of the point the sprite stands on.
/// * `lift` — blocks between the caster's own ground and the plane the shadow falls on: `0` for
///   its own ground, `2` where the receiving ground lies two blocks lower, so the shadow lands
///   that much further away.
pub fn silhouette_matrix(
    light: &ShadowProjection,
    foot: (f64, f64),
    lift: f64,
    tile_width: f64,
    box_height: f64,
) -> Affine2D {
    let per_pixel = tiles_per_pixel_of_height(tile_width);
    let reach_per_pixel = light.stretch * per_pixel;
    let lift_reach = lift_reach(light, lift, tile_width, box_height);
    let across_per_pixel = tiles_per_pixel_across(tile_width);
    Affine2D {
        // Across the shadow: (dir_y, −dir_x), which is screen right when shadows point straight
        // up the screen.
        a: across_per_pixel * light.dir_y,
        b: -across_per_pixel * light.dir_x,
        c: -reach_per_pixel * light.dir_x,
        d: -reach_per_pixel * light.dir_y,
        tx: foot.0 + lift_reach * light.dir_x,
        ty: foot.1 + lift_reach * light.dir_y,
    }
}

/// How far down the shadow a plane `lift` blocks below the caster's own ground moves it, in
/// tiles. The only part of [`silhouette_matrix`] a lift changes, so a bake that walks several
/// receiving levels under one caster shifts the map instead of rebuilding it.
pub fn lift_reach(
    light: &ShadowProjection,
    lift: f64,
    tile_width: f64,
    box_height: f64,
) -> f64 {
    light.stretch * lift * box_height * tiles_per_pixel_of_height(tile_width)
}

/// Where the sun lays a caster's silhouette on another upright cut-out, in screen pixels.
///
/// A sun ray through the caster reaches the receiver `along` tiles further down the shadow and
/// `along / stretch` tiles of height lower, keeping its offset across the shadow. So every pixel
/// of the caster's silhouette, taken relative to the caster's foot, lands on the receiver at the
/// same point relative to the receiver's foot plus the returned offset (`y` down). Rows the
/// offset moves below the receiver's foot fell on the ground before reaching it.
///
/// `None` when the receiver is not down the shadow from the caster (beside it, or towards the
/// sun), or when the sun is straight overhead.
///
/// * `lift` — blocks the caster stands above the receiver, negative when below.
pub fn cast_shadow_offset(
    light: &ShadowProjection,
    caster_foot: (f64, f64),
    receiver_foot: (f64, f64),
    lift: f64,
    tile_width: f64,
    box_height: f64,
) -> Option<(f64, f64)> {
    let to_x = receiver_foot.0 - caster_foot.0;
    let to_y = receiver_foot.1 - caster_foot.1;
    let along = light.dir_x * to_x + light.dir_y * to_y;
    if along <= 0.0 || light.stretch <= 0.0 {
        return None;
    }
    // Across the shadow: (dir_y, −dir_x), screen right as in `silhouette_matrix`.
    let across = -(light.dir_y * to_x - light.dir_x * to_y);
    Some((
        across / tiles_per_pixel_across(tile_width),
        along / (light.stretch * tiles_per_pixel_of_height(tile_width)) - lift * box_height,
    ))
}

/// Farthest ground distance (tiles) the shadow of something `height` screen pixels tall can
/// reach, `lift` blocks above the ground it falls on, with the sun as low as shadows ever get
/// ([`MAX_SHADOW_STRETCH`]). Whatever stands further away is never shaded by it.
pub fn shadow_reach(height: f64, lift: f64, tile_width: f64, box_height: f64) -> f64 {
    (MAX_SHADOW_STRETCH * tiles_per_pixel_of_height(tile_width) * (height + lift * box_height))
        .max(0.0)
}

#[cfg(test)]
#[path = "shadow.test.rs"]
mod tests;
