//! Game content: what colour a patch of ground is drawn, and what grows on top of the grass.

use iso::assets::{InkBox, SpriteFrame};
use iso::biomes::WorldBiomes;
use iso::grid::WorldCoord;
use iso::maker::Dressing;
use iso::terrain::{TerrainMaterial, TintZones, VariantPicker, tint_channels};
use macroquad::prelude::{Color, WHITE};

use crate::terrain::terrain_view::{MATERIAL_SLOTS, slot};

/// Grass zones, from the lowest noise to the highest: lush and darker, slightly darker, plain,
const GRASS_TINTS: (f64, &[u32]) = (10.0, &[0xbfd5bd, 0xdde9d4, 0xffffff, 0xfff0c0, 0xffe49c]);

/// Bare ground and the broader land tones: much subtler than the grass, because dirt has no
const LAND_TINTS: (f64, &[u32]) = (11.0, &[0xffffff, 0xfffbea, 0xf4f9df, 0xf2f5d6]);

/// Scale of the grass and path colour zones, in world columns.
const GRASS_TINT_SCALE: f64 = 10.0;
/// Scale of the bare-ground colour zones, in world columns.
const GROUND_TINT_SCALE: f64 = 11.0;

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

/// Builds the colour zones of one biome (or of the world, when there is no biome content).
fn paint_zones(
    seed: u64,
    scope: Option<&str>,
    grass: &[u32],
    ground: &[u32],
) -> [Option<TintZones>; MATERIAL_SLOTS] {
    let mut tints = [const { None }; MATERIAL_SLOTS];
    let label = |material: &str| match scope {
        Some(biome) => format!("terrain-tints:{biome}:{material}"),
        None => format!("terrain-tints:{material}"),
    };
    tints[slot(TerrainMaterial::Grass)] =
        TintZones::new(seed, &label("grass"), GRASS_TINT_SCALE, grass);
    tints[slot(TerrainMaterial::Path)] =
        TintZones::new(seed, &label("grass"), GRASS_TINT_SCALE, grass);
    tints[slot(TerrainMaterial::Ground)] =
        TintZones::new(seed, &label("ground"), GROUND_TINT_SCALE, ground);
    tints
}

/// How a world's terrain is dressed: resolved once against the atlas and the world seed.
pub struct TerrainLook {
    /// The colour zones of each material, per biome; index `0` is the global look when there are
    /// no biomes, otherwise one slot set per biome in catalogue order.
    tints: Vec<[Option<TintZones>; MATERIAL_SLOTS]>,
    /// The world's biomes, when the content shipped them; `None` tints every column globally.
    biomes: Option<WorldBiomes>,
    /// Where the grass grows something, and the artwork of each top it can grow.
    grass_tops: Option<(VariantPicker, Vec<(SpriteFrame, InkBox)>)>,
    /// The cells dressed by hand, which answer before the noise does; empty in a played world.
    dressing: Dressing,
}

impl TerrainLook {
    /// Resolves the catalogue, asking `artwork` for the frame and the measurement of each top's; when
    /// `biomes` is given, every biome paints its own grass and ground, otherwise the world keeps
    /// the global palette.
    pub fn new(
        seed: u64,
        artwork: impl Fn(&str) -> Option<(SpriteFrame, InkBox)>,
        biomes: Option<&WorldBiomes>,
    ) -> (Self, Vec<&'static str>) {
        let tints = match biomes {
            Some(world) => world
                .biomes()
                .iter()
                .map(|biome| {
                    paint_zones(
                        seed,
                        Some(&biome.id),
                        &biome.grass_tints,
                        &biome.ground_tints,
                    )
                })
                .collect(),
            None => vec![paint_zones(seed, None, GRASS_TINTS.1, LAND_TINTS.1)],
        };

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
        (
            Self {
                tints,
                biomes: biomes.cloned(),
                grass_tops,
                dressing: Dressing::default(),
            },
            missing,
        )
    }

    /// The cells dressed by hand: what the maker writes its strokes into.
    pub fn dressing_mut(&mut self) -> &mut Dressing {
        &mut self.dressing
    }

    /// The palette of `material` at column `(x, y)`, or `None` where that material is not
    /// tinted there.
    fn zones(&self, material: TerrainMaterial, x: i32, y: i32) -> Option<&TintZones> {
        let index = self
            .biomes
            .as_ref()
            .map(|world| world.biome_index(x, y))
            .unwrap_or(0);
        self.tints
            .get(index)
            .and_then(|by_biome| by_biome[slot(material)].as_ref())
    }

    /// How many colour zones `material` is painted from at column `(x, y)`: what a chosen zone
    /// is an index into. Zero where that material is not tinted there.
    pub fn tint_zones(&self, material: TerrainMaterial, x: i32, y: i32) -> usize {
        self.zones(material, x, y).map_or(0, TintZones::zone_count)
    }

    /// How many tops the grass can grow: what a chosen top is an index into.
    pub fn top_count(&self) -> usize {
        self.grass_tops.as_ref().map_or(0, |(_, looks)| looks.len())
    }

    /// What a block of `material` standing on column `(x, y)` is multiplied by. A cell dressed
    /// by hand keeps its chosen zone; every other cell follows the noise.
    pub fn tint(&self, material: TerrainMaterial, x: i32, y: i32) -> Color {
        let Some(zones) = self.zones(material, x, y) else {
            return WHITE;
        };
        let chosen = (!self.dressing.is_empty())
            .then(|| self.dressing.tint(WorldCoord { x, y }))
            .flatten();
        let color = match chosen {
            Some(zone) => zones.color(zone),
            None => zones.at(x, y),
        };
        let (red, green, blue) = tint_channels(color);
        Color::new(red, green, blue, 1.0)
    }

    /// The artwork of the top column `(x, y)` grows, if its material grows anything there. A
    /// cell dressed by hand grows what it was given, or stays plain; the rest follow the noise.
    pub fn top(&self, material: TerrainMaterial, x: i32, y: i32) -> Option<(SpriteFrame, InkBox)> {
        if material != TerrainMaterial::Grass {
            return None;
        }
        let (picker, looks) = self.grass_tops.as_ref()?;
        let chosen = (!self.dressing.is_empty())
            .then(|| self.dressing.top(WorldCoord { x, y }))
            .flatten();
        match chosen {
            Some(top) => looks.get(top?).copied(),
            None => looks.get(picker.pick(x, y)?).copied(),
        }
    }
}

#[cfg(test)]
#[path = "terrain_view_appearance.test.rs"]
mod tests;
