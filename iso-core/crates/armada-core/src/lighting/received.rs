//! The shadows one sprite receives from the others, as a grid over its own artwork.
//!
//! A shadow falling on the ground is a map ([`super::bake`]); a shadow falling on something
//! standing up is not, because the thing it lands on is an upright cut-out with its own
//! silhouette and the shadow has to stop where that silhouette does. The TypeScript client
//! solves it with a render texture per receiver, masked by the receiver's own alpha
//! (`core/engine/shadows/received-shadow.ts`), and for the player — which moves, so nothing
//! about it can be baked — with a grid of coverage samples the player's view then shades its
//! sprite by (`receiveShadowGrid`).
//!
//! This client uses the grid for both. A grid needs no texture, no mask and no render target:
//! the sprite is drawn as a small lattice of quads instead of one, each corner carrying how dark
//! it is there, and the sprite's own pixels mask the shading for free because the shading *is*
//! the sprite, drawn darker. Entities never move, so their grids are baked with the chunk; the
//! player's is sampled again each frame, which is one grid.
//!
//! The grid's cost is its resolution: a shadow edge crossing a receiver lands between two
//! corners and is smoothed across the quad between them. At the sizes these sprites are drawn,
//! soft is what dawn's shadows look like anyway.

use super::bake::{ShadowCaster, SpriteExtent};
use super::shadow::{ShadowProjection, cast_shadow_offset};
use super::terrain::{HeightField, ShadowPoint, receiver_point};

/// Corners across a receiver's artwork, and down it.
///
/// The TypeScript client samples the player at 8 × 16 (`receiveShadowGrid`), so its lattice is
/// eight quads across and sixteen down; these are the corners of that same lattice.
pub const SHADE_COLUMNS: u32 = 8;
pub const SHADE_ROWS: u32 = 16;

/// What shades one sprite: how dark each corner of a lattice over its artwork is, in `[0, 1]`.
///
/// Stored row by row from the artwork's top left corner, `(columns + 1) × (rows + 1)` values.
#[derive(Clone, Debug, PartialEq)]
pub struct ShadeGrid {
    columns: u32,
    rows: u32,
    values: Vec<f32>,
}

impl ShadeGrid {
    pub fn columns(&self) -> u32 {
        self.columns
    }

    pub fn rows(&self) -> u32 {
        self.rows
    }

    /// How dark the corner `column` across and `row` down is, in `[0, 1]`.
    pub fn at(&self, column: u32, row: u32) -> f32 {
        let column = column.min(self.columns);
        let row = row.min(self.rows);
        self.values[(row * (self.columns + 1) + column) as usize]
    }

    /// Whether every corner is clear, so the client draws the sprite as one quad again.
    pub fn is_clear(&self) -> bool {
        self.values.iter().all(|&value| value <= 0.0)
    }
}

/// A sprite that other sprites' shadows may fall on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShadowReceiver {
    /// World tiles (cell centre) of the ground point it stands on.
    pub foot: (f64, f64),
    /// Height of that ground, in blocks.
    pub elevation: f64,
    /// Where its artwork is drawn around that point.
    pub extent: SpriteExtent,
}

/// The shadows `casters` and the ground cast on `receiver`, as a lattice of `columns` × `rows`
/// quads.
///
/// Coverage is the largest any one caster contributes, as on the ground: two shadows crossing a
/// trunk read as one. `opacity` is the phase's own ([`super::PhaseLight::opacity`]), applied
/// here so the client has nothing left to scale.
///
/// `ground` is the shadow the terrain itself casts. A sprite is an upright cut-out facing the
/// sun, so each corner of the lattice is a real place in the world
/// ([`receiver_point`]) and the ground's horizon is asked about it at its own height: that is
/// how a tree standing in a cliff's shadow comes out dark at the trunk and lit at the crown.
///
/// `None` when nothing reaches it, which is the common case and the one worth not allocating
/// for.
#[allow(clippy::too_many_arguments)]
pub fn shade_grid(
    receiver: &ShadowReceiver,
    casters: &[ShadowCaster],
    light: &ShadowProjection,
    opacity: f64,
    tile_width: f64,
    box_height: f64,
    alpha_at: super::bake::SilhouetteAlpha<'_>,
    ground: Option<&HeightField>,
    columns: u32,
    rows: u32,
) -> Option<ShadeGrid> {
    let extent = receiver.extent;
    if extent.width <= 0.0 || extent.height <= 0.0 {
        return None;
    }
    // Where each caster's silhouette lands on this receiver, in screen pixels relative to the
    // receiver's own ground point, plus how much of it stands above its own foot.
    let placed: Vec<(u32, SpriteExtent, f64)> = casters
        .iter()
        .filter_map(|caster| {
            let above_foot = (-caster.extent.top).clamp(0.0, caster.extent.height);
            if above_foot <= 0.0 || caster.extent.width <= 0.0 {
                return None;
            }
            let (x, y) = cast_shadow_offset(
                light,
                caster.foot,
                receiver.foot,
                caster.elevation - receiver.elevation,
                tile_width,
                box_height,
            )?;
            let at = SpriteExtent {
                left: caster.extent.left + x,
                top: caster.extent.top + y,
                width: caster.extent.width,
                height: caster.extent.height,
            };
            // Nowhere near it: the whole silhouette misses the receiver's rectangle.
            if at.left > extent.left + extent.width
                || at.left + at.width < extent.left
                || at.top > extent.top + extent.height
                || at.top + above_foot < extent.top
            {
                return None;
            }
            Some((caster.silhouette, at, above_foot))
        })
        .collect();
    let ground = ground.filter(|field| !field.is_empty());
    if placed.is_empty() && ground.is_none() {
        return None;
    }
    let foot = ShadowPoint { x: receiver.foot.0, y: receiver.foot.1, elevation: receiver.elevation };

    let mut values = Vec::with_capacity(((columns + 1) * (rows + 1)) as usize);
    let mut any = false;
    for row in 0..=rows {
        let y = extent.top + extent.height * f64::from(row) / f64::from(rows);
        for column in 0..=columns {
            let x = extent.left + extent.width * f64::from(column) / f64::from(columns);
            let mut coverage = 0.0_f64;
            for (silhouette, at, above_foot) in &placed {
                let u = (x - at.left) / at.width;
                let v = (y - at.top) / at.height;
                if !(0.0..=1.0).contains(&u) || v < 0.0 || v > above_foot / at.height {
                    continue;
                }
                coverage = coverage.max(alpha_at(*silhouette, u, v).clamp(0.0, 1.0));
            }
            if let Some(field) = ground {
                let point = receiver_point(foot, (0.0, 0.0), (x, y), light, tile_width, box_height);
                let horizon = field.horizon(point.x, point.y, light, box_height, tile_width);
                coverage = coverage.max(horizon.coverage(point.elevation));
            }
            let value = coverage * opacity;
            any |= value > 0.0;
            values.push(value as f32);
        }
    }
    any.then_some(ShadeGrid { columns, rows, values })
}

/// How shaded one point of the world is, by the casters around it and by the ground.
///
/// The lattice over a sprite ([`shade_grid`]) is this question asked over a rectangle of
/// artwork; a vertical face of ground has no artwork, only real points, so it asks directly.
/// The answer is coverage in `[0, 1]` before the phase's opacity.
///
/// Each caster is the same upright cut-out it is everywhere else: the ray from `point` back to
/// the sun meets its silhouette at one place, which is where its own foot's shadow would have
/// to move to land on this point.
pub fn shaded_at(
    point: ShadowPoint,
    casters: &[ShadowCaster],
    light: &ShadowProjection,
    tile_width: f64,
    box_height: f64,
    alpha_at: super::bake::SilhouetteAlpha<'_>,
    ground: Option<&HeightField>,
) -> f64 {
    let mut coverage = 0.0_f64;
    for caster in casters {
        let above_foot = (-caster.extent.top).clamp(0.0, caster.extent.height);
        if above_foot <= 0.0 || caster.extent.width <= 0.0 || caster.extent.height <= 0.0 {
            continue;
        }
        let Some((x, y)) = cast_shadow_offset(
            light,
            caster.foot,
            (point.x, point.y),
            caster.elevation - point.elevation,
            tile_width,
            box_height,
        ) else {
            continue;
        };
        // The point itself is the receiver's own ground point, so the silhouette has landed on
        // it when its placed rectangle contains the origin.
        let u = -(caster.extent.left + x) / caster.extent.width;
        let v = -(caster.extent.top + y) / caster.extent.height;
        if !(0.0..=1.0).contains(&u) || v < 0.0 || v > above_foot / caster.extent.height {
            continue;
        }
        coverage = coverage.max(alpha_at(caster.silhouette, u, v).clamp(0.0, 1.0));
        if coverage >= 1.0 {
            return 1.0;
        }
    }
    if let Some(field) = ground {
        let horizon = field.horizon(point.x, point.y, light, box_height, tile_width);
        coverage = coverage.max(horizon.coverage(point.elevation));
    }
    coverage
}

#[cfg(test)]
#[path = "received.test.rs"]
mod tests;
