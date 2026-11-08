//! The one projected shadow of the player, queued every frame.
//!
//! Every other shadow in the client is baked ([`crate::shadow_view`]): the sun holds still, so a
//! chunk's shadows are computed when it is shown and read back for as long as it is. The player
//! is the one caster that cannot be, because it walks — a map baked with it in is wrong the next
//! step. The TypeScript client marks the maps a moving caster touches as dirty and gathers them
//! again (`shadows/moving-shadow.ts`); here a chunk's bake is tens of milliseconds, so doing that
//! per step would stutter.
//!
//! It is geometry, not a texture, but intentionally has just one quad: the entire silhouette is
//! projected on the ground beneath the player. It does not split across tiles, climb walls or
//! continue onto another level. That keeps the player readable without duplicated fragments. It
//! draws at the depth of the sprite it was cast from ([`GROUND_SHADOW_LAYER`]), so however far
//! the light throws it from the feet, it never jumps ahead of what is in front of the player.

use iso::assets::{SpriteFrame, SpriteLayout};
use iso::lighting::{PhaseLight, SpriteExtent, silhouette_matrix};
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use iso::scene_order::DrawKey;
use iso::terrain::TerrainMaterial;

use crate::assets::sprites::SpriteDraw;
use crate::lighting::shadow_view::GROUND_SHADOW_LAYER;

/// What the ground of one cell is, to a shadow being laid on it.
///
/// The level and the elevation are not the same number. Sand is drawn as a shallow slab, so its
/// surface is half a block below the elevation it has ([`crate::preview_top_level`]), and a
/// shadow laid at the elevation floats over every beach; but the depth the scene sorts by is the
/// column's own elevation, which is what the terrain and the baked shadows use
/// ([`crate::lighting::shadow_view::ShadowScene::collect_ground`]).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CellGround {
    /// The level the cell's top is drawn at, in blocks.
    pub level: f64,
    /// The elevation it sorts by, in blocks.
    pub elevation: f64,
    /// What it is made of, which is what its walls are made of.
    pub material: TerrainMaterial,
}

/// Smoothed receiver for the player's one-piece shadow.
///
/// Simulation ground changes at 20 Hz, while rendering happens between its ticks. Keeping the
/// receiver here makes a level change continuous even when it occurs at the end of a tick.
#[derive(Clone, Copy, Debug, Default)]
pub struct MovingShadowReceiver {
    shown: Option<CellGround>,
}

impl MovingShadowReceiver {
    /// Advances the displayed receiver toward the player's current ground.
    pub fn update(
        &mut self,
        target: Option<CellGround>,
        elapsed_seconds: f64,
    ) -> Option<CellGround> {
        let target = target?;
        let Some(shown) = self.shown else {
            self.shown = Some(target);
            return self.shown;
        };
        // Going down is slower than going up: a fall in receiver height otherwise reads as a
        // snap because the projection lengthens at the same time.
        let seconds = elapsed_seconds.clamp(0.0, 0.1);
        let time_constant = if target.level < shown.level { 0.13 } else { 0.05 };
        let blend = 1.0 - (-seconds / time_constant).exp();
        let next = CellGround {
            level: shown.level + (target.level - shown.level) * blend,
            elevation: shown.elevation + (target.elevation - shown.elevation) * blend,
            material: target.material,
        };
        self.shown = Some(next);
        self.shown
    }
}

/// Queues the single shadow of a sprite drawn into `layout` standing on `foot`.
///
/// * `feet` — where that ground point is on screen, which is what `layout` was placed around.
/// * `level` — the level its feet are drawn on, in blocks, a jump included: in the air the
///   shadow slides away down the light, which is what tells a jump from a step.
/// * `ground` — the smoothed ground receiver, or `None` where the player's world is not loaded.
/// * `caster` — the key the sprite itself was queued with. The shadow draws at that same depth,
///   on [`GROUND_SHADOW_LAYER`] (over the ground it was baked for, under whatever stands in it):
///   it is one quad that stretches far beyond the caster's cell, and keyed to its own nearest
///   corner it jumped ahead of everything between itself and the camera however far the light
///   threw it. Whatever tile towards the camera it falls on may now paint over it — the price
///   of sorting it with the caster it belongs to.
#[allow(clippy::too_many_arguments)]
pub fn collect_moving_shadow(
    light: &PhaseLight,
    texture: usize,
    frame: SpriteFrame,
    layout: SpriteLayout,
    feet: ScreenPoint,
    foot: (f64, f64),
    level: f64,
    projection: ProjectionConfig,
    ground: Option<CellGround>,
    caster: DrawKey,
    out: &mut Vec<SpriteDraw>,
) {
    let opacity = light.opacity() as f32;
    if opacity <= 0.0 {
        return;
    }
    let extent = SpriteExtent {
        left: layout.x - feet.x,
        top: layout.y - feet.y,
        width: layout.width,
        height: layout.height,
    };
    let above_foot = (-extent.top).clamp(0.0, extent.height);
    if above_foot <= 0.0 || extent.width <= 0.0 || light.shadow.stretch <= 0.0 {
        return;
    }
    let Some(ground) = ground else {
        return;
    };
    let box_height = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    let matrix = silhouette_matrix(
        &light.shadow,
        foot,
        level - ground.level,
        projection.tile_width,
        box_height,
    );
    let corners = [
        (extent.left, extent.top),
        (extent.left + extent.width, extent.top),
        (extent.left + extent.width, 0.0),
        (extent.left, 0.0),
    ];
    let world_points: Vec<(f64, f64)> = corners
        .into_iter()
        .map(|corner| matrix.apply(corner))
        .collect();
    let points = world_points
        .iter()
        .map(|&(x, y)| {
            let at = project_block(GridPoint { x, y }, ground.level, projection);
            (at.screen_x, at.screen_y)
        })
        .collect();
    out.push(SpriteDraw::silhouette(
        DrawKey {
            depth: caster.depth,
            layer: GROUND_SHADOW_LAYER,
        },
        texture,
        frame,
        points,
        vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)],
        opacity,
    ));
}

#[cfg(test)]
#[path = "moving_shadow.test.rs"]
mod tests;
