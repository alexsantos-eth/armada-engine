//! Baking a chunk's ground shadows into a map, one texel per fraction of a tile.
//!
//! Dawn's shadows never move, so they are drawn once per chunk rather than once per frame. The
//! map is the same idea as the TypeScript client's render-texture shadow map
//! (`core/engine/shadows/shadows.ts`): a rectangle of the world a few tiles wider than the
//! chunk, every column holding its own square of texels, which the client then lays on that
//! column's top face. What the TypeScript client does on the GPU with black sprites and a blur
//! filter, this does on the CPU with [`silhouette_matrix`] and a box blur — the result is a
//! plain alpha image the client can upload once and forget.
//!
//! **Why a map and not a quad per caster.** A shadow drawn straight onto the ground as a
//! transparent quad darkens twice wherever two shadows overlap, which in a forest reads as
//! blotches; and a quad spills over the cliff beside it, because nothing clips it to the ground
//! it was computed for. Both go away in a map: coverage is combined by taking the larger of the
//! two, and a texel belongs to exactly one column, whose own level decides how far down the
//! shadow it sits.
//!
//! **What casts and what receives.** A caster is one sprite as it is drawn: a ground point, the
//! rectangle its artwork covers around that point and a silhouette to sample. Only the part of
//! it standing above the receiving plane casts, so the silhouette is cropped at its own foot and
//! again at the plane. A receiver is a column, named by the height of its drawn top; the shadow
//! of something `lift` blocks above it lands `lift` blocks further down the shadow.

use super::shadow::{ShadowProjection, lift_reach, silhouette_matrix};
use super::terrain::{HeightField, Horizon};

/// Texels of a shadow map per tile of world.
///
/// This is a shadow's own detail: a tile is a few hundred pixels wide on screen, so at twelve
/// texels a tile a tree's crown landed as one soft blob, and at twenty-four its leaves were
/// still a straight edge seen from close up. The TypeScript client bakes at 24 because that is
/// as far as a chunk and its blur fit in one 1024-texel render texture; here the map is a plain
/// image, so the number is only memory and time, and the ceiling is instead the silhouettes it
/// samples ([`Silhouette`]), which the client keeps at 80 texels a tile.
///
/// Thirty-six keeps a 32-column chunk with its margin at 1224 texels square (1.4 MB of
/// coverage, a scratch buffer the client reuses chunk after chunk) and a bake at about twice
/// what twenty-four cost: forty-eight was tried and gives a visibly harder edge again, but its
/// bake is twice this one and it was judged not worth the hitch when a chunk streams in.
///
/// Nothing in the bake scales with this that did not have to: the walk back to the sun is a
/// rate over the world ([`TERRAIN_SAMPLES_PER_TILE`]), the horizon and the silhouette are
/// carried along each row rather than worked out per texel, and the blur runs along the rows
/// the map is stored in.
pub const SHADOW_MAP_PIXELS_PER_TILE: u32 = 36;

/// Tiles a chunk's map reaches past the chunk on every side, so the blur of a shadow crossing a
/// chunk edge does not fade at the edge of the map.
pub const SHADOW_MAP_MARGIN: i32 = 1;

/// Radius of the box blur the bake finishes with, in texels: the penumbra.
///
/// One texel, and the sharpest penumbra the map can draw. The TypeScript client blurs 1.2 texels
/// at 24 a tile, half as much world again as this: a shadow here has a harder edge, which is
/// the point of baking finer than 24. Raising it would give that back and cost the lattice its
/// thinning, because a wider penumbra is a gentler ramp but over more texels.
pub const SHADOW_BLUR_TEXELS: u32 = 1;

/// Rectangle of columns a map covers, inclusive.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MapArea {
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32,
    pub max_y: i32,
}

impl MapArea {
    /// The area a chunk of columns `[min_x, max_x] × [min_y, max_y]` bakes, with its margin.
    pub fn around(min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> Self {
        Self {
            min_x: min_x - SHADOW_MAP_MARGIN,
            min_y: min_y - SHADOW_MAP_MARGIN,
            max_x: max_x + SHADOW_MAP_MARGIN,
            max_y: max_y + SHADOW_MAP_MARGIN,
        }
    }

    pub fn columns(&self) -> i32 {
        self.max_x - self.min_x + 1
    }

    pub fn rows(&self) -> i32 {
        self.max_y - self.min_y + 1
    }
}

/// The rectangle a sprite's artwork covers, in screen pixels relative to the ground point it
/// stands on: `x` right and `y` down, so a drawing standing on the ground has a negative `top`.
///
/// It is [`crate::assets::InkBox`] scaled by the tile width, which is exactly what
/// [`crate::assets::ink_layout`] draws the sprite into.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpriteExtent {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

/// One sprite that casts a shadow, as the scene draws it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShadowCaster {
    /// World tiles (cell centre) of the ground point it stands on.
    pub foot: (f64, f64),
    /// Height of that ground, in blocks.
    pub elevation: f64,
    /// Where its artwork is drawn around that point.
    pub extent: SpriteExtent,
    /// Which silhouette the bake samples for it; the client's own index.
    pub silhouette: u32,
}

/// A baked map: `alpha` is one byte of coverage per texel, row by row from the area's corner.
#[derive(Clone, Debug)]
pub struct ShadowMap {
    pub area: MapArea,
    pub pixels_per_tile: u32,
    pub width: u32,
    pub height: u32,
    pub alpha: Vec<u8>,
}

impl ShadowMap {
    /// An empty map over `area`.
    pub fn new(area: MapArea, pixels_per_tile: u32) -> Self {
        let width = area.columns().max(0) as u32 * pixels_per_tile;
        let height = area.rows().max(0) as u32 * pixels_per_tile;
        Self {
            area,
            pixels_per_tile,
            width,
            height,
            alpha: vec![0; (width as usize) * (height as usize)],
        }
    }

    /// Clears every texel, keeping the buffer: a chunk rebakes when a neighbour appears, and the
    /// map is the largest allocation the shadows make.
    pub fn clear(&mut self) {
        self.alpha.fill(0);
    }

    /// Points the map at another area of the world and clears it.
    ///
    /// Every chunk is the same size, so a client that bakes one chunk after another keeps one
    /// map and moves it rather than allocating a few hundred kilobytes of texels each time. The
    /// buffer is resized only when an area of a different size asks for it.
    pub fn move_to(&mut self, area: MapArea) {
        self.area = area;
        self.width = area.columns().max(0) as u32 * self.pixels_per_tile;
        self.height = area.rows().max(0) as u32 * self.pixels_per_tile;
        let texels = (self.width as usize) * (self.height as usize);
        if self.alpha.len() == texels {
            self.clear();
        } else {
            self.alpha.clear();
            self.alpha.resize(texels, 0);
        }
    }

    /// The texel square of one column, as `(x, y)` of its corner in texels. `None` outside the
    /// area.
    pub fn square_of(&self, x: i32, y: i32) -> Option<(u32, u32)> {
        if x < self.area.min_x || x > self.area.max_x || y < self.area.min_y || y > self.area.max_y
        {
            return None;
        }
        Some((
            (x - self.area.min_x) as u32 * self.pixels_per_tile,
            (y - self.area.min_y) as u32 * self.pixels_per_tile,
        ))
    }

    /// Whether any texel carries coverage, so the client can skip a chunk nothing shades.
    pub fn is_empty(&self) -> bool {
        self.alpha.iter().all(|&value| value == 0)
    }
}

/// How far a receiving column's drawn top lies, in blocks; `None` where there is no column.
pub type ReceivingLevel<'a> = &'a dyn Fn(i32, i32) -> Option<f64>;

/// One caster's silhouette: the plane of coverage it lives in, and its own box inside it.
///
/// The bake is handed the plane rather than asked for a texel at a time, because at 36 texels a
/// tile one tree is a few hundred thousand questions and the answer is a byte out of a slice.
/// A client keeps every silhouette in one plane (the whole atlas, reduced), so this borrows that
/// plane and says where in it the artwork sits — `left`/`top` is where `(0, 0)` of the artwork
/// lands and `right`/`bottom` where `(1, 1)` does, both in plane texels.
#[derive(Clone, Copy, Debug)]
pub struct Silhouette<'a> {
    /// The plane, row by row, one byte of coverage per texel.
    pub alpha: &'a [u8],
    /// Texels per row of the plane, and how many rows it has.
    pub stride: u32,
    pub rows: u32,
    pub left: f64,
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
}

impl Silhouette<'_> {
    /// Coverage in `[0, 1]` at `(u, v)`, both in `[0, 1]` over the artwork, `(0, 0)` being its
    /// top left corner. Zero outside it.
    pub fn at(&self, u: f64, v: f64) -> f64 {
        if !(0.0..=1.0).contains(&u) || !(0.0..=1.0).contains(&v) {
            return 0.0;
        }
        self.at_texel(self.left + u * (self.right - self.left), self.top + v * (self.bottom - self.top))
    }

    /// Coverage at a place already in plane texels, which is how the bake walks it: the place
    /// moves by a fixed step per texel of map, so it is carried rather than worked out again.
    pub fn at_texel(&self, x: f64, y: f64) -> f64 {
        // Nearest texel: the frames of two sprites touch in a packed atlas, so a sample that ran
        // over the edge would read the neighbouring artwork.
        let (x, y) = (x.floor(), y.floor());
        if x < 0.0 || y < 0.0 {
            return 0.0;
        }
        let (x, y) = (x as u32, y as u32);
        if x >= self.stride || y >= self.rows {
            return 0.0;
        }
        f64::from(self.alpha[(y * self.stride + x) as usize]) / 255.0
    }
}

/// The silhouette a caster's index names, or `None` for one the client has no artwork for.
///
/// The plane's own lifetime is kept apart from the borrow of the lookup, so a client whose
/// masks outlive the bake — all of them do — can hand over a closure made on the spot.
pub type SilhouetteOf<'a, 'plane> = &'a dyn Fn(u32) -> Option<Silhouette<'plane>>;

/// Bakes `casters` into `map`, then blurs it.
///
/// Every texel keeps the largest coverage any caster puts on it, so overlapping shadows read as
/// one shadow instead of darkening each other. The map is not cleared first: bake into a fresh
/// or [`ShadowMap::clear`]ed one.
///
/// * `tile_width`, `box_height` — the client's own drawing scale: a tile's width and a block's
///   body in screen pixels.
#[allow(clippy::too_many_arguments)]
pub fn bake_ground_shadows(
    map: &mut ShadowMap,
    casters: &[ShadowCaster],
    ground: Option<&HeightField>,
    light: &ShadowProjection,
    tile_width: f64,
    box_height: f64,
    level_at: ReceivingLevel<'_>,
    silhouette_of: SilhouetteOf<'_, '_>,
) {
    let mut levels = LevelCache::new(map.area, level_at);
    for caster in casters {
        lay_caster(map, caster, light, tile_width, box_height, &mut levels, silhouette_of);
    }
    if let Some(ground) = ground {
        lay_terrain(map, ground, light, tile_width, box_height, &levels);
    }
    blur_within_levels(map, SHADOW_BLUR_TEXELS, &levels);
    // The blur does not know about levels, so it spreads a shadow a texel past the column it
    // was laid on. Between two columns of solid ground that is the penumbra and exactly what is
    // wanted; over a hole — water, an unloaded neighbour, the air beside a cliff — it would
    // leave a shadow hanging in nothing, so those columns are wiped again afterwards.
    clear_columns_without_ground(map, &levels);
}

/// The steps `0..=steps` of a walk starting at `from` and moving by `step` that stay in
/// `[low, high]`, or `None` when none of them do.
fn within(from: f64, step: f64, low: f64, high: f64, steps: u32) -> Option<(u32, u32)> {
    if step == 0.0 {
        return (from >= low && from <= high).then_some((0, steps));
    }
    let (a, b) = ((low - from) / step, (high - from) / step);
    let (a, b) = if step > 0.0 { (a, b) } else { (b, a) };
    let first = a.max(0.0).ceil();
    let last = b.min(f64::from(steps)).floor();
    (first <= last).then_some((first as u32, last as u32))
}

/// The steps both runs hold, or `None` when they share none.
fn meet(one: (u32, u32), other: (u32, u32)) -> Option<(u32, u32)> {
    let run = (one.0.max(other.0), one.1.min(other.1));
    (run.0 <= run.1).then_some(run)
}

/// How often across a tile the ground's horizon is asked about.
///
/// The walk back to the sun is the expensive part of a bake, and a horizon moves slowly: it
/// changes where a cliff's edge crosses, and that edge is soft to begin with
/// ([`Horizon::width`]). Asking three times a tile and reading between the answers costs a
/// sixteenth of asking every texel and is not told apart on screen.
///
/// This is a rate over the **world**, not over the map, so sharpening the map
/// ([`SHADOW_MAP_PIXELS_PER_TILE`]) does not drag the walk along with it: the ground's own
/// shadow is already as soft as its horizon and gains nothing from more samples, while a
/// sprite's silhouette gains everything. Must divide [`SHADOW_MAP_PIXELS_PER_TILE`], so that a
/// column's own corners are always asked directly.
const TERRAIN_SAMPLES_PER_TILE: u32 = 3;

/// Lays the shadow the ground casts on itself over every texel.
///
/// Unlike a sprite, the ground is not laid out as a silhouette: what shades a point is whether
/// anything between it and the sun stands high enough, which [`HeightField::horizon`] answers
/// for every height at a horizontal place at once. The horizons are taken on a coarse lattice
/// and read between, and each texel then asks its own column's level.
fn lay_terrain(
    map: &mut ShadowMap,
    ground: &HeightField,
    light: &ShadowProjection,
    tile_width: f64,
    box_height: f64,
    levels: &LevelCache,
) {
    if map.width == 0 || map.height == 0 || ground.is_empty() || !levels.any() {
        return;
    }
    let per_tile = f64::from(map.pixels_per_tile);
    let step = (map.pixels_per_tile / TERRAIN_SAMPLES_PER_TILE.max(1)).max(1);
    let (across, down) = (map.width.div_ceil(step) + 1, map.height.div_ceil(step) + 1);
    let mut lattice = Vec::with_capacity((across * down) as usize);
    for row in 0..down {
        let world_y = f64::from(map.area.min_y) + f64::from(row * step) / per_tile;
        for column in 0..across {
            let world_x = f64::from(map.area.min_x) + f64::from(column * step) / per_tile;
            lattice.push(ground.horizon(world_x, world_y, light, box_height, tile_width));
        }
    }
    // Which column a lattice corner stands in. A corner is always inside one, but the two
    // corners either side of a texel need not be inside the *same* one, and the horizon jumps
    // at a column's edge: a cliff is on the horizon of the ground below it and not of its own
    // top. Reading across that edge laid a dark band along the sunny lip of every cliff, so a
    // corner from another column is not read at all — the texel takes the value of the corner
    // on its own side instead.
    let column_of = |corner: u32| (corner * step) / map.pixels_per_tile;
    // Which pair of lattice corners a texel reads on one axis, and how far between them.
    //
    // This is worked out once for each of a column's rows and once for each of its columns of
    // texels, not once per texel: a map texel asks nothing of the other axis, so the square of
    // a column needs `2 * pixels_per_tile` of this and not `pixels_per_tile²`. At 24 texels a
    // tile that is the difference between 48 divisions and 576.
    let blend = |texel: u32, span: u32, own: u32| {
        let low = texel / step;
        let t = f64::from(texel % step) / f64::from(step);
        let high = (low + 1).min(span - 1);
        if column_of(low) != own {
            (high, high, 0.0)
        } else if column_of(high) != own {
            (low, low, 0.0)
        } else {
            (low, high, t)
        }
    };
    let mix = |a: Horizon, b: Horizon, t: f64| Horizon {
        elevation: a.elevation + (b.elevation - a.elevation) * t,
        width: a.width + (b.width - a.width) * t,
    };
    let width = map.width as usize;
    let per_tile_texels = map.pixels_per_tile as usize;
    let mut across_blend = vec![(0u32, 0u32, 0.0f64); per_tile_texels];
    for y in map.area.min_y..=map.area.max_y {
        for x in map.area.min_x..=map.area.max_x {
            let (Some(level), Some((from_x, from_y))) = (levels.at(x, y), map.square_of(x, y))
            else {
                continue;
            };
            let own_x = from_x / map.pixels_per_tile;
            for (offset, slot) in across_blend.iter_mut().enumerate() {
                *slot = blend(from_x + offset as u32, across, own_x);
            }
            let own_y = from_y / map.pixels_per_tile;
            for offset in 0..map.pixels_per_tile {
                let texel_y = from_y + offset;
                let (y0, y1, ty) = blend(texel_y, down, own_y);
                let (top_row, bottom_row) = ((y0 * across) as usize, (y1 * across) as usize);
                let row = texel_y as usize * width;
                // Between one pair of lattice corners and the next the horizon is a straight
                // ramp, so it is worked out at the first texel of each run and then carried
                // along: four corners and three mixes once a run, two additions a texel. A run
                // is a whole sample cell, so at three samples a tile that is most of them.
                let (mut held, mut carried) = ((u32::MAX, u32::MAX), Horizon::CLEAR);
                let (mut elevation, mut width_of) = (0.0, 0.0);
                for (across_offset, &(x0, x1, tx)) in across_blend.iter().enumerate() {
                    if held != (x0, x1) {
                        held = (x0, x1);
                        // A corner the walk found no ground for stays at minus infinity, and
                        // reading towards it would drag its neighbours down with it, so a run
                        // that touches one is taken corner by corner instead of ramped.
                        let corners = [
                            lattice[top_row + x0 as usize],
                            lattice[top_row + x1 as usize],
                            lattice[bottom_row + x0 as usize],
                            lattice[bottom_row + x1 as usize],
                        ];
                        carried = if corners.iter().all(|c| c.elevation.is_finite()) {
                            let at = |t: f64| {
                                mix(mix(corners[0], corners[1], t), mix(corners[2], corners[3], t), ty)
                            };
                            let (low, high) = (at(0.0), at(1.0));
                            elevation = high.elevation - low.elevation;
                            width_of = high.width - low.width;
                            low
                        } else {
                            Horizon::CLEAR
                        };
                    }
                    let horizon = if carried.elevation.is_finite() {
                        Horizon {
                            elevation: carried.elevation + elevation * tx,
                            width: carried.width + width_of * tx,
                        }
                    } else {
                        let corner_x = if tx >= 0.5 { x1 } else { x0 } as usize;
                        lattice[if ty >= 0.5 { bottom_row } else { top_row } + corner_x]
                    };
                    let coverage = horizon.coverage(level);
                    if coverage <= 0.0 {
                        continue;
                    }
                    let index = row + from_x as usize + across_offset;
                    let value = (coverage * 255.0).round().clamp(0.0, 255.0) as u8;
                    map.alpha[index] = map.alpha[index].max(value);
                }
            }
        }
    }
}

/// Blanks the square of every column the world has no ground for.
fn clear_columns_without_ground(map: &mut ShadowMap, levels: &LevelCache) {
    let per_tile = map.pixels_per_tile;
    let width = map.width as usize;
    for y in map.area.min_y..=map.area.max_y {
        for x in map.area.min_x..=map.area.max_x {
            if levels.at(x, y).is_some() {
                continue;
            }
            let Some((from_x, from_y)) = map.square_of(x, y) else {
                continue;
            };
            for texel_y in from_y..from_y + per_tile {
                let row = texel_y as usize * width;
                map.alpha[row + from_x as usize..row + (from_x + per_tile) as usize].fill(0);
            }
        }
    }
}

/// The receiving level of every column of the area, read once: a caster walks the texels of its
/// own shadow and asks for the same columns again and again.
struct LevelCache {
    area: MapArea,
    levels: Vec<Option<f64>>,
    lowest: f64,
    highest: f64,
}

impl LevelCache {
    fn new(area: MapArea, level_at: ReceivingLevel<'_>) -> Self {
        let mut levels = Vec::with_capacity((area.columns().max(0) * area.rows().max(0)) as usize);
        let mut lowest = f64::INFINITY;
        let mut highest = f64::NEG_INFINITY;
        for y in area.min_y..=area.max_y {
            for x in area.min_x..=area.max_x {
                let level = level_at(x, y);
                if let Some(level) = level {
                    lowest = lowest.min(level);
                    highest = highest.max(level);
                }
                levels.push(level);
            }
        }
        Self { area, levels, lowest, highest }
    }

    fn at(&self, x: i32, y: i32) -> Option<f64> {
        if x < self.area.min_x || x > self.area.max_x || y < self.area.min_y || y > self.area.max_y
        {
            return None;
        }
        let index = (y - self.area.min_y) as usize * self.area.columns() as usize
            + (x - self.area.min_x) as usize;
        self.levels[index]
    }

    fn any(&self) -> bool {
        self.lowest <= self.highest
    }
}

/// Lays one caster's silhouette over every texel its shadow can reach.
///
/// The silhouette's map to the ground is the same for every receiving level but its translation
/// ([`lift_reach`]), so the inverse is taken once and each level only shifts the point a texel
/// asks about.
///
/// **The walk is by column and not by texel**, which is what makes the bake affordable. A
/// receiving level is a property of a column, and the lift it gives the caster decides how far
/// down the light its shadow has travelled; so the box of texels a shadow covers is tight for
/// one level and enormous for the range of levels a chunk holds — eight blocks of ground is
/// seven tiles of travel at dawn, twenty times the shadow's own area. Walking the columns and
/// giving each its own tight box visits the shadow itself instead of the hull of everywhere it
/// could have gone, which took a bake from tens of milliseconds to about one.
fn lay_caster(
    map: &mut ShadowMap,
    caster: &ShadowCaster,
    light: &ShadowProjection,
    tile_width: f64,
    box_height: f64,
    levels: &mut LevelCache,
    silhouette_of: SilhouetteOf<'_, '_>,
) {
    let extent = caster.extent;
    if extent.width <= 0.0 || extent.height <= 0.0 || !levels.any() {
        return;
    }
    let Some(silhouette) = silhouette_of(caster.silhouette) else {
        return;
    };
    // Cropped at its own foot: only what stands above the ground casts anything.
    let above_foot = (-extent.top).clamp(0.0, extent.height);
    if above_foot <= 0.0 {
        return;
    }
    let ground = silhouette_matrix(light, caster.foot, 0.0, tile_width, box_height);
    let Some(to_sprite) = ground.inverse() else {
        return;
    };
    // The silhouette's four corners laid on the ground, before any lift moves it.
    let laid = [
        (extent.left, extent.top),
        (extent.left + extent.width, extent.top),
        (extent.left + extent.width, extent.top + above_foot),
        (extent.left, extent.top + above_foot),
    ]
    .map(|corner| ground.apply(corner));
    // The lifts the chunk's own ground asks for, which bound how far the shadow travels, and so
    // which columns could possibly receive it.
    let reach = |lift: f64| lift_reach(light, lift, tile_width, box_height);
    let nearest = reach(caster.elevation - levels.highest);
    let farthest = reach(caster.elevation - levels.lowest);
    let over_all_lifts = union(
        shadow_box(&laid, nearest, light),
        shadow_box(&laid, farthest, light),
    );
    let Some(columns) = columns_touched(map.area, over_all_lifts) else {
        return;
    };

    let per_tile = map.pixels_per_tile;
    let width = map.width as usize;
    let (from_column_x, from_column_y, to_column_x, to_column_y) = columns;
    for column_y in from_column_y..=to_column_y {
        for column_x in from_column_x..=to_column_x {
            let Some(level) = levels.at(column_x, column_y) else {
                continue;
            };
            // How much of the silhouette still stands above this plane, and how far its shadow
            // has travelled to get here.
            let lift = caster.elevation - level;
            let standing = above_foot - (-lift).max(0.0) * box_height;
            if standing <= 0.0 {
                continue;
            }
            let shift = reach(lift);
            let Some((from_x, from_y, to_x, to_y)) =
                texels_of(map, column_x, column_y, shadow_box(&laid, shift, light))
            else {
                continue;
            };
            // Where the silhouette is read moves by the same step for every texel of a row, so
            // the place walks along with the row instead of being mapped back one by one — and
            // it walks in the plane's own texels, so the artwork's `u` and `v` never appear:
            // the box the artwork occupies there is what the bounds are tested against.
            let (across, down) = (silhouette.right - silhouette.left, silhouette.bottom - silhouette.top);
            let (step_x, step_y) = (
                to_sprite.a / f64::from(per_tile) / extent.width * across,
                to_sprite.b / f64::from(per_tile) / extent.height * down,
            );
            let foot_of_standing = silhouette.top + standing / extent.height * down;
            for texel_y in from_y..=to_y {
                let world_y =
                    f64::from(map.area.min_y) + (f64::from(texel_y) + 0.5) / f64::from(per_tile);
                let world_x =
                    f64::from(map.area.min_x) + (f64::from(from_x) + 0.5) / f64::from(per_tile);
                let (sprite_x, sprite_y) = to_sprite
                    .apply((world_x - shift * light.dir_x, world_y - shift * light.dir_y));
                let plane_x = silhouette.left + (sprite_x - extent.left) / extent.width * across;
                let plane_y = silhouette.top + (sprite_y - extent.top) / extent.height * down;
                // Which stretch of the row lands on the artwork at all. The shadow is a turned
                // quadrilateral inside an upright box of texels, so most of the box misses it;
                // solving for the stretch skips those instead of testing them one by one.
                let steps = to_x - from_x;
                let Some((first, last)) =
                    within(plane_x, step_x, silhouette.left, silhouette.right, steps).and_then(
                        |run| {
                            meet(run, within(plane_y, step_y, silhouette.top, foot_of_standing, steps)?)
                        },
                    )
                else {
                    continue;
                };
                let (mut at_x, mut at_y) =
                    (plane_x + step_x * f64::from(first), plane_y + step_y * f64::from(first));
                for texel_x in from_x + first..=from_x + last {
                    let coverage = silhouette.at_texel(at_x, at_y).clamp(0.0, 1.0);
                    at_x += step_x;
                    at_y += step_y;
                    if coverage <= 0.0 {
                        continue;
                    }
                    let texel = &mut map.alpha[texel_y as usize * width + texel_x as usize];
                    let value = (coverage * 255.0).round() as u8;
                    if value > *texel {
                        *texel = value;
                    }
                }
            }
        }
    }
}

/// A box in world tiles: `(min_x, min_y, max_x, max_y)`.
type WorldBox = (f64, f64, f64, f64);

/// The box the shadow of `laid` covers once a lift has moved it `shift` tiles down the light.
fn shadow_box(laid: &[(f64, f64); 4], shift: f64, light: &ShadowProjection) -> WorldBox {
    let (dx, dy) = (shift * light.dir_x, shift * light.dir_y);
    laid.iter().fold(
        (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY),
        |(min_x, min_y, max_x, max_y), &(x, y)| {
            (
                min_x.min(x + dx),
                min_y.min(y + dy),
                max_x.max(x + dx),
                max_y.max(y + dy),
            )
        },
    )
}

fn union(a: WorldBox, b: WorldBox) -> WorldBox {
    (a.0.min(b.0), a.1.min(b.1), a.2.max(b.2), a.3.max(b.3))
}

/// The columns of `area` that `box` overlaps, or `None` when it misses the area altogether.
fn columns_touched(area: MapArea, world: WorldBox) -> Option<(i32, i32, i32, i32)> {
    if !world.0.is_finite() || !world.1.is_finite() {
        return None;
    }
    // A column covers the world square from its own coordinate to one past it.
    let from_x = world.0.floor().max(f64::from(area.min_x)) as i32;
    let from_y = world.1.floor().max(f64::from(area.min_y)) as i32;
    let to_x = (world.2.ceil().min(f64::from(area.max_x) + 1.0) as i32) - 1;
    let to_y = (world.3.ceil().min(f64::from(area.max_y) + 1.0) as i32) - 1;
    (from_x <= to_x && from_y <= to_y).then_some((from_x, from_y, to_x, to_y))
}

/// The texels of one column's square that `box` overlaps, clamped to the map.
fn texels_of(
    map: &ShadowMap,
    column_x: i32,
    column_y: i32,
    world: WorldBox,
) -> Option<(u32, u32, u32, u32)> {
    let (square_x, square_y) = map.square_of(column_x, column_y)?;
    let per_tile = map.pixels_per_tile;
    let to_texel = |value: f64, origin: i32| (value - f64::from(origin)) * f64::from(per_tile);
    let clamp = |low: f64, high: f64, square: u32| {
        let from = (low.floor().max(f64::from(square)) as i64).max(0) as u32;
        let to = (high.ceil().min(f64::from(square + per_tile)) as i64 - 1).max(0) as u32;
        (from <= to && from < square + per_tile).then_some((from, to.min(square + per_tile - 1)))
    };
    let (from_x, to_x) = clamp(
        to_texel(world.0, map.area.min_x),
        to_texel(world.2, map.area.min_x),
        square_x,
    )?;
    let (from_y, to_y) = clamp(
        to_texel(world.1, map.area.min_y),
        to_texel(world.3, map.area.min_y),
        square_y,
    )?;
    Some((from_x, from_y, to_x, to_y))
}

/// A separable box blur over the whole map: the penumbra.
///
/// Edges are clamped rather than wrapped, which is what the map's margin is for: a shadow
/// reaching a chunk edge is blurred against the neighbour's own texels, not against nothing.
pub fn blur(map: &mut ShadowMap, radius: u32) {
    if radius == 0 || map.width == 0 || map.height == 0 {
        return;
    }
    let (width, height) = (map.width as usize, map.height as usize);
    let span = radius as usize;
    let mut row = vec![0u8; width.max(height)];
    for y in 0..height {
        row[..width].copy_from_slice(&map.alpha[y * width..(y + 1) * width]);
        for x in 0..width {
            map.alpha[y * width + x] = mean(&row[..width], x, span);
        }
    }
    for x in 0..width {
        for (y, value) in row[..height].iter_mut().enumerate() {
            *value = map.alpha[y * width + x];
        }
        for y in 0..height {
            map.alpha[y * width + x] = mean(&row[..height], y, span);
        }
    }
}

/// The same blur, but never reading across a step in the ground.
///
/// Two columns drawn at different levels are drawn in different places on screen, so a texel of
/// one says nothing about the other. Blurred together, the texel against the foot of a cliff
/// took a third of its alpha from the lit top above it and the shadow pulled away from the wall
/// it belongs to: a pale line along the base of every step, which is what the beach looked like.
/// Over the same step in the other direction it darkened the sunny lip of the top instead.
///
/// So the blur is cut at a boundary between columns of different level, and at one where either
/// side has no ground at all. Columns at the same level are drawn flush and coplanar, so the
/// blur runs through them untouched and a shadow crossing a field still has its soft edge.
fn blur_within_levels(map: &mut ShadowMap, radius: u32, levels: &LevelCache) {
    if radius == 0 || map.width == 0 || map.height == 0 {
        return;
    }
    let (width, height) = (map.width as usize, map.height as usize);
    let span = radius as usize;
    let per_tile = map.pixels_per_tile as usize;
    debug_assert!(per_tile > 2 * span, "a texel's window must not reach two column edges at once");
    // Whether the two columns either side of a texel boundary are drawn flush with each other,
    // asked once per pair rather than per texel.
    let joined = |a: Option<f64>, b: Option<f64>| matches!((a, b), (Some(a), Some(b)) if a == b);
    // Where the cuts fall depends only on which columns a line crosses, so it is worked out
    // once per row of columns rather than once per row of texels — as many times fewer as a
    // tile has texels.
    let mut cuts = vec![false; width + 1];
    let mut row = vec![0u8; width];
    for y in 0..height {
        if y % per_tile == 0 {
            let world_y = map.area.min_y + (y / per_tile) as i32;
            mark_cuts(&mut cuts, per_tile, |column| {
                let x = map.area.min_x + column as i32;
                joined(levels.at(x - 1, world_y), levels.at(x, world_y))
            });
        }
        row.copy_from_slice(&map.alpha[y * width..(y + 1) * width]);
        let out = &mut map.alpha[y * width..(y + 1) * width];
        // The window slides by one texel, so it is carried along the row rather than summed
        // again at every step, and only the few texels whose window reaches a cut are redone.
        let mut running: u32 = row[..=span.min(width - 1)].iter().map(|&v| u32::from(v)).sum();
        for x in 0..width {
            let (from, to) = (x.saturating_sub(span), (x + span).min(width - 1));
            out[x] = (running / (to - from + 1) as u32) as u8;
            if x + span + 1 < width {
                running += u32::from(row[x + span + 1]);
            }
            if x >= span {
                running -= u32::from(row[x - span]);
            }
        }
        for edge in (per_tile..width).step_by(per_tile) {
            if !cuts[edge] {
                continue;
            }
            let touching = edge.saturating_sub(span)..(edge + span).min(width);
            for (x, texel) in touching.clone().zip(out[touching].iter_mut()) {
                let (from, to) = if x < edge {
                    (x.saturating_sub(span), edge - 1)
                } else {
                    (edge, (x + span).min(width - 1))
                };
                let total: u32 = row[from..=to].iter().map(|&v| u32::from(v)).sum();
                *texel = (total / (to - from + 1) as u32) as u8;
            }
        }
    }
    blur_down_within_levels(map, span, levels, &joined);
}

/// The second pass of [`blur_within_levels`], down the map, run a row at a time.
///
/// Walking a column of a map steps a whole row through memory per texel, which at 36 texels a
/// tile throws away a cache line each time; the rows this reads are the rows the map is stored
/// in. A texel's window is the `2 * span + 1` rows around it, so that many are kept in a ring as
/// the pass walks down — the originals, because the row being written is one of them.
///
/// A cut can only fall on a column edge, and a window is narrower than a column, so a row's
/// window crosses at most one edge and most rows cross none at all: at 36 texels a tile, 34 of
/// every 36 rows are a plain mean of three rows with nothing to ask.
fn blur_down_within_levels(
    map: &mut ShadowMap,
    span: usize,
    levels: &LevelCache,
    joined: &dyn Fn(Option<f64>, Option<f64>) -> bool,
) {
    let (width, height) = (map.width as usize, map.height as usize);
    let per_tile = map.pixels_per_tile as usize;
    let keep = 2 * span + 1;
    let mut ring = vec![vec![0u8; width]; keep];
    let mut sums = vec![0u32; width];
    // Which texels of a row may not read across the edge above them. Worked out when the pass
    // reaches that edge and reused by every row whose window crosses it.
    let mut cut_above = vec![false; width];
    let (mut marked, mut loaded) = (usize::MAX, 0usize);
    for y in 0..height {
        let to = (y + span).min(height - 1);
        while loaded <= to {
            ring[loaded % keep].copy_from_slice(&map.alpha[loaded * width..(loaded + 1) * width]);
            loaded += 1;
        }
        let from = y.saturating_sub(span);
        sums[..width].fill(0);
        for source in from..=to {
            let line = &ring[source % keep];
            for (sum, value) in sums.iter_mut().zip(line.iter()) {
                *sum += u32::from(*value);
            }
        }
        let rows = (to - from + 1) as u32;
        let out = &mut map.alpha[y * width..(y + 1) * width];
        for (texel, sum) in out.iter_mut().zip(sums.iter()) {
            *texel = (*sum / rows) as u8;
        }
        // The one column edge this row's window might cross, if there is one.
        let edge = (from / per_tile + 1) * per_tile;
        if edge > to {
            continue;
        }
        if marked != edge {
            marked = edge;
            let world_y = map.area.min_y + (edge / per_tile) as i32;
            for (x, cut) in cut_above.iter_mut().enumerate() {
                let world_x = map.area.min_x + (x / per_tile) as i32;
                *cut = !joined(levels.at(world_x, world_y - 1), levels.at(world_x, world_y));
            }
        }
        let (kept_from, kept_to) = if y < edge { (from, edge - 1) } else { (edge, to) };
        let rows = (kept_to - kept_from + 1) as u32;
        for x in 0..width {
            if !cut_above[x] {
                continue;
            }
            let mut total = 0u32;
            for source in kept_from..=kept_to {
                total += u32::from(ring[source % keep][x]);
            }
            map.alpha[y * width + x] = (total / rows) as u8;
        }
    }
}

fn mark_cuts(cuts: &mut [bool], per_tile: usize, flush: impl Fn(usize) -> bool) {
    let last = cuts.len() - 1;
    for (index, cut) in cuts.iter_mut().enumerate() {
        *cut = index == 0 || index == last || (index % per_tile == 0 && !flush(index / per_tile));
    }
}

/// The mean of `line` over `at ± span`, with the ends clamped.
fn mean(line: &[u8], at: usize, span: usize) -> u8 {
    let from = at.saturating_sub(span);
    let to = (at + span).min(line.len() - 1);
    let mut total = 0u32;
    for value in &line[from..=to] {
        total += u32::from(*value);
    }
    (total / (to - from + 1) as u32) as u8
}

#[cfg(test)]
#[path = "bake.test.rs"]
mod tests;
