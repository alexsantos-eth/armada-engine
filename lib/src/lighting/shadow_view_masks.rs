//! The silhouettes a shadow is sampled from.

use crate::assets::sprites::artwork_key;
use iso::assets::{AssetManifest, InkBox, SpriteFrame};
use iso::lighting::Silhouette;
use macroquad::prelude::{Image, load_image};
use std::collections::HashMap;

/// How many atlas texels go into one texel of a mask, on each axis.
pub const MASK_SCALE: u32 = 4;

/// Coverage of every sprite in the atlas, addressed by the silhouette indexes this hands out.
pub struct SilhouetteMasks {
    width: u32,
    height: u32,
    /// One byte of coverage per mask texel, row by row.
    alpha: Vec<u8>,
    /// Each silhouette's frame in the atlas, in atlas texels.
    frames: Vec<SpriteFrame>,
    /// Where each silhouette's artwork belongs around the ground it stands on, straight out of
    inks: Vec<Option<InkBox>>,
    /// Every silhouette by [`artwork_key`], so a repainted asset is found under the
    /// drawing it overrides, which is the name the rest of the engine knows it by.
    by_artwork: HashMap<String, u32>,
}

impl SilhouetteMasks {
    /// Loads the atlas image at `path` and reduces it to coverage, one silhouette per manifest
    pub async fn load(path: &str, manifest: &AssetManifest) -> Option<Self> {
        let image = load_image(path).await.ok()?;
        Some(Self::from_image(&image, manifest))
    }

    /// Reduces `image` to coverage and indexes the manifest's own frames against it.
    pub fn from_image(image: &Image, manifest: &AssetManifest) -> Self {
        let (width, height) = (
            u32::from(image.width).div_ceil(MASK_SCALE),
            u32::from(image.height).div_ceil(MASK_SCALE),
        );
        let mut totals = vec![0u32; (width * height) as usize];
        let mut counts = vec![0u32; (width * height) as usize];
        let pixels = image.get_image_data();
        for y in 0..u32::from(image.height) {
            let row = y * u32::from(image.width);
            let target = (y / MASK_SCALE) * width;
            for x in 0..u32::from(image.width) {
                let at = (target + x / MASK_SCALE) as usize;
                totals[at] += u32::from(pixels[(row + x) as usize][3]);
                counts[at] += 1;
            }
        }
        let alpha: Vec<u8> = totals
            .iter()
            .zip(&counts)
            .map(|(&total, &count)| total.checked_div(count).unwrap_or(0) as u8)
            .collect();

        let mut frames = Vec::new();
        let mut inks = Vec::new();
        let mut by_artwork = HashMap::new();
        for entry in &manifest.entries {
            if entry.texture.is_some() || entry.sheet.is_some() {
                continue;
            }
            let Some(frame) = entry.primary_frame() else {
                continue;
            };
            by_artwork.insert(artwork_key(&entry.source).to_owned(), frames.len() as u32);
            frames.push(frame);
            inks.push(entry.ink);
        }
        Self {
            width,
            height,
            alpha,
            frames,
            inks,
            by_artwork,
        }
    }

    /// Where the artwork at `source` belongs around the ground it stands on, or `None` when the
    pub fn ink_of(&self, source: &str) -> Option<InkBox> {
        self.inks[*self.by_artwork.get(artwork_key(source))? as usize]
    }

    /// The silhouette of the asset at `source`, or `None` if the atlas has none.
    pub fn index_of(&self, source: &str) -> Option<u32> {
        self.by_artwork.get(artwork_key(source)).copied()
    }

    /// The silhouette of `index` as a window on the one plane every mask lives in, or `None`
    pub fn silhouette_of(&self, index: u32) -> Option<Silhouette<'_>> {
        let frame = self.frames.get(index as usize)?;
        let scale = f64::from(MASK_SCALE);
        Some(Silhouette {
            alpha: &self.alpha,
            stride: self.width,
            rows: self.height,
            left: f64::from(frame.x) / scale,
            top: f64::from(frame.y) / scale,
            right: f64::from(frame.x + frame.width.saturating_sub(1)) / scale,
            bottom: f64::from(frame.y + frame.height.saturating_sub(1)) / scale,
        })
    }
}

#[cfg(test)]
#[path = "shadow_view_masks.test.rs"]
mod tests;
