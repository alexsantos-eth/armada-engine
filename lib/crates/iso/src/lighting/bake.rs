//! Baking a chunk's ground shadows into a map, one texel per fraction of a tile.

use super::shadow::{BoxMetrics, ShadowProjection, lift_reach, silhouette_matrix};
use super::terrain::{HeightField, Horizon};

/// Texels of a shadow map per tile of world.
pub const SHADOW_MAP_PIXELS_PER_TILE: u32 = 36;

/// Tiles a chunk's map reaches past the chunk on every side, so the blur of a shadow crossing a
pub const SHADOW_MAP_MARGIN: i32 = 1;

/// Radius of the box blur the bake finishes with, in texels: the penumbra.
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

    /// The texel square of column `(x, y)` within an area drawn at `pixels_per_tile`, as
    pub fn square_of(&self, x: i32, y: i32, pixels_per_tile: u32) -> Option<(u32, u32)> {
        if x < self.min_x || x > self.max_x || y < self.min_y || y > self.max_y {
            return None;
        }
        Some((
            (x - self.min_x) as u32 * pixels_per_tile,
            (y - self.min_y) as u32 * pixels_per_tile,
        ))
    }

    pub fn rows(&self) -> i32 {
        self.max_y - self.min_y + 1
    }
}

/// The rectangle a sprite's artwork covers, in screen pixels relative to the ground point it
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
    pub fn clear(&mut self) {
        self.alpha.fill(0);
    }

    /// Points the map at another area of the world and clears it.
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
    pub fn square_of(&self, x: i32, y: i32) -> Option<(u32, u32)> {
        self.area.square_of(x, y, self.pixels_per_tile)
    }

    /// Whether any texel carries coverage, so the client can skip a chunk nothing shades.
    pub fn is_empty(&self) -> bool {
        self.alpha.iter().all(|&value| value == 0)
    }
}

/// How far a receiving column's drawn top lies, in blocks; `None` where there is no column.
pub type ReceivingLevel<'a> = &'a dyn Fn(i32, i32) -> Option<f64>;

/// One caster's silhouette: the plane of coverage it lives in, and its own box inside it.
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
    pub fn at(&self, u: f64, v: f64) -> f64 {
        if !(0.0..=1.0).contains(&u) || !(0.0..=1.0).contains(&v) {
            return 0.0;
        }
        self.at_texel(
            self.left + u * (self.right - self.left),
            self.top + v * (self.bottom - self.top),
        )
    }

    /// Coverage at a place already in plane texels, which is how the bake walks it: the place
    pub fn at_texel(&self, x: f64, y: f64) -> f64 {
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
pub type SilhouetteOf<'a, 'plane> = &'a dyn Fn(u32) -> Option<Silhouette<'plane>>;

/// Bakes `casters` into `map`, then blurs it.
pub fn bake_ground_shadows(
    map: &mut ShadowMap,
    casters: &[ShadowCaster],
    ground: Option<&HeightField>,
    light: &ShadowProjection,
    metrics: BoxMetrics,
    level_at: ReceivingLevel<'_>,
    silhouette_of: SilhouetteOf<'_, '_>,
) {
    let mut bake = GroundBake::new(map, level_at);
    while bake.step(map, casters, ground, light, metrics, silhouette_of) {}
}

/// One chunk's ground bake, carried across frames a piece at a time.
pub struct GroundBake {
    levels: LevelCache,
    /// The caster to lay next; past the end of the list, the ground's turn.
    next_caster: usize,
    /// The ground's horizon, as far as it has been walked.
    horizon: Vec<Horizon>,
    stage: Stage,
}

/// Lattice rows walked, and rows of columns shaded, in one piece of work.
const HORIZON_ROWS_PER_STEP: u32 = 8;
const TERRAIN_ROWS_PER_STEP: i32 = 4;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Stage {
    Casters,
    /// Walking the horizon lattice back to the sun, from this row on.
    Horizon(u32),
    /// Shading the ground from it, from this row of columns on.
    Terrain(i32),
    /// The two passes of the blur, which are a pass over the whole map each.
    BlurAcross,
    BlurDown,
    Done,
}

impl GroundBake {
    /// Reads the levels `map`'s area receives shadows on, which every later step needs.
    pub fn new(map: &ShadowMap, level_at: ReceivingLevel<'_>) -> Self {
        Self {
            levels: LevelCache::new(map.area, level_at),
            next_caster: 0,
            horizon: Vec::new(),
            stage: Stage::Casters,
        }
    }

    pub fn is_done(&self) -> bool {
        self.stage == Stage::Done
    }

    /// Does the next piece of work, and says whether any was left to do.
    pub fn step(
        &mut self,
        map: &mut ShadowMap,
        casters: &[ShadowCaster],
        ground: Option<&HeightField>,
        light: &ShadowProjection,
        metrics: BoxMetrics,
        silhouette_of: SilhouetteOf<'_, '_>,
    ) -> bool {
        let BoxMetrics {
            tile_width,
            box_height,
        } = metrics;
        match self.stage {
            Stage::Casters => {
                if let Some(caster) = casters.get(self.next_caster) {
                    self.next_caster += 1;
                    lay_caster(
                        map,
                        caster,
                        light,
                        tile_width,
                        box_height,
                        &mut self.levels,
                        silhouette_of,
                    );
                } else {
                    self.stage = Stage::Horizon(0);
                }
            }
            Stage::Horizon(from) => {
                let walked = ground.map_or(0, |ground| {
                    horizon_rows(
                        map,
                        ground,
                        light,
                        BoxMetrics {
                            tile_width,
                            box_height,
                        },
                        from,
                        HORIZON_ROWS_PER_STEP,
                        &mut self.horizon,
                    )
                });
                self.stage = if walked == 0 {
                    Stage::Terrain(0)
                } else {
                    Stage::Horizon(from + walked)
                };
            }
            Stage::Terrain(from) => {
                let laid = lay_terrain_rows(
                    map,
                    &self.horizon,
                    &self.levels,
                    from,
                    TERRAIN_ROWS_PER_STEP,
                );
                self.stage = if laid == 0 || from + laid > map.area.rows() {
                    self.horizon = Vec::new();
                    Stage::BlurAcross
                } else {
                    Stage::Terrain(from + laid)
                };
            }
            Stage::BlurAcross => {
                blur_across_within_levels(map, SHADOW_BLUR_TEXELS, &self.levels);
                self.stage = Stage::BlurDown;
            }
            Stage::BlurDown => {
                blur_down_within_levels(map, SHADOW_BLUR_TEXELS as usize, &self.levels);
                clear_columns_without_ground(map, &self.levels);
                self.stage = Stage::Done;
            }
            Stage::Done => return false,
        }
        true
    }
}

/// The steps `0..=steps` of a walk starting at `from` and moving by `step` that stay in
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
const TERRAIN_SAMPLES_PER_TILE: u32 = 3;

/// Lays the shadow the ground casts on itself over every texel.
fn horizon_lattice_shape(map: &ShadowMap) -> (u32, u32, u32) {
    let step = (map.pixels_per_tile / TERRAIN_SAMPLES_PER_TILE.max(1)).max(1);
    (
        step,
        map.width.div_ceil(step) + 1,
        map.height.div_ceil(step) + 1,
    )
}

/// Walks `rows` rows of the horizon lattice back to the sun, starting at `from`, and appends
/// them to `out`.
fn horizon_rows(
    map: &ShadowMap,
    ground: &HeightField,
    light: &ShadowProjection,
    metrics: BoxMetrics,
    from: u32,
    rows: u32,
    out: &mut Vec<Horizon>,
) -> u32 {
    let BoxMetrics {
        tile_width,
        box_height,
    } = metrics;
    let (step, across, down) = horizon_lattice_shape(map);
    let per_tile = f64::from(map.pixels_per_tile);
    let last = (from + rows).min(down);
    for row in from..last {
        let world_y = f64::from(map.area.min_y) + f64::from(row * step) / per_tile;
        for column in 0..across {
            let world_x = f64::from(map.area.min_x) + f64::from(column * step) / per_tile;
            out.push(ground.horizon(world_x, world_y, light, box_height, tile_width));
        }
    }
    last.saturating_sub(from)
}

/// Lays the ground's own shadow over `rows` rows of columns, starting at the row `from` of the
fn lay_terrain_rows(
    map: &mut ShadowMap,
    lattice: &[Horizon],
    levels: &LevelCache,
    from: i32,
    rows: i32,
) -> i32 {
    if map.width == 0 || map.height == 0 || lattice.is_empty() || !levels.any() {
        return 0;
    }
    let (step, across, down) = horizon_lattice_shape(map);
    let column_of = |corner: u32| (corner * step) / map.pixels_per_tile;
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
    let first = map.area.min_y + from;
    let last = (first + rows - 1).min(map.area.max_y);
    for y in first..=last {
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
                let (mut held, mut carried) = ((u32::MAX, u32::MAX), Horizon::CLEAR);
                let (mut elevation, mut width_of) = (0.0, 0.0);
                let (mut run_lit, mut run_full) = (false, false);
                for (across_offset, &(x0, x1, tx)) in across_blend.iter().enumerate() {
                    if held != (x0, x1) {
                        held = (x0, x1);
                        let corners = [
                            lattice[top_row + x0 as usize],
                            lattice[top_row + x1 as usize],
                            lattice[bottom_row + x0 as usize],
                            lattice[bottom_row + x1 as usize],
                        ];
                        carried = if corners.iter().all(|c| c.elevation.is_finite()) {
                            let at = |t: f64| {
                                mix(
                                    mix(corners[0], corners[1], t),
                                    mix(corners[2], corners[3], t),
                                    ty,
                                )
                            };
                            let (low, high) = (at(0.0), at(1.0));
                            elevation = high.elevation - low.elevation;
                            width_of = high.width - low.width;
                            let (ends_low, ends_high) = (low.coverage(level), high.coverage(level));
                            run_lit = ends_low <= 0.0 && ends_high <= 0.0;
                            run_full = ends_low >= 1.0 && ends_high >= 1.0;
                            low
                        } else {
                            run_lit = false;
                            run_full = false;
                            Horizon::CLEAR
                        };
                    }
                    if run_lit {
                        continue;
                    }
                    if run_full {
                        map.alpha[row + from_x as usize + across_offset] = u8::MAX;
                        continue;
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
    (last - first + 1).max(0)
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
        Self {
            area,
            levels,
            lowest,
            highest,
        }
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
    let above_foot = (-extent.top).clamp(0.0, extent.height);
    if above_foot <= 0.0 {
        return;
    }
    let ground = silhouette_matrix(light, caster.foot, 0.0, tile_width, box_height);
    let Some(to_sprite) = ground.inverse() else {
        return;
    };
    let laid = [
        (extent.left, extent.top),
        (extent.left + extent.width, extent.top),
        (extent.left + extent.width, extent.top + above_foot),
        (extent.left, extent.top + above_foot),
    ]
    .map(|corner| ground.apply(corner));
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
            let (across, down) = (
                silhouette.right - silhouette.left,
                silhouette.bottom - silhouette.top,
            );
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
                let (sprite_x, sprite_y) =
                    to_sprite.apply((world_x - shift * light.dir_x, world_y - shift * light.dir_y));
                let plane_x = silhouette.left + (sprite_x - extent.left) / extent.width * across;
                let plane_y = silhouette.top + (sprite_y - extent.top) / extent.height * down;
                let steps = to_x - from_x;
                let Some((first, last)) =
                    within(plane_x, step_x, silhouette.left, silhouette.right, steps).and_then(
                        |run| {
                            meet(
                                run,
                                within(plane_y, step_y, silhouette.top, foot_of_standing, steps)?,
                            )
                        },
                    )
                else {
                    continue;
                };
                let (mut at_x, mut at_y) = (
                    plane_x + step_x * f64::from(first),
                    plane_y + step_y * f64::from(first),
                );
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
        (
            f64::INFINITY,
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::NEG_INFINITY,
        ),
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
fn blur_across_within_levels(map: &mut ShadowMap, radius: u32, levels: &LevelCache) {
    if radius == 0 || map.width == 0 || map.height == 0 {
        return;
    }
    let (width, height) = (map.width as usize, map.height as usize);
    let span = radius as usize;
    let per_tile = map.pixels_per_tile as usize;
    debug_assert!(
        per_tile > 2 * span,
        "a texel's window must not reach two column edges at once"
    );
    let joined = |a: Option<f64>, b: Option<f64>| matches!((a, b), (Some(a), Some(b)) if a == b);
    let means = full_window_means(span);
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
        let mut start = 0;
        while start < width {
            let value = row[start];
            let end = row[start..]
                .iter()
                .position(|&texel| texel != value)
                .map_or(width, |run| start + run);
            let inside = if start == 0 {
                start
            } else {
                (start + span).min(end)
            };
            let until = if end == width {
                end
            } else {
                end.saturating_sub(span).max(inside)
            };
            for (x, texel) in out[start..inside].iter_mut().enumerate() {
                *texel = window_mean(&row, start + x, span, &means);
            }
            out[inside..until].fill(value);
            for (x, texel) in out[until..end].iter_mut().enumerate() {
                *texel = window_mean(&row, until + x, span, &means);
            }
            start = end;
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
}

/// The second pass of [`blur_within_levels`], down the map, run a row at a time.
fn blur_down_within_levels(map: &mut ShadowMap, span: usize, levels: &LevelCache) {
    if span == 0 || map.width == 0 || map.height == 0 {
        return;
    }
    let joined = |a: Option<f64>, b: Option<f64>| matches!((a, b), (Some(a), Some(b)) if a == b);
    let (width, height) = (map.width as usize, map.height as usize);
    let per_tile = map.pixels_per_tile as usize;
    let keep = 2 * span + 1;
    let means = full_window_means(span);
    let mut ring = vec![vec![0u8; width]; keep];
    let mut sums = vec![0u32; width];
    let mut cut_above = vec![false; width];
    let (mut marked, mut loaded) = (usize::MAX, 0usize);
    let (mut held_from, mut held_to) = (0usize, usize::MAX);
    for y in 0..height {
        let (from, to) = (y.saturating_sub(span), (y + span).min(height - 1));
        if held_to == usize::MAX {
            sums[..width].fill(0);
        } else if from > held_from {
            let line = &ring[held_from % keep];
            for (sum, value) in sums.iter_mut().zip(line.iter()) {
                *sum -= u32::from(*value);
            }
        }
        while loaded <= to {
            ring[loaded % keep].copy_from_slice(&map.alpha[loaded * width..(loaded + 1) * width]);
            loaded += 1;
        }
        let first_new = if held_to == usize::MAX {
            from
        } else {
            held_to + 1
        };
        for source in first_new..=to {
            let line = &ring[source % keep];
            for (sum, value) in sums.iter_mut().zip(line.iter()) {
                *sum += u32::from(*value);
            }
        }
        (held_from, held_to) = (from, to);
        let rows = (to - from + 1) as u32;
        let out = &mut map.alpha[y * width..(y + 1) * width];
        if rows == keep as u32 {
            for (texel, sum) in out.iter_mut().zip(sums.iter()) {
                *texel = means[*sum as usize];
            }
        } else {
            for (texel, sum) in out.iter_mut().zip(sums.iter()) {
                *texel = (*sum / rows) as u8;
            }
        }
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
        let (kept_from, kept_to) = if y < edge {
            (from, edge - 1)
        } else {
            (edge, to)
        };
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

/// Every quotient a full window of the blur can come to, worked out once.
fn full_window_means(span: usize) -> Vec<u8> {
    let full = 2 * span + 1;
    (0..=255 * full).map(|sum| (sum / full) as u8).collect()
}

/// The mean of `line` over `at ± span`, with the ends clamped and `means` for a full window.
fn window_mean(line: &[u8], at: usize, span: usize, means: &[u8]) -> u8 {
    let from = at.saturating_sub(span);
    let to = (at + span).min(line.len() - 1);
    let total: u32 = line[from..=to].iter().map(|&value| u32::from(value)).sum();
    if to - from == 2 * span {
        means[total as usize]
    } else {
        (total / (to - from + 1) as u32) as u8
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
