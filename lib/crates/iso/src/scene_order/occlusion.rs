//! Seeing the player through what stands in front of it: which sprites hide it, and how each
//! one fades out of the way and back.

use std::cmp::Ordering;

use crate::assets::SpriteLayout;
use crate::scene_order::order::{DrawKey, compare_draw_keys};

/// How long an occluder takes to fade out of the way, and to come back.
pub const OCCLUSION_FADE_MS: f64 = 200.0;

/// How much of itself an occluder keeps while the player stands behind it.
pub const OCCLUDER_OPACITY: f64 = 0.4;

/// The share of the player's box a sprite has to lie over before it counts as hiding it.
pub const OCCLUSION_MIN_COVER: f64 = 0.2;

/// How many cells a [`CoverMask`] has along each side, at most.
pub const COVER_MASK_CELLS: u32 = 24;

/// The grid of points the player's box is probed at, across and down.
pub const OCCLUDEE_PROBES: (u32, u32) = (6, 10);

/// What must stay visible: its box on screen and the key it is drawn with.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Occludee {
    pub area: SpriteLayout,
    pub key: DrawKey,
}

impl Occludee {
    /// Whether a sprite drawn with `key` and lying over `share` of this hides it: it is drawn
    /// later and covers at least [`OCCLUSION_MIN_COVER`].
    pub fn hidden_by(&self, key: DrawKey, share: f64) -> bool {
        compare_draw_keys(&key, &self.key) == Ordering::Greater && share >= OCCLUSION_MIN_COVER
    }
}

/// The share of `subject`'s area that `over` lies on, in `[0, 1]`.
pub fn cover_share(subject: SpriteLayout, over: SpriteLayout) -> f64 {
    let own = subject.width * subject.height;
    if own.is_nan() || own <= 0.0 {
        return 0.0;
    }
    let width = (subject.x + subject.width).min(over.x + over.width) - subject.x.max(over.x);
    let height = (subject.y + subject.height).min(over.y + over.height) - subject.y.max(over.y);
    if width.is_nan() || height.is_nan() || width <= 0.0 || height <= 0.0 {
        return 0.0;
    }
    (width * height / own).min(1.0)
}

/// The upright box around `points`, for a band of a sprite; `None` without points.
pub fn bounding_layout(points: &[(f64, f64)]) -> Option<SpriteLayout> {
    let &(x, y) = points.first()?;
    let (mut left, mut top, mut right, mut bottom) = (x, y, x, y);
    for &(x, y) in points {
        left = left.min(x);
        top = top.min(y);
        right = right.max(x);
        bottom = bottom.max(y);
    }
    Some(SpriteLayout {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}

/// Where a sprite's artwork is solid, on a coarse grid over its frame: what its rectangle
/// alone cannot say about a canopy's corners or the slope of a roof.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CoverMask {
    columns: u32,
    rows: u32,
    solid: Vec<bool>,
}

impl CoverMask {
    /// Reads the mask of a frame `width` by `height` pixels whose alpha is `alpha_at(x, y)`:
    /// a cell is solid when most of the nine pixels probed in it are more opaque than not.
    pub fn from_alpha(width: u32, height: u32, alpha_at: impl Fn(u32, u32) -> u8) -> Self {
        let columns = width.min(COVER_MASK_CELLS);
        let rows = height.min(COVER_MASK_CELLS);
        let mut solid = Vec::with_capacity((columns * rows) as usize);
        for row in 0..rows {
            for column in 0..columns {
                let mut opaque = 0;
                for probe in 0..9u32 {
                    let along = (f64::from(column) + (f64::from(probe % 3) + 0.5) / 3.0)
                        / f64::from(columns);
                    let down =
                        (f64::from(row) + (f64::from(probe / 3) + 0.5) / 3.0) / f64::from(rows);
                    let x = ((along * f64::from(width)) as u32).min(width - 1);
                    let y = ((down * f64::from(height)) as u32).min(height - 1);
                    if alpha_at(x, y) >= 128 {
                        opaque += 1;
                    }
                }
                solid.push(opaque >= 5);
            }
        }
        Self {
            columns,
            rows,
            solid,
        }
    }

    /// Whether the artwork is solid `along` its width and `down` its height, both in `[0, 1)`.
    pub fn solid_at(&self, along: f64, down: f64) -> bool {
        if self.solid.is_empty() || !(0.0..1.0).contains(&along) || !(0.0..1.0).contains(&down) {
            return false;
        }
        let column = ((along * f64::from(self.columns)) as u32).min(self.columns - 1);
        let row = ((down * f64::from(self.rows)) as u32).min(self.rows - 1);
        self.solid[(row * self.columns + column) as usize]
    }

    /// The share of `subject` this artwork lies over when it is drawn into `sprite`, counting
    /// only the part of it inside `within`: the band of it standing on one cell.
    pub fn share_over(
        &self,
        subject: SpriteLayout,
        sprite: SpriteLayout,
        within: SpriteLayout,
    ) -> f64 {
        if self.solid.is_empty() || sprite.width <= 0.0 || sprite.height <= 0.0 {
            return 0.0;
        }
        let (across, down) = OCCLUDEE_PROBES;
        let mut covered = 0u32;
        for row in 0..down {
            let y = subject.y + subject.height * (f64::from(row) + 0.5) / f64::from(down);
            if y < within.y || y >= within.y + within.height {
                continue;
            }
            for column in 0..across {
                let x = subject.x + subject.width * (f64::from(column) + 0.5) / f64::from(across);
                if x < within.x || x >= within.x + within.width {
                    continue;
                }
                if self.solid_at(
                    (x - sprite.x) / sprite.width,
                    (y - sprite.y) / sprite.height,
                ) {
                    covered += 1;
                }
            }
        }
        f64::from(covered) / f64::from(across * down)
    }
}

#[derive(Clone, Debug)]
struct Fade {
    id: String,
    amount: f64,
    seen: bool,
}

/// The fade of every sprite that hides the player or is still coming back from hiding it.
#[derive(Clone, Debug, Default)]
pub struct OcclusionFades {
    fades: Vec<Fade>,
    step: f64,
}

impl OcclusionFades {
    /// Opens a frame `elapsed_ms` after the last: forgets what was not drawn in it and what
    /// has fully come back.
    pub fn begin(&mut self, elapsed_ms: f64) {
        self.fades.retain(|fade| fade.seen && fade.amount > 0.0);
        for fade in &mut self.fades {
            fade.seen = false;
        }
        self.step = if elapsed_ms.is_finite() {
            (elapsed_ms / OCCLUSION_FADE_MS).max(0.0)
        } else {
            0.0
        };
    }

    /// How opaque the sprite `id` is drawn this frame, moving it towards
    /// [`OCCLUDER_OPACITY`] while it is `covering` the player and back to `1.0` when not.
    /// Call it once per sprite per frame.
    pub fn opacity(&mut self, id: &str, covering: bool) -> f64 {
        let index = match self.fades.iter().position(|fade| fade.id == id) {
            Some(index) => index,
            None if covering => {
                self.fades.push(Fade {
                    id: id.to_owned(),
                    amount: 0.0,
                    seen: false,
                });
                self.fades.len() - 1
            }
            None => return 1.0,
        };
        let fade = &mut self.fades[index];
        let step = if covering { self.step } else { -self.step };
        fade.amount = (fade.amount + step).clamp(0.0, 1.0);
        fade.seen = true;
        let eased = fade.amount * fade.amount * (3.0 - 2.0 * fade.amount);
        1.0 - (1.0 - OCCLUDER_OPACITY) * eased
    }

    /// Whether nothing is faded or fading.
    pub fn is_idle(&self) -> bool {
        self.fades.is_empty()
    }
}

#[cfg(test)]
#[path = "occlusion.test.rs"]
mod tests;
