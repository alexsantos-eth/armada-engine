//! The silhouettes a shadow is sampled from.
//!
//! Baking a shadow means asking, for a point on the ground, how opaque the caster's artwork is
//! at the place the sun's ray came through it. That is a question about *pixels*, and the atlas
//! lives on the GPU where this client cannot read it, so the atlas image is decoded once more on
//! the CPU and kept as one plane of coverage.
//!
//! It is kept at a fraction of the atlas's resolution ([`MASK_SCALE`]). A silhouette is blurred
//! into a penumbra as soon as it is baked, so the detail would be thrown away anyway, and the
//! atlas at full size is forty megabytes of bytes to hold for the life of the process. Averaging
//! rather than taking the largest value of each block is deliberate: a leaf half covering its
//! block casts half a shadow, which is what a canopy should do, and the artwork's rounded clay
//! edges come out soft instead of stepped.
//!
//! The TypeScript client has the same sampler for its moving receivers
//! (`core/engine/shadows/sprite-sample.ts`), where it reads a one-off render of the sprite back
//! off the GPU; this reads the file instead, because every caster here is in one atlas.

use iso::assets::{AssetManifest, InkBox, SpriteFrame};
use iso::lighting::Silhouette;
use macroquad::prelude::{Image, load_image};
use std::collections::HashMap;

/// How many atlas texels go into one texel of a mask, on each axis.
///
/// Four: a 4096 × 2709 atlas becomes a 1024 × 678 plane, 694 KB, and a tree trunk is still a
/// dozen texels wide.
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
    /// the manifest: what turns a frame into a caster.
    inks: Vec<Option<InkBox>>,
    by_source: HashMap<String, u32>,
}

impl SilhouetteMasks {
    /// Loads the atlas image at `path` and reduces it to coverage, one silhouette per manifest
    /// entry drawn out of the shared atlas.
    ///
    /// The sheets of player poses are left out: they have textures of their own and only the
    /// player is drawn from them, and the player is a receiver here, never a caster.
    ///
    /// `None` when the image cannot be read, which costs the scene its shadows and nothing else.
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
        // Summed first and divided after, so a block of fully opaque texels comes out fully
        // opaque: dividing each texel's own byte by the block's size first loses a sixteenth of
        // every value to rounding, and a solid trunk then casts a shadow five percent too pale.
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
        let mut by_source = HashMap::new();
        for entry in &manifest.entries {
            if entry.texture.is_some() || entry.sheet.is_some() {
                continue;
            }
            let Some(frame) = entry.primary_frame() else {
                continue;
            };
            by_source.insert(entry.source.clone(), frames.len() as u32);
            frames.push(frame);
            inks.push(entry.ink);
        }
        Self {
            width,
            height,
            alpha,
            frames,
            inks,
            by_source,
        }
    }

    /// Where the artwork at `source` belongs around the ground it stands on, or `None` when the
    /// pipeline never measured it: such a sprite is not drawn, so it does not cast either.
    pub fn ink_of(&self, source: &str) -> Option<InkBox> {
        self.inks[*self.by_source.get(source)? as usize]
    }

    /// The silhouette of the asset at `source`, or `None` if the atlas has none.
    pub fn index_of(&self, source: &str) -> Option<u32> {
        self.by_source.get(source).copied()
    }

    /// The silhouette of `index` as a window on the one plane every mask lives in, or `None`
    /// for an index this holds no frame for.
    ///
    /// The bake walks the plane itself, so this hands it over once per caster instead of
    /// answering a texel at a time: the box is where the artwork's own `(0, 0)` and `(1, 1)`
    /// land in plane texels. The frames of two sprites touch in the atlas, so the far corner is
    /// the frame's last texel and not the first of the next one.
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
