//! The shadow of the player, laid on the ground and the walls every frame.
//!
//! Every other shadow in the client is baked ([`crate::shadow_view`]): the sun holds still, so a
//! chunk's shadows are computed when it is shown and read back for as long as it is. The player
//! is the one caster that cannot be, because it walks — a map baked with it in is wrong the next
//! step. The TypeScript client marks the maps a moving caster touches as dirty and gathers them
//! again (`shadows/moving-shadow.ts`); here a chunk's bake is tens of milliseconds, so doing that
//! per step would stutter.
//!
//! So this shadow is geometry, not a texture. [`iso::lighting::moving`] owns the
//! geometry — which surfaces take which part of the silhouette, and what each of them reads of
//! the artwork — and this module is what gathers the surfaces for it and puts the answer on
//! screen: the tops of the cells around the player and the exposed walls between them, and then
//! one mesh per piece, sorted by the cell it lies on.
//!
//! A piece therefore sorts like the baked shadow of that cell — over its terrain, under what
//! stands on it, under the player — and the ground drawn in front of the shadow still covers it.
//! What the shadow does not do is fall on anything but the ground: it stops at a tree instead of
//! climbing it, where a baked caster's would be read by the tree's own lattice.

use iso::assets::{SpriteFrame, SpriteLayout};
use iso::lighting::{
    PhaseLight, ShadowSurface, SpriteExtent, TerrainFace, moving_shadow_area,
    moving_shadow_pieces, terrain_faces,
};
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use iso::terrain::TerrainMaterial;

use crate::lighting::shadow_view::{FACE_FLOOR, GROUND_SHADOW_LAYER};
use crate::assets::sprites::{SpriteDraw, ground_key};

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

/// Queues the shadow of a sprite drawn into `layout` standing on `foot`, cut to the surfaces it
/// lands on.
///
/// * `feet` — where that ground point is on screen, which is what `layout` was placed around.
/// * `level` — the level its feet are drawn on, in blocks, a jump included: in the air the
///   shadow slides away down the light, which is what tells a jump from a step.
/// * `ground_at` — the ground of a cell, or `None` where the world is not loaded there.
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
    ground_at: impl Fn(i32, i32) -> Option<CellGround>,
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
    let box_height = projection.elevation_step.unwrap_or(projection.tile_height / 2.0);
    let Some(((min_x, min_y), (max_x, max_y))) =
        moving_shadow_area(&light.shadow, extent, foot, projection.tile_width, box_height)
    else {
        return;
    };
    // Every surface the shadow could reach: the tops of the cells around the player, and the
    // walls between them that the camera can see. Both come from the same levels the view draws
    // them at, so a piece lands exactly where its surface is drawn.
    let mut tops = Vec::new();
    let mut surfaces = Vec::new();
    let mut blockers = Vec::new();
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let Some(ground) = ground_at(x, y) else {
                continue;
            };
            tops.push((x, y, ground.level, ground.material));
            surfaces.push(ShadowSurface::Ground {
                cell: (x, y),
                level: ground.level,
            });
            blockers.push(((x, y), ground.level));
        }
    }
    let walls: Vec<TerrainFace> = terrain_faces(
        tops,
        |x, y| ground_at(x, y).map(|ground| ground.level),
        FACE_FLOOR,
    );
    surfaces.extend(walls.into_iter().map(ShadowSurface::Face));
    let mut pieces = Vec::new();
    moving_shadow_pieces(
        &light.shadow,
        extent,
        foot,
        level,
        projection.tile_width,
        box_height,
        &surfaces,
        &blockers,
        &mut pieces,
    );
    for piece in pieces {
        let cell = piece.surface.cell();
        // The same cell the level came from, so the depth and the geometry cannot disagree.
        let Some(ground) = ground_at(cell.0, cell.1) else {
            continue;
        };
        let points: Vec<(f64, f64)> = piece
            .points
            .iter()
            .map(|&(across, down)| {
                let (x, y, level) = piece.surface.point(across, down);
                let at = project_block(GridPoint { x, y }, level, projection);
                (at.screen_x, at.screen_y)
            })
            .collect();
        out.push(SpriteDraw::silhouette(
            ground_key(
                f64::from(cell.0) + 0.5,
                f64::from(cell.1) + 0.5,
                ground.elevation,
                GROUND_SHADOW_LAYER,
                projection.tile_height,
            ),
            texture,
            frame,
            points,
            piece.uv,
            opacity,
        ));
    }
}

#[cfg(test)]
#[path = "moving_shadow.test.rs"]
mod tests;
