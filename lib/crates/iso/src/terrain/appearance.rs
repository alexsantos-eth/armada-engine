//! How the ground is dressed: the colour zones laid over it, and which top a column grows.
//!
//! Both are presentation, and both are decided by broad seeded noise rather than per column, so
//! that what they produce reads as geography — a dry yellow meadow, a corner of darker lawn, a
//! clump of flowers — instead of salt and pepper. Nothing here knows about sprites, textures or
//! screens: a tint is a colour multiplier and a variant is an index into whatever list of looks
//! the client resolved, which is why the rule lives in the domain and can be tested without a GPU.
//!
//! This is the port of the TypeScript client's `terrain-view/variants.ts` and the `noiseTints`
//! half of `terrain-view/terrain-view.ts`, with the same content numbers (`content/terrain.ts`).

use super::noise::{lattice_at, value_noise};

/// A smooth field over the world, in `[0, 1]`, sampled at absolute column coordinates.
///
/// Absolute, so a column reads the same value whatever chunk asks for it and whatever order the
/// chunks arrive in: a meadow runs across a chunk border without a seam, and a reloaded world
/// looks the same. Each field takes its own stream from the world seed and a label
/// ([`derive_seed`]), so adding one never moves what another already decided.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NoiseField {
    seed: u64,
    scale: f64,
    detail: f64,
}

impl NoiseField {
    /// `scale` is about the width of a blob of the field, in columns; `detail` is the weight of a
    /// second octave at twice the frequency, which frays the blobs' edges (`0.0` for none).
    pub fn new(seed: u64, label: &str, scale: f64, detail: f64) -> Self {
        Self {
            seed: derive_seed(seed, label),
            scale,
            detail,
        }
    }

    /// The field's value at column `(x, y)`.
    pub fn sample(&self, x: i32, y: i32) -> f64 {
        let (sx, sy) = (f64::from(x), f64::from(y));
        let base = value_noise(self.seed, sx, sy, self.scale);
        if self.detail == 0.0 {
            return base;
        }
        // Sampling at half the scale is sampling at twice the frequency, which is what the
        // TypeScript field does with `noise(x * 2, y * 2)`.
        let fine = value_noise(self.seed, sx, sy, self.scale / 2.0);
        (base + self.detail * fine) / (1.0 + self.detail)
    }
}

/// A stream of its own for `label` in the world of `seed`: FNV-1a over the label, mixed into the
/// seed. Two labels never share a stream, and a label keeps its stream across runs and platforms.
pub fn derive_seed(seed: u64, label: &str) -> u64 {
    let mut value: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in label.as_bytes() {
        value = (value ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3);
    }
    let mut mixed = seed ^ value;
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    mixed ^ (mixed >> 31)
}

/// Colour zones laid over the world by one broad field: which multiplier a column's material is
/// drawn with.
///
/// The colours are ordered from the lowest value of the field to the highest, so neighbouring
/// zones blend: a lush dark lawn gives way to plain grass and then to dry yellow, never from dark
/// straight to yellow. The value is cut into equal shares of its range, which over this noise
/// lands at roughly 9/26/31/25/9 per cent for five colours — the middle zone is the common one and
/// the extremes are accents, which is the look the TypeScript client gets from its own noise.
#[derive(Clone, Debug, PartialEq)]
pub struct TintZones {
    field: NoiseField,
    colors: Vec<u32>,
}

impl TintZones {
    /// `colors` are `0xRRGGBB` multipliers, ordered dark to light; an empty list tints nothing.
    pub fn new(seed: u64, label: &str, scale: f64, colors: &[u32]) -> Option<Self> {
        if colors.is_empty() {
            return None;
        }
        Some(Self {
            field: NoiseField::new(seed, label, scale, 0.0),
            colors: colors.to_vec(),
        })
    }

    /// The multiplier of column `(x, y)`.
    pub fn at(&self, x: i32, y: i32) -> u32 {
        self.colors[zone_index(self.field.sample(x, y), self.colors.len())]
    }
}

/// Which of `count` equal shares of `[0, 1]` the field value `value` falls in.
pub fn zone_index(value: f64, count: usize) -> usize {
    debug_assert!(count > 0, "a zone index needs at least one zone");
    ((value * count as f64).floor().max(0.0) as usize).min(count - 1)
}

/// The three channels of a `0xRRGGBB` multiplier, each in `[0, 1]`.
pub fn tint_channels(color: u32) -> (f32, f32, f32) {
    let channel = |shift: u32| ((color >> shift) & 0xff) as f32 / 255.0;
    (channel(16), channel(8), channel(0))
}

/// Size of a clump of variants, in columns: where the plants grow together.
pub const VARIANT_PATCH_SCALE: f64 = 6.0;
/// Size of a zone whose clumps are all of one kind (a meadow of yellow flowers, a corner of leaves).
pub const VARIANT_KIND_SCALE: f64 = 24.0;
/// Share of the columns inside a clump that show a variant: a clump is dense but not solid.
pub const VARIANT_PATCH_FILL: f64 = 0.7;
/// Side, in samples, of the grid the fields are measured on to turn chances into thresholds.
const CALIBRATION_SIDE: i32 = 96;
/// Columns between two calibration samples, so the grid spans many clumps and many zones.
const CALIBRATION_STEP: i32 = 5;

/// Which extra top a column grows, picked in clumps rather than one column at a time.
///
/// Three streams do it. The **patch** field says where things grow at all, at a few columns across
/// ([`VARIANT_PATCH_SCALE`]), and inside a patch only [`VARIANT_PATCH_FILL`] of the columns grow
/// anything — chosen by a hash of the column, so a clump is scattered rather than a solid blob.
/// The much slower **kind** field ([`VARIANT_KIND_SCALE`]) says *which* top, so neighbouring
/// clumps match and a stretch of ground reads as one kind of meadow.
///
/// The two thresholds are measured once, on a fixed grid of the fields, rather than assumed: the
/// noise is not uniform, so a plain "value above `1 - chance`" would miss the asked-for share by a
/// factor of two. Deterministic, and the same in any chunk order.
#[derive(Clone, Debug)]
pub struct VariantPicker {
    patches: NoiseField,
    kinds: NoiseField,
    /// The stream the in-clump scatter is hashed from.
    fill_seed: u64,
    /// A column grows something only where the patch field is above this.
    patch_above: f64,
    /// Upper bound of the kind field for each variant, ascending; the last is infinite.
    kind_below: Vec<f64>,
}

impl VariantPicker {
    /// `chances` is the share of all columns each variant should cover, in order. `None` when
    /// nothing is asked for, so the caller skips the lookup entirely rather than calling a picker
    /// that always answers nothing.
    pub fn new(seed: u64, label: &str, chances: &[f64]) -> Option<Self> {
        let total: f64 = chances.iter().filter(|chance| **chance > 0.0).sum();
        if total <= 0.0 {
            return None;
        }
        let patches = NoiseField::new(seed, &format!("{label}:patches"), VARIANT_PATCH_SCALE, 0.35);
        let kinds = NoiseField::new(seed, &format!("{label}:kinds"), VARIANT_KIND_SCALE, 0.0);
        let patch_samples = sorted_samples(&patches);
        let kind_samples = sorted_samples(&kinds);
        // The clumps cover `total / FILL` of the columns, so that FILL of those columns — the
        // share the scatter keeps — comes to `total`.
        let patch_above = quantile(&patch_samples, 1.0 - total / VARIANT_PATCH_FILL);
        let mut below = 0.0;
        let mut kind_below: Vec<f64> = chances
            .iter()
            .map(|chance| {
                below += chance.max(0.0);
                quantile(&kind_samples, below / total)
            })
            .collect();
        // The last variant that shows at all takes the rest, however the sum of chances rounded.
        let last = chances
            .iter()
            .rposition(|chance| *chance > 0.0)
            .expect("a positive total has a positive chance");
        kind_below[last] = f64::INFINITY;
        Some(Self {
            patches,
            kinds,
            fill_seed: derive_seed(seed, &format!("{label}:fill")),
            patch_above,
            kind_below,
        })
    }

    /// The variant column `(x, y)` grows, or `None` for the material's own plain top.
    pub fn pick(&self, x: i32, y: i32) -> Option<usize> {
        if self.patches.sample(x, y) <= self.patch_above
            || lattice_at(self.fill_seed, i64::from(x), i64::from(y)) >= VARIANT_PATCH_FILL
        {
            return None;
        }
        let kind = self.kinds.sample(x, y);
        self.kind_below.iter().position(|limit| kind < *limit)
    }
}

/// The field over a fixed grid, ascending: the sample the thresholds are read off.
fn sorted_samples(field: &NoiseField) -> Vec<f64> {
    let mut samples: Vec<f64> = (0..CALIBRATION_SIDE)
        .flat_map(|i| {
            (0..CALIBRATION_SIDE).map(move |j| (i * CALIBRATION_STEP, j * CALIBRATION_STEP))
        })
        .map(|(x, y)| field.sample(x, y))
        .collect();
    samples.sort_by(f64::total_cmp);
    samples
}

/// The value of `sorted` below which `fraction` of it lies.
fn quantile(sorted: &[f64], fraction: f64) -> f64 {
    if fraction <= 0.0 {
        return f64::NEG_INFINITY;
    }
    if fraction >= 1.0 {
        return f64::INFINITY;
    }
    sorted[(fraction * sorted.len() as f64).floor() as usize]
}

#[cfg(test)]
#[path = "appearance.test.rs"]
mod tests;
