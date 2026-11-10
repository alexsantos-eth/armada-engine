//! What the water shows of the scene: the reflections of the things standing around it. A sprite
//! drawn above its ground (a jump) is mirrored the same lift deeper in the water, so the arc
//! reads in the reflection too.

use iso::assets::{SpriteFrame, SpriteLayout};
use iso::projection::{ProjectionConfig, ScreenPoint};
use iso::water::{
    ReflectedSprite, cell_top, lay_on_water, mirror_sprite, reflection_cells, reflection_piece,
    waterline,
};
use macroquad::prelude::Color;

use crate::assets::sprites::{SpriteDraw, ground_key};

/// How opaque what the water mirrors is drawn.
pub const REFLECTION_ALPHA: f32 = 1.0;

/// What the water multiplies the artwork by: a little darker and bluer than the real thing,
pub const REFLECTION_TINT: Color = Color::new(
    0xc4 as f32 / 255.0,
    0xdb as f32 / 255.0,
    0xe4 as f32 / 255.0,
    REFLECTION_ALPHA,
);

/// Reflections draw in the layer of the shadows baked on the ground: over the water's own block,
pub const REFLECTION_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;

/// How far from its drawing the water still shows of something, in blocks: the search window opens
/// that many cells in either direction.
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
    Standing { turn_at: Option<f64> },
    /// Artwork that is already drawn as the water shows it — an asset's own reflection, laid
    AsDrawn,
}

/// The sprite being mirrored and the ground it stands on: the atlas slot it draws from, the
/// artwork's place on screen, and where its feet are, in blocks above the ground — `lift`
/// included for a jump, whose arc the water shows too.
#[derive(Clone, Copy, Debug)]
pub struct ReflectionSprite {
    /// Atlas texture the artwork is cut from.
    pub texture: usize,
    /// The frame of that texture to mirror.
    pub frame: SpriteFrame,
    /// Where the sprite is drawn on screen.
    pub layout: SpriteLayout,
    /// Where the caster's feet are drawn, jump included.
    pub feet: ScreenPoint,
    /// Blocks the sprite stands above the ground, jump included.
    pub elevation: f64,
    /// Blocks the caster is drawn above the ground it stands on; `0.0` for anything standing.
    pub lift: f64,
}

/// Queues what the water shows of `sprite`, cut to the water cells it falls on.
///
/// `sprite`'s `lift` is how many blocks the caster is above the ground it stands on. The
/// waterline does not rise with the jump — the reflection hangs from it — but the mirrored
/// artwork sinks below it by the same lift, so the arc reads in the water too.
pub fn collect_reflection(
    sprite: ReflectionSprite,
    reflected: Reflected,
    projection: ProjectionConfig,
    water_at: impl Fn(i32, i32) -> Option<WaterCell>,
    out: &mut Vec<SpriteDraw>,
) {
    let ReflectionSprite {
        texture,
        frame,
        layout,
        feet,
        elevation,
        lift,
    } = sprite;
    let box_height = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    let mirrored = |level: f64| -> ReflectedSprite {
        let surface = waterline(feet.y, elevation, level, box_height);
        match reflected {
            Reflected::Standing { turn_at } => {
                let grounded = feet.y + lift * box_height;
                mirror_sprite(layout, (grounded + surface) / 2.0, turn_at)
            }
            Reflected::AsDrawn => lay_on_water(layout),
        }
    };
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
    for x in min_x.saturating_sub(drop)..=max_x.saturating_add(drop) {
        for y in min_y.saturating_sub(drop)..=max_y.saturating_add(drop) {
            let Some(water) = water_at(x, y) else {
                continue;
            };
            if water.level > elevation {
                continue;
            }
            let sprite = mirrored(water.level);
            let cell = cell_top((x, y), water.level, projection);
            let Some(piece) = reflection_piece(&sprite, &cell) else {
                continue;
            };
            out.push(SpriteDraw::reflection(
                ground_key(
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
