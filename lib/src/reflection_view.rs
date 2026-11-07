//! What the water shows of the scene: the reflections of the things standing around it.
//!
//! The TypeScript client gives every chunk of water a render texture of its own, mirrors the
//! sprites around it into that texture and lays each water column's square of it on the column's
//! top (`core/engine/water-reflections/`). The texture is how it clips a reflection to the water
//! without a mask, and it is how it can afford to ripple what it mirrors with the waves: the map
//! is redrawn thirty times a second on the GPU.
//!
//! This client has no render texture for it, and needs none. A reflection is a flip of the
//! sprite's own rectangle about the waterline ([`iso::water`] explains why that is the whole of
//! the matrix pair), so it is **cut to the water cells it covers** instead, one convex piece per
//! cell, exactly as the walking shadow is cut to the surfaces it lands on
//! ([`crate::moving_shadow`]). Each piece carries the depth of its own water cell and
//! [`REFLECTION_LAYER`], so it draws over that water and under everything the scene puts in
//! front of it: the bank between the viewer and the water covers the reflection on it, and the
//! land behind the water never shows one.
//!
//! Nothing here is baked. A reflection follows what it mirrors and the things that stand around
//! water walk about, so the pieces are gathered per frame from the same frame, layout and feet
//! the sprite was drawn with — the artwork is sampled a second time and nothing is rendered
//! twice.

use iso::assets::{SpriteFrame, SpriteLayout};
use iso::projection::{ProjectionConfig, ScreenPoint};
use iso::water::{
    ReflectedSprite, cell_top, lay_on_water, mirror_sprite, reflection_cells, reflection_piece,
    waterline,
};
use macroquad::prelude::Color;

use crate::sprites::{SpriteDraw, scene_key};

/// How opaque what the water mirrors is drawn.
///
/// The TypeScript client's `REFLECTION_ALPHA`. It is the one control for how much of the scene the
/// water gives back.
pub const REFLECTION_ALPHA: f32 = 0.62;

/// What the water multiplies the artwork by: a little darker and bluer than the real thing,
/// `#c4dbe4`, at [`REFLECTION_ALPHA`]. The TypeScript client's `REFLECTION_TINT` and alpha, in
/// one colour because the shader multiplies.
pub const REFLECTION_TINT: Color = Color::new(
    0xc4 as f32 / 255.0,
    0xdb as f32 / 255.0,
    0xe4 as f32 / 255.0,
    REFLECTION_ALPHA,
);

/// Reflections draw in the layer of the shadows baked on the ground: over the water's own block,
/// under whatever stands on the water or in front of it, under the player.
///
/// They share the layer rather than taking one between the water and its shadows, because a
/// water top and a reflection on it are never both dark: the sun is low and the shadows that
/// reach open water are the long ones. What matters is that neither draws over what stands in
/// front of it, and that is the depth, not the layer.
pub const REFLECTION_LAYER: i32 = crate::shadow_view::GROUND_SHADOW_LAYER;

/// How far below something the water still shows it, in blocks.
///
/// The cells a reflection reaches are read off the mirrored drawing itself
/// ([`iso::water::reflection_cells`]), which needs the water's level to answer — and the level is
/// what a cell is asked for. So the search starts from the water under the caster's own feet and
/// is widened towards the camera by what this drop is worth, which is where water that much
/// lower would take the reflection. Past it, the reflection of something standing four blocks up
/// a cliff is a long way from it and worth no lookups. The TypeScript client bounds the same
/// thing with `REFLECTION_REACH`, eight columns.
pub const MAX_REFLECTION_DROP: f64 = 4.0;

/// The water of one cell, to something being mirrored in it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WaterCell {
    /// The level its top is drawn at, in blocks, which is the plane things are mirrored in.
    pub level: f64,
    /// The elevation it sorts by, in blocks: the column's own, like its terrain and its shadows.
    pub elevation: f64,
}

/// What the water is being shown.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Reflected {
    /// A sprite the scene drew standing up, which the water shows upside down.
    ///
    /// `turn_at` is the screen `x` a sprite whose footprint runs over several cells is turned
    /// about, so that its reflection keeps the diagonal of its row; `None` for anything standing
    /// on a single cell. See [`iso::water::mirror_sprite`].
    Standing { turn_at: Option<f64> },
    /// Artwork that is already drawn as the water shows it — an asset's own reflection, laid
    /// where its generator put it. See [`iso::water::lay_on_water`].
    AsDrawn,
}

/// Queues what the water shows of the sprite drawn into `layout`, cut to the water cells it
/// falls on.
///
/// * `feet` — the ground point the sprite stands on, on screen: what `layout` was placed around.
/// * `elevation` — the level it stands on, in blocks, a jump included: the reflection hangs from
///   the water under its own cell, which is that far below it.
/// * `water_at` — the water of a cell, or `None` where there is none, or the world is not loaded.
#[allow(clippy::too_many_arguments)]
pub fn collect_reflection(
    texture: usize,
    frame: SpriteFrame,
    layout: SpriteLayout,
    feet: ScreenPoint,
    elevation: f64,
    reflected: Reflected,
    projection: ProjectionConfig,
    water_at: impl Fn(i32, i32) -> Option<WaterCell>,
    out: &mut Vec<SpriteDraw>,
) {
    let box_height = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    // The same sprite seen in water at `level`: only the waterline it hangs from moves with it.
    let mirrored = |level: f64| -> ReflectedSprite {
        match reflected {
            Reflected::Standing { turn_at } => mirror_sprite(
                layout,
                waterline(feet.y, elevation, level, box_height),
                turn_at,
            ),
            Reflected::AsDrawn => lay_on_water(layout),
        }
    };
    // Where the reflection would fall in water level with the caster's own feet, widened towards
    // the camera by what water [`MAX_REFLECTION_DROP`] lower would add. A drop moves the whole
    // drawing that far down the screen, and a pixel down the screen is a pixel nearer along both
    // axes of the grid.
    let Some(((min_x, min_y), (max_x, max_y))) =
        reflection_cells(&mirrored(elevation), elevation, projection)
    else {
        return;
    };
    let drop = if projection.tile_height > 0.0 {
        (MAX_REFLECTION_DROP * box_height / projection.tile_height).ceil() as i32
    } else {
        0
    };
    for x in min_x.saturating_sub(drop)..=max_x {
        for y in min_y.saturating_sub(drop)..=max_y {
            let Some(water) = water_at(x, y) else {
                continue;
            };
            // Water above what it would mirror shows nothing of it: a reflection hangs below the
            // surface, so the thing has to stand on it or above it.
            if water.level > elevation {
                continue;
            }
            let sprite = mirrored(water.level);
            let Some(piece) = reflection_piece(&sprite, &cell_top((x, y), water.level, projection))
            else {
                continue;
            };
            out.push(SpriteDraw::reflection(
                scene_key(
                    f64::from(x) + 0.5,
                    f64::from(y) + 0.5,
                    water.elevation,
                    REFLECTION_LAYER,
                    projection.tile_height,
                ),
                texture,
                frame,
                piece.points,
                piece.uv,
                REFLECTION_TINT,
            ));
        }
    }
}

#[cfg(test)]
#[path = "reflection_view.test.rs"]
mod tests;
