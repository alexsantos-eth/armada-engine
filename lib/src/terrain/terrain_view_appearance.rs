//! Game content: what colour a patch of ground is drawn, and what grows on top of the grass.

use iso::assets::{InkBox, SpriteFrame};
use iso::terrain::{TerrainMaterial, TintZones, VariantPicker, tint_channels};
use macroquad::prelude::{Color, WHITE};

use crate::terrain::terrain_view::{MATERIAL_SLOTS, slot};

/// Grass zones, from the lowest noise to the highest: lush and darker, slightly darker, plain,
const GRASS_TINTS: (f64, &[u32]) = (10.0, &[0xbfd5bd, 0xdde9d4, 0xffffff, 0xfff0c0, 0xffe49c]);

/// Bare ground and the broader land tones: much subtler than the grass, because dirt has no
const LAND_TINTS: (f64, &[u32]) = (11.0, &[0xffffff, 0xfffbea, 0xf4f9df, 0xf2f5d6]);

/// The extra tops a grass column can grow, and the share of all grass each should cover.
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
pub struct TerrainLook {
    /// The colour zones of each material, by the slot [`super::slot`] gives it.
    tints: [Option<TintZones>; MATERIAL_SLOTS],
    /// Where the grass grows something, and the artwork of each top it can grow.
    grass_tops: Option<(VariantPicker, Vec<(SpriteFrame, InkBox)>)>,
}

impl TerrainLook {
    /// Resolves the catalogue, asking `artwork` for the frame and the measurement of each top's
    pub fn new(
        seed: u64,
        artwork: impl Fn(&str) -> Option<(SpriteFrame, InkBox)>,
    ) -> (Self, Vec<&'static str>) {
        let mut tints = [const { None }; MATERIAL_SLOTS];
        let mut zone = |material: TerrainMaterial, label: &str, (scale, colors): (f64, &[u32])| {
            tints[slot(material)] = TintZones::new(seed, label, scale, colors);
        };
        zone(TerrainMaterial::Grass, "terrain-tints:grass", GRASS_TINTS);
        zone(TerrainMaterial::Path, "terrain-tints:grass", GRASS_TINTS);
        zone(TerrainMaterial::Ground, "terrain-tints:ground", LAND_TINTS);

        let mut missing = Vec::new();
        let mut chances = Vec::new();
        let mut looks = Vec::new();
        for (source, chance) in GRASS_TOPS {
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
        let Some(zones) = &self.tints[slot(material)] else {
            return WHITE;
        };
        let (red, green, blue) = tint_channels(zones.at(x, y));
        Color::new(red, green, blue, 1.0)
    }

    /// The artwork of the top column `(x, y)` grows, if its material grows anything there.
    pub fn top(&self, material: TerrainMaterial, x: i32, y: i32) -> Option<(SpriteFrame, InkBox)> {
        if material != TerrainMaterial::Grass {
            return None;
        }
        let (picker, looks) = self.grass_tops.as_ref()?;
        looks.get(picker.pick(x, y)?).copied()
    }
}

#[cfg(test)]
#[path = "terrain_view_appearance.test.rs"]
mod tests;
