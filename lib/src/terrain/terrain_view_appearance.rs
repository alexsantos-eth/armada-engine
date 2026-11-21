//! Game content: what colour a patch of ground is drawn, and what lies on top of the grass and
//! of the bare ground.

use iso::assets::{InkBox, SpriteFrame};
use iso::biomes::WorldBiomes;
use iso::grid::WorldCoord;
use iso::maker::Dressing;
use iso::terrain::noise::lattice_at;
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
    ("/assets/grass/block_flowers.png", 0.05),
    ("/assets/grass/block_flowers_2.png", 0.04),
    ("/assets/grass/block_wildflowers_red.png", 0.025),
    ("/assets/grass/block_wildflowers_white.png", 0.025),
    ("/assets/grass/block_leaves.png", 0.04),
    ("/assets/grass/block_pebbles.png", 0.035),
    ("/assets/grass/block_mushrooms.png", 0.015),
];

/// The looks the bare ground can take, and the share of all bare ground each should cover:
/// whole ground blocks with the plain block's edges, so they join it anywhere, and one thing of
/// their own inside the cell (`artifacts/vox/clay/terrain_clay.py`, `GROUND_TOPS`). Bare ground
/// comes in small patches, so these are rolled cell by cell instead of gathered by the grass's
/// patch noise: gathered, a whole patch of dirt often fell between two clusters and showed none.
const GROUND_TOPS: &[(&str, f64)] = &[
    ("/assets/ground/block_dark.png", 0.09),
    ("/assets/ground/block_stones.png", 0.08),
    ("/assets/ground/block_damp.png", 0.04),
    ("/assets/ground/block_dry.png", 0.06),
];

/// Resolves the tops of one material against the atlas: the ones it lacks go to `missing`, the
/// rest come back with their chances.
fn resolve_tops(
    tops: &[(&'static str, f64)],
    artwork: &impl Fn(&str) -> Option<(SpriteFrame, InkBox)>,
    missing: &mut Vec<&'static str>,
) -> (Vec<f64>, Vec<Look>) {
    let mut chances = Vec::new();
    let mut looks = Vec::new();
    for (source, chance) in tops {
        match artwork(source) {
            Some(look) => {
                chances.push(*chance);
                looks.push(look);
            }
            None => missing.push(*source),
        }
    }
    (chances, looks)
}

/// Looks rolled one cell at a time: each covers its chance of the cells, wherever they are.
struct CellRoll {
    seed: u64,
    /// The running sum of the chances: a roll under the `n`th picks look `n`.
    below: Vec<f64>,
    looks: Vec<Look>,
}

impl CellRoll {
    fn new(seed: u64, chances: &[f64], looks: Vec<Look>) -> Option<Self> {
        let mut total = 0.0;
        let below: Vec<f64> = chances
            .iter()
            .map(|chance| {
                total += chance.max(0.0);
                total
            })
            .collect();
        (total > 0.0).then_some(Self { seed, below, looks })
    }

    fn pick(&self, x: i32, y: i32) -> Option<Look> {
        let roll = lattice_at(self.seed, i64::from(x), i64::from(y));
        let at = self.below.iter().position(|limit| roll < *limit)?;
        self.looks.get(at).copied()
    }
}

/// The other looks of each plain ground block (its `block.png` is the first), drawn one cell at a
/// time at random where the ground grows nothing. The looks of a material share every edge, so
/// any two join without a seam; only the inside of the cell differs, which breaks the grid of a
/// wide field.
const PLAIN_LOOKS: &[(TerrainMaterial, &[&str])] = &[
    (
        TerrainMaterial::Grass,
        &[
            "/assets/grass/block_2.png",
            "/assets/grass/block_3.png",
            "/assets/grass/block_4.png",
        ],
    ),
    (
        TerrainMaterial::Ground,
        &["/assets/ground/block_2.png", "/assets/ground/block_3.png"],
    ),
    (
        TerrainMaterial::Sand,
        &["/assets/sand/block_2.png", "/assets/sand/block_3.png"],
    ),
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

/// One artwork a terrain block can be drawn with: its frame in the atlas and its measurement.
type Look = (SpriteFrame, InkBox);

/// How a world's terrain is dressed: resolved once against the atlas and the world seed.
pub struct TerrainLook {
    /// The colour zones of each material, per biome; index `0` is the global look when there are
    /// no biomes, otherwise one slot set per biome in catalogue order.
    tints: Vec<[Option<TintZones>; MATERIAL_SLOTS]>,
    /// The world's biomes, when the content shipped them; `None` tints every column globally.
    biomes: Option<WorldBiomes>,
    /// Where the grass grows something, and the artwork of each top it can grow.
    grass_tops: Option<(VariantPicker, Vec<(SpriteFrame, InkBox)>)>,
    /// Where the bare ground takes one of its own looks, and the artwork of each.
    ground_tops: Option<CellRoll>,
    /// The other looks of each plain ground block, and the stream that picks one per cell.
    plains: (u64, Vec<(TerrainMaterial, Vec<Look>)>),
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
        let (chances, looks) = resolve_tops(GRASS_TOPS, &artwork, &mut missing);
        let grass_tops = VariantPicker::new(seed, "terrain-variants:grass", &chances)
            .map(|picker| (picker, looks));
        let (chances, looks) = resolve_tops(GROUND_TOPS, &artwork, &mut missing);
        let ground_tops = CellRoll::new(seed ^ 0x6a09_e667_f3bc_c909, &chances, looks);
        let mut plains = Vec::new();
        for (material, sources) in PLAIN_LOOKS {
            let mut looks = Vec::new();
            for source in *sources {
                match artwork(source) {
                    Some(look) => looks.push(look),
                    None => missing.push(*source),
                }
            }
            plains.push((*material, looks));
        }
        let plain_seed = seed ^ 0x9e37_79b9_7f4a_7c15;
        (
            Self {
                tints,
                biomes: biomes.cloned(),
                grass_tops,
                ground_tops,
                plains: (plain_seed, plains),
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
    /// grass cell dressed by hand grows what it was given, or stays plain, and a bare-ground cell
    /// dressed by hand stays plain (the maker's tops are the grass's); the rest follow the noise.
    pub fn top(&self, material: TerrainMaterial, x: i32, y: i32) -> Option<(SpriteFrame, InkBox)> {
        let chosen = (!self.dressing.is_empty())
            .then(|| self.dressing.top(WorldCoord { x, y }))
            .flatten();
        let (picker, looks) = match material {
            TerrainMaterial::Grass => self.grass_tops.as_ref()?,
            TerrainMaterial::Ground if chosen.is_none() => {
                return self.ground_tops.as_ref()?.pick(x, y);
            }
            _ => return None,
        };
        match chosen {
            Some(top) => looks.get(top?).copied(),
            None => looks.get(picker.pick(x, y)?).copied(),
        }
    }

    /// Which look of the plain block column `(x, y)` shows where it grows nothing: `None` is the
    /// block's own artwork, otherwise one of the other plain looks, picked per cell at random.
    pub fn plain(
        &self,
        material: TerrainMaterial,
        x: i32,
        y: i32,
    ) -> Option<(SpriteFrame, InkBox)> {
        let (seed, plains) = &self.plains;
        let (_, looks) = plains.iter().find(|(kind, _)| *kind == material)?;
        if looks.is_empty() {
            return None;
        }
        let pick = lattice_at(*seed, i64::from(x), i64::from(y)) * (looks.len() + 1) as f64;
        let pick = (pick as usize).min(looks.len());
        pick.checked_sub(1).and_then(|at| looks.get(at).copied())
    }
}

#[cfg(test)]
#[path = "terrain_view_appearance.test.rs"]
mod tests;
