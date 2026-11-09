//! The shadows one sprite receives from the others, as a grid over its own artwork.

use super::bake::{ShadowCaster, SpriteExtent};
use super::shadow::{ShadowProjection, cast_shadow_offset};
use super::terrain::{HeightField, ShadowPoint, receiver_point};

/// Corners across a receiver's artwork, and down it.
pub const SHADE_COLUMNS: u32 = 8;
pub const SHADE_ROWS: u32 = 16;

/// What shades one sprite: how dark each corner of a lattice over its artwork is, in `[0, 1]`.
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
#[allow(clippy::too_many_arguments)]
pub fn shade_grid(
    receiver: &ShadowReceiver,
    casters: &[ShadowCaster],
    light: &ShadowProjection,
    opacity: f64,
    tile_width: f64,
    box_height: f64,
    silhouette_of: super::bake::SilhouetteOf<'_, '_>,
    ground: Option<&HeightField>,
    columns: u32,
    rows: u32,
) -> Option<ShadeGrid> {
    let extent = receiver.extent;
    if extent.width <= 0.0 || extent.height <= 0.0 {
        return None;
    }
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
                let at_uv = silhouette_of(*silhouette).map_or(0.0, |mask| mask.at(u, v));
                coverage = coverage.max(at_uv.clamp(0.0, 1.0));
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
pub fn shaded_at(
    point: ShadowPoint,
    casters: &[ShadowCaster],
    light: &ShadowProjection,
    tile_width: f64,
    box_height: f64,
    silhouette_of: super::bake::SilhouetteOf<'_, '_>,
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
        let u = -(caster.extent.left + x) / caster.extent.width;
        let v = -(caster.extent.top + y) / caster.extent.height;
        if !(0.0..=1.0).contains(&u) || v < 0.0 || v > above_foot / caster.extent.height {
            continue;
        }
        let at_uv = silhouette_of(caster.silhouette).map_or(0.0, |mask| mask.at(u, v));
        coverage = coverage.max(at_uv.clamp(0.0, 1.0));
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
