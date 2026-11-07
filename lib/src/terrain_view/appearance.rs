//! Game content: what colour a patch of ground is drawn, and what grows on top of the grass.
//!
//! The rule is in the domain ([`iso::terrain::appearance`]); this is the catalogue it is fed and
//! the join to the atlas. Both are presentation only: nothing here changes a column's material,
//! its height, where the player can walk or what casts a shadow, so a world looks different
//! without playing differently. The numbers are the TypeScript client's
//! (`web/src/isometric/content/terrain.ts`), so the two clients show the same world.

use iso::assets::{InkBox, SpriteFrame};
use iso::terrain::{TerrainMaterial, TintZones, VariantPicker, tint_channels};
use macroquad::prelude::{Color, WHITE};

use super::MATERIAL_SLOTS;

/// Grass zones, from the lowest noise to the highest: lush and darker, slightly darker, plain,
/// yellowish, dry yellow. Ordered so that neighbouring zones blend instead of clashing.
const GRASS_TINTS: (f64, &[u32]) = (10.0, &[0xbfd5bd, 0xdde9d4, 0xffffff, 0xfff0c0, 0xffe49c]);

/// Bare ground and the broader land tones: much subtler than the grass, because dirt has no
/// season. The sand and the water keep their own colour.
const LAND_TINTS: (f64, &[u32]) = (11.0, &[0xffffff, 0xfffbea, 0xf4f9df, 0xf2f5d6]);

/// The extra tops a grass column can grow, and the share of all grass each should cover.
///
/// Each is a whole grass block whose artwork carries the clutter, generated from the plain block
/// by `artifacts/grass_clutter.py`, so a dressed column is still one sprite on one cell: no
/// entity, no footprint, no collision and no shadow of its own. About a third of the grass is
/// dressed in all, and the flowers lead because they are what reads at a distance.
const GRASS_TOPS: &[(&str, f64)] = &[
    ("/assets/grass/block_flowers.svg", 0.05),
    ("/assets/grass/block_flowers_2.svg", 0.04),
    ("/assets/grass/block_wildflowers_red.svg", 0.025),
    ("/assets/grass/block_wildflowers_white.svg", 0.025),
    ("/assets/grass/block_sprouts.svg", 0.07),
    ("/assets/grass/block_leaves.svg", 0.04),
    ("/assets/grass/block_pebbles.svg", 0.035),
    ("/assets/grass/block_mushrooms.svg", 0.015),
    ("/assets/grass/block_bushes.svg", 0.02),
];

/// How a world's terrain is dressed: resolved once against the atlas and the world seed.
///
/// The fields are sampled per drawn column — a few hundred a frame — so the thresholds and the
/// atlas lookups are all done here, at startup, and a column costs two noise samples and a hash.
pub struct TerrainLook {
    /// The colour zones of each material, by the slot [`super::slot`] gives it.
    tints: [Option<TintZones>; MATERIAL_SLOTS],
    /// Where the grass grows something, and the artwork of each top it can grow.
    grass_tops: Option<(VariantPicker, Vec<(SpriteFrame, InkBox)>)>,
}

impl TerrainLook {
    /// Resolves the catalogue, asking `artwork` for the frame and the measurement of each top's
    /// source path. Returns the tops it had none for: those are left out of the picker rather than
    /// drawn as holes in the ground, and the shares of the rest are recalibrated around them, so
    /// the grass stays dressed either way.
    ///
    /// The atlas is passed in as a lookup rather than by reference because it is a GPU texture and
    /// this catalogue is not: the rule can then be checked against the shipped manifest alone.
    pub fn new(
        seed: u64,
        artwork: impl Fn(&str) -> Option<(SpriteFrame, InkBox)>,
    ) -> (Self, Vec<&'static str>) {
        let mut tints = [const { None }; MATERIAL_SLOTS];
        let mut zone = |material: TerrainMaterial, label: &str, (scale, colors): (f64, &[u32])| {
            tints[super::slot(material)] = TintZones::new(seed, label, scale, colors);
        };
        // Grass and the paths cut through it share one field, so a path's grass edges take the
        // colour of the meadow it crosses instead of being a stripe of another zone.
        zone(TerrainMaterial::Grass, "terrain-tints:grass", GRASS_TINTS);
        zone(TerrainMaterial::Path, "terrain-tints:grass", GRASS_TINTS);
        zone(TerrainMaterial::Ground, "terrain-tints:ground", LAND_TINTS);

        let mut missing = Vec::new();
        let mut chances = Vec::new();
        let mut looks = Vec::new();
        for (source, chance) in GRASS_TOPS {
            // Both or neither: a top the pipeline never measured cannot be placed on the ground,
            // and guessing would stand it half a tile out of its cell.
            match artwork(source) {
                Some(look) => {
                    chances.push(*chance);
                    looks.push(look);
                }
                None => missing.push(*source),
            }
        }
        let grass_tops = VariantPicker::new(seed, "terrain-variants:grass", &chances)
            .map(|picker| (picker, looks));
        (Self { tints, grass_tops }, missing)
    }

    /// What a block of `material` standing on column `(x, y)` is multiplied by.
    pub fn tint(&self, material: TerrainMaterial, x: i32, y: i32) -> Color {
        let Some(zones) = &self.tints[super::slot(material)] else {
            return WHITE;
        };
        let (red, green, blue) = tint_channels(zones.at(x, y));
        Color::new(red, green, blue, 1.0)
    }

    /// The artwork of the top column `(x, y)` grows, if its material grows anything there.
    ///
    /// Only grass does, and only on the column's own surface block: a dressed block buried in a
    /// cliff would hide its flowers inside the ground above it.
    pub fn top(&self, material: TerrainMaterial, x: i32, y: i32) -> Option<(SpriteFrame, InkBox)> {
        if material != TerrainMaterial::Grass {
            return None;
        }
        let (picker, looks) = self.grass_tops.as_ref()?;
        looks.get(picker.pick(x, y)?).copied()
    }
}

#[cfg(test)]
#[path = "appearance.test.rs"]
mod tests;
