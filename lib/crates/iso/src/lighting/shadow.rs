//! Where the sun lays a shadow, in world tiles.

/// An affine map of the plane, in the same convention the TypeScript client's matrices use:
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
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShadowProjection {
    /// Unit direction shadows fall along on the ground, world `x`.
    pub dir_x: f64,
    /// Unit direction shadows fall along on the ground, world `y`.
    pub dir_y: f64,
    /// Ground length (tiles) of the shadow of one tile of height: `1 / tan(altitude)`, capped
    pub stretch: f64,
    /// Shadow opacity in `[0, 1]` before the phase's own strength.
    pub alpha: f64,
}

/// Cap on how far a unit of height reaches when the sun is low (`1 / tan(altitude)`).
pub const MAX_SHADOW_STRETCH: f64 = 4.0;

/// Tiles of world length per screen pixel of height.
pub fn tiles_per_pixel_of_height(tile_width: f64) -> f64 {
    2.5_f64.sqrt() / tile_width
}

/// Tiles of world length per screen pixel *across* the shadow, where the sprite keeps its own
pub fn tiles_per_pixel_across(tile_width: f64) -> f64 {
    std::f64::consts::SQRT_2 / tile_width
}

/// Height of one block in tiles of world length (about half a tile).
pub fn block_height_in_tiles(box_height: f64, tile_width: f64) -> f64 {
    (box_height / tile_width) * 2.5_f64.sqrt()
}

/// Lays a sprite's silhouette on the ground as its shadow: screen pixels relative to the
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
        a: across_per_pixel * light.dir_y,
        b: -across_per_pixel * light.dir_x,
        c: -reach_per_pixel * light.dir_x,
        d: -reach_per_pixel * light.dir_y,
        tx: foot.0 + lift_reach * light.dir_x,
        ty: foot.1 + lift_reach * light.dir_y,
    }
}

/// How far down the shadow a plane `lift` blocks below the caster's own ground moves it, in
pub fn lift_reach(
    light: &ShadowProjection,
    lift: f64,
    tile_width: f64,
    box_height: f64,
) -> f64 {
    light.stretch * lift * box_height * tiles_per_pixel_of_height(tile_width)
}

/// Where the sun lays a caster's silhouette on another upright cut-out, in screen pixels.
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
    let across = -(light.dir_y * to_x - light.dir_x * to_y);
    Some((
        across / tiles_per_pixel_across(tile_width),
        along / (light.stretch * tiles_per_pixel_of_height(tile_width)) - lift * box_height,
    ))
}

/// Farthest ground distance (tiles) the shadow of something `height` screen pixels tall can
pub fn shadow_reach(height: f64, lift: f64, tile_width: f64, box_height: f64) -> f64 {
    (MAX_SHADOW_STRETCH * tiles_per_pixel_of_height(tile_width) * (height + lift * box_height))
        .max(0.0)
}

#[cfg(test)]
#[path = "shadow.test.rs"]
mod tests;
