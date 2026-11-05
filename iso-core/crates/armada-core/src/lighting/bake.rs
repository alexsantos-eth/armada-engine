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

/// Texels of a shadow map per tile of world.
///
/// The TypeScript client bakes at 24 so a whole chunk and its blur stay inside one 1024-texel
/// render texture. Here the map is a plain image, so the number is only about memory and
/// sharpness: twelve texels a tile keeps a 32-column chunk with its margin at 408 texels square
/// (666 KB as RGBA) and still resolves a trunk, and dawn's shadows are long and soft rather than
/// detailed.
pub const SHADOW_MAP_PIXELS_PER_TILE: u32 = 12;

/// Tiles a chunk's map reaches past the chunk on every side, so the blur of a shadow crossing a
/// chunk edge does not fade at the edge of the map.
pub const SHADOW_MAP_MARGIN: i32 = 1;

/// Radius of the box blur the bake finishes with, in texels: the penumbra.
///
/// The TypeScript client blurs by 1.2 texels at 24 texels a tile. One texel at twelve is the
/// same width of world, and a radius of one is the cheapest blur there is.
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

/// Coverage in `[0, 1]` of silhouette `index` at `(u, v)`, both in `[0, 1]` over the sprite's
/// own artwork: `(0, 0)` is its top left corner.
pub type SilhouetteAlpha<'a> = &'a dyn Fn(u32, f64, f64) -> f64;

/// Bakes `casters` into `map`, then blurs it.
///
/// Every texel keeps the largest coverage any caster puts on it, so overlapping shadows read as
/// one shadow instead of darkening each other. The map is not cleared first: bake into a fresh
/// or [`ShadowMap::clear`]ed one.
///
/// * `tile_width`, `box_height` — the client's own drawing scale: a tile's width and a block's
///   body in screen pixels.
pub fn bake_ground_shadows(
    map: &mut ShadowMap,
    casters: &[ShadowCaster],
    light: &ShadowProjection,
    tile_width: f64,
    box_height: f64,
    level_at: ReceivingLevel<'_>,
    alpha_at: SilhouetteAlpha<'_>,
) {
    let mut levels = LevelCache::new(map.area, level_at);
    for caster in casters {
        lay_caster(map, caster, light, tile_width, box_height, &mut levels, alpha_at);
    }
    blur(map, SHADOW_BLUR_TEXELS);
    // The blur does not know about levels, so it spreads a shadow a texel past the column it
    // was laid on. Between two columns of solid ground that is the penumbra and exactly what is
    // wanted; over a hole — water, an unloaded neighbour, the air beside a cliff — it would
    // leave a shadow hanging in nothing, so those columns are wiped again afterwards.
    clear_columns_without_ground(map, &levels);
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
    alpha_at: SilhouetteAlpha<'_>,
) {
    let extent = caster.extent;
    if extent.width <= 0.0 || extent.height <= 0.0 || !levels.any() {
        return;
    }
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
            for texel_y in from_y..=to_y {
                let world_y =
                    f64::from(map.area.min_y) + (f64::from(texel_y) + 0.5) / f64::from(per_tile);
                for texel_x in from_x..=to_x {
                    let world_x =
                        f64::from(map.area.min_x) + (f64::from(texel_x) + 0.5) / f64::from(per_tile);
                    let (sprite_x, sprite_y) = to_sprite
                        .apply((world_x - shift * light.dir_x, world_y - shift * light.dir_y));
                    let u = (sprite_x - extent.left) / extent.width;
                    let v = (sprite_y - extent.top) / extent.height;
                    if !(0.0..=1.0).contains(&u) || v < 0.0 || v > standing / extent.height {
                        continue;
                    }
                    let coverage = alpha_at(caster.silhouette, u, v).clamp(0.0, 1.0);
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
