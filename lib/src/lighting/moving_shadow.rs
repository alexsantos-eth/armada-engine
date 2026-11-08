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
//! Sorting it with the sprite has one sharp edge: a level change that puts the sprite behind a
//! block puts the quad behind it too, on the same frame, and it is long enough that most of it
//! goes with them. [`MovingShadowKey`] holds the key for a few milliseconds after a level
//! change, and always while the player is in the air, so the shadow does not vanish on the
//! frame the feet cross into the cell they are about to land in.

use iso::assets::{SpriteFrame, SpriteLayout};
use iso::lighting::{PhaseLight, SpriteExtent, silhouette_matrix};
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use iso::scene_order::DrawKey;
use iso::terrain::TerrainMaterial;

use crate::assets::sprites::SpriteDraw;
use crate::lighting::shadow_view::GROUND_SHADOW_LAYER;

/// What the ground of one cell is, to a shadow being laid on it.
///
/// Every material fills its block, so the cell's elevation is both the level its top is drawn
/// at and the depth the scene sorts by — the same number the terrain and the baked shadows use
/// ([`crate::lighting::shadow_view::ShadowScene::collect_ground`]).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CellGround {
    /// The level the cell's top is drawn at, in blocks.
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
        let time_constant = if target.elevation < shown.elevation {
            0.13
        } else {
            0.05
        };
        let blend = 1.0 - (-seconds / time_constant).exp();
        let next = CellGround {
            elevation: shown.elevation + (target.elevation - shown.elevation) * blend,
            material: target.material,
        };
        self.shown = Some(next);
        self.shown
    }
}

/// How long the shadow keeps the draw position it had before the player changed level.
///
/// A level change snaps the sprite's key to the new column's level, and with it the depth of
/// the shadow. For a few frames the shadow therefore paints where it did just before the
/// change, over whatever hides the player at the new level, instead of vanishing on the same
/// frame the player disappears behind a block. Longer than a walk's worth of interpolation,
/// shorter than the receiver's slower downhill constant (0.13 s) would be.
pub const SHADOW_KEY_DELAY_SECONDS: f64 = 0.2;

/// Delayed copy of the player's draw key, for the shadow it casts.
///
/// The shadow shares the depth of the sprite it was cast from, so a level change that puts the
/// sprite behind a block puts the shadow behind it too, on the same frame. This holds the
/// committed key for [`SHADOW_KEY_DELAY_SECONDS`] after a level change, then snaps to the
/// pending one, so the quad lingers where it was instead of blinking out whole. Walks and flips
/// between the player's two depth layers take effect at once: only a level change is held. The
/// pending key is the latest seen, so a second level change inside the hold re-arms the delay
/// with it. Nothing is interpolated: keys are positions in the draw order, not pixels.
///
/// While the player is in the air (`held`), the key never advances at all: the feet cross the
/// boundary of the landing cell while the sprite is still drawn in the air above it, and a
/// shadow committed to that cell disappears behind whatever it stands behind until it lands.
/// The committed key is kept, whatever the caller signals, until the player lands.
#[derive(Clone, Copy, Debug, Default)]
pub struct MovingShadowKey {
    shown: Option<DrawKey>,
    pending: Option<DrawKey>,
    delay_seconds: f64,
}

impl MovingShadowKey {
    /// Advances the displayed key toward `target`.
    ///
    /// * `held` — the player is in the air: the committed key is kept, whatever `target` is,
    ///   until the player lands.
    /// * `level_changed` — `target` was built from a different level than the one it was last
    ///   fed: the change is held for [`SHADOW_KEY_DELAY_SECONDS`] and then adopted, whatever the
    ///   caller signals in between; a further level change replaces the pending key and starts
    ///   the delay over. Frames with nothing to hold count the delay down.
    /// * anything else commits at once, unless a level change is pending, in which case it waits
    ///   for that hold's deadline; a level change whose depth did not move commits at once,
    ///   like a layer flip.
    pub fn update(
        &mut self,
        target: DrawKey,
        held: bool,
        level_changed: bool,
        elapsed_seconds: f64,
    ) -> DrawKey {
        let Some(shown) = self.shown else {
            self.shown = Some(target);
            return target;
        };
        if held && target.depth != shown.depth {
            // In the air the feet cross the boundary of the landing cell while the sprite is
            // still drawn in the air; the shadow keeps the committed depth until landing.
            return shown;
        }
        if level_changed && target.depth != shown.depth {
            self.pending = Some(target);
            self.delay_seconds = SHADOW_KEY_DELAY_SECONDS;
            return shown;
        }
        if let Some(pending) = self.pending {
            self.delay_seconds -= elapsed_seconds.clamp(0.0, 0.1);
            if self.delay_seconds <= 0.0 {
                self.pending = None;
                self.shown = Some(pending);
                return pending;
            }
            return shown;
        }
        self.pending = None;
        self.shown = Some(target);
        target
    }
}

/// Queues the single shadow of a sprite drawn into `layout` standing on `foot`.
///
/// * `feet` — where that ground point is on screen, which is what `layout` was placed around.
/// * `level` — the level its feet are drawn on, in blocks, a jump included: in the air the
///   shadow slides away down the light, which is what tells a jump from a step.
/// * `ground` — the smoothed ground receiver, or `None` where the player's world is not loaded.
/// * `caster` — the key the sprite itself was queued with, normally the one [`MovingShadowKey`]
///   commits rather than the raw one, so a level change does not bury the quad on the same
///   frame the player disappears. The shadow draws at its depth,
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
        level - ground.elevation,
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
            let at = project_block(GridPoint { x, y }, ground.elevation, projection);
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
