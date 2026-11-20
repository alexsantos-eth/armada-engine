//! Where the world's settlements stand, how each one is cut into a grid of blocks and streets,
//! and which semantic zone owns each of their columns.

use std::collections::HashMap;

use super::catalog::{LayoutRules, SettlementCatalog, ZoneProfile, ZoneRole};
use crate::grid::{WorldCoord, WorldRect};
use crate::terrain::{TerrainGenerator, TerrainMaterial, derive_seed, noise::lattice_at};

/// Label for the stream that decides which candidate site hosts a settlement.
const SITE_LABEL: &str = "settlements-site";
/// Label for the stream that jitters a settlement off its site, along x.
const JITTER_X_LABEL: &str = "settlements-jitter-x";
/// Label for the stream that jitters a settlement off its site, along y.
const JITTER_Y_LABEL: &str = "settlements-jitter-y";
/// Label for the stream that sizes a settlement's grid, one lattice point per axis.
const SIZE_LABEL: &str = "settlements-size";
/// Label for the stream that trims the grid's corners.
const TRIM_LABEL: &str = "settlements-trim";
/// Label for the stream that decides whether a block on the camera's side is a park.
const FRONT_LABEL: &str = "settlements-front";
/// Label for the stream that deals a zone to every block.
const DEAL_LABEL: &str = "settlements-deal";
/// Label for the stream that counts the lots of a block and shuffles its slots.
const LOTS_LABEL: &str = "settlements-lots";
/// Label for the stream that bends a block out of the plain square.
const SHAPE_LABEL: &str = "settlements-shape";
/// Label for the stream that picks the street each side opens into the wild.
const EXIT_LABEL: &str = "settlements-exit";

/// One building plot: the column its building is anchored on, the zone that raises it and the
/// low corner of its block, which a uniform zone keys its single pick on. A lot always stands on
/// the rim of its block, beside a street, so its building needs no walkway of its own.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Lot {
    /// The column the building stands on.
    pub anchor: WorldCoord,
    /// The zone whose lot weights choose the building.
    pub zone: usize,
    /// The low corner of the block the lot belongs to.
    pub block: WorldCoord,
}

/// The outline of one block of the grid.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlockShape {
    /// The plain square.
    Square,
    /// The square less one corner square of half its side, handed to the street; `high_x`
    /// and `high_y` say which corner.
    Notched {
        /// Whether the notch is on the high `x` side.
        high_x: bool,
        /// Whether the notch is on the high `y` side.
        high_y: bool,
    },
    /// The square less one whole side row, handed to the street: the column at the low or high
    /// `x` edge when `along_x`, else the row at the low or high `y` edge.
    Shrunk {
        /// Whether the row lost is a column of fixed `x`.
        along_x: bool,
        /// Whether it is on the high side.
        high: bool,
    },
    /// The square plus the street towards its `+x` neighbour, which joins it as one block.
    MergedX,
    /// The square plus the street towards its `+y` neighbour, which joins it as one block.
    MergedY,
    /// The square cut in two by an alley through its middle: a column of fixed `x` when
    /// `along_x`, else a row of fixed `y`, joining the streets on either side.
    Split {
        /// Whether the alley is a column of fixed `x`.
        along_x: bool,
    },
}

/// Where one column falls along one axis of the grid.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Axis {
    /// On the street line that runs before block `line` (line `cols` closes the grid).
    Street(i32),
    /// Inside block `index`, at `offset` columns from its low side.
    Block(i32, i32),
}

/// One settlement of the world: a grid of square blocks cut by streets, each block dealt a zone,
/// with an open band around it and one street running out of every side. Derived from the seed
/// alone, so a chunk comes out the same whoever asks.
#[derive(Clone, Debug, PartialEq)]
pub struct Settlement {
    /// The column at the middle of the grid.
    pub center: WorldCoord,
    origin: WorldCoord,
    cols: i32,
    rows: i32,
    layout: LayoutRules,
    blocks: Vec<Option<usize>>,
    shapes: Vec<BlockShape>,
    lots: Vec<Lot>,
    exits: [i32; 4],
    edge: usize,
    street: usize,
    verge: Option<usize>,
}

impl Settlement {
    /// Blocks along x.
    pub fn cols(&self) -> i32 {
        self.cols
    }

    /// Blocks along y.
    pub fn rows(&self) -> i32 {
        self.rows
    }

    /// The grid with its outer streets, margins excluded.
    pub fn bounds(&self) -> WorldRect {
        let street = self.layout.street;
        let pitch = self.layout.pitch();
        WorldRect {
            min_x: self.origin.x - street,
            min_y: self.origin.y - street,
            max_x: self.origin.x + self.cols * pitch - 1,
            max_y: self.origin.y + self.rows * pitch - 1,
        }
    }

    /// The columns of block `(i, j)`, streets excluded.
    pub fn block_rect(&self, i: i32, j: i32) -> WorldRect {
        let pitch = self.layout.pitch();
        let min_x = self.origin.x + i * pitch;
        let min_y = self.origin.y + j * pitch;
        WorldRect {
            min_x,
            min_y,
            max_x: min_x + self.layout.block - 1,
            max_y: min_y + self.layout.block - 1,
        }
    }

    /// The zone dealt to block `(i, j)`, or `None` when it was trimmed or lies off the grid.
    pub fn block_zone(&self, i: i32, j: i32) -> Option<usize> {
        if i < 0 || j < 0 || i >= self.cols || j >= self.rows {
            return None;
        }
        self.blocks[(j * self.cols + i) as usize]
    }

    /// The outline of block `(i, j)`; a block off the grid or trimmed away is square.
    pub fn block_shape(&self, i: i32, j: i32) -> BlockShape {
        if i < 0 || j < 0 || i >= self.cols || j >= self.rows {
            return BlockShape::Square;
        }
        self.shapes[(j * self.cols + i) as usize]
    }

    /// Whether the cell at `(dx, dy)` from the low corner of block `(i, j)` was handed to the
    /// street by the block's notch or shrink.
    fn is_carved(&self, i: i32, j: i32, dx: i32, dy: i32) -> bool {
        let last = self.layout.block - 1;
        let half = self.layout.block / 2;
        match self.block_shape(i, j) {
            BlockShape::Notched { high_x, high_y } => {
                let near_x = if high_x { last - dx } else { dx };
                let near_y = if high_y { last - dy } else { dy };
                near_x < half && near_y < half
            }
            BlockShape::Shrunk { along_x, high } => {
                let at = if along_x { dx } else { dy };
                at == if high { last } else { 0 }
            }
            BlockShape::Split { along_x } => (if along_x { dx } else { dy }) == half,
            _ => false,
        }
    }

    /// The building plots of this settlement, block by block.
    pub fn lots(&self) -> &[Lot] {
        &self.lots
    }

    /// The index of the zone owning column `(x, y)`, or `None` when it lies outside the
    /// settlement. A block column right in front of a street (its `+x` or `+y` neighbour is
    /// one) belongs to the verge, when the content declares one, so nothing tall hides that
    /// street from the camera.
    pub fn zone_at(&self, x: i32, y: i32) -> Option<usize> {
        let zone = self.base_zone_at(x, y)?;
        let Some(verge) = self.verge else {
            return Some(zone);
        };
        if zone == self.street || zone == self.edge {
            return Some(zone);
        }
        let street = Some(self.street);
        if self.base_zone_at(x + 1, y) == street || self.base_zone_at(x, y + 1) == street {
            Some(verge)
        } else {
            Some(zone)
        }
    }

    /// The zone of column `(x, y)`, or `None` when it lies outside the
    /// settlement. Blocks own their columns, streets ring every block that stands, and the
    /// band around the grid and every trimmed corner are edge.
    fn base_zone_at(&self, x: i32, y: i32) -> Option<usize> {
        let bounds = self.bounds();
        let inside =
            x >= bounds.min_x && x <= bounds.max_x && y >= bounds.min_y && y <= bounds.max_y;
        if inside {
            let kept = |i: i32, j: i32| self.block_zone(i, j).is_some();
            return match (self.axis(x, self.origin.x), self.axis(y, self.origin.y)) {
                (Axis::Block(i, dx), Axis::Block(j, dy)) => match self.block_zone(i, j) {
                    Some(_) if self.is_carved(i, j, dx, dy) => Some(self.street),
                    Some(zone) => Some(zone),
                    None => Some(self.edge),
                },
                (Axis::Street(i), Axis::Block(j, _))
                    if self.block_shape(i - 1, j) == BlockShape::MergedX =>
                {
                    self.block_zone(i - 1, j)
                }
                (Axis::Block(i, _), Axis::Street(j))
                    if self.block_shape(i, j - 1) == BlockShape::MergedY =>
                {
                    self.block_zone(i, j - 1)
                }
                (Axis::Street(i), Axis::Block(j, _)) => {
                    Some(self.street_or_edge(kept(i - 1, j) || kept(i, j)))
                }
                (Axis::Block(i, _), Axis::Street(j)) => {
                    Some(self.street_or_edge(kept(i, j - 1) || kept(i, j)))
                }
                (Axis::Street(i), Axis::Street(j)) => Some(self.street_or_edge(
                    kept(i - 1, j - 1) || kept(i, j - 1) || kept(i - 1, j) || kept(i, j),
                )),
            };
        }
        if self.is_exit(x, y, bounds) {
            return Some(self.street);
        }
        let band = self.layout.edge;
        let near = x >= bounds.min_x - band
            && x <= bounds.max_x + band
            && y >= bounds.min_y - band
            && y <= bounds.max_y + band;
        near.then_some(self.edge)
    }

    fn street_or_edge(&self, street: bool) -> usize {
        if street { self.street } else { self.edge }
    }

    /// Where `value` falls along an axis whose first block starts at `origin`.
    fn axis(&self, value: i32, origin: i32) -> Axis {
        let street = self.layout.street;
        let shifted = value - origin + street;
        let index = shifted.div_euclid(self.layout.pitch());
        let offset = shifted.rem_euclid(self.layout.pitch());
        if offset < street {
            Axis::Street(index)
        } else {
            Axis::Block(index, offset - street)
        }
    }

    /// Whether `(x, y)`, outside the grid, lies on one of the four streets running into the wild.
    fn is_exit(&self, x: i32, y: i32, bounds: WorldRect) -> bool {
        let reach = self.layout.exit;
        let on_line =
            |value: i32, origin: i32, line: i32| self.axis(value, origin) == Axis::Street(line);
        let [low_x, high_x, low_y, high_y] = self.exits;
        let across_y = y >= bounds.min_y && y <= bounds.max_y;
        let across_x = x >= bounds.min_x && x <= bounds.max_x;
        (across_y
            && x < bounds.min_x
            && x >= bounds.min_x - reach
            && on_line(y, self.origin.y, low_x))
            || (across_y
                && x > bounds.max_x
                && x <= bounds.max_x + reach
                && on_line(y, self.origin.y, high_x))
            || (across_x
                && y < bounds.min_y
                && y >= bounds.min_y - reach
                && on_line(x, self.origin.x, low_y))
            || (across_x
                && y > bounds.max_y
                && y <= bounds.max_y + reach
                && on_line(x, self.origin.x, high_y))
    }
}

/// The settlements of a world: the field that lays them down and the blocks inside each one.
/// Shared, immutable and rebuilt from the seed, so a reopened save lays the same villages again.
#[derive(Clone, Debug)]
pub struct WorldSettlements {
    catalog: SettlementCatalog,
    site: u64,
    jitter_x: u64,
    jitter_y: u64,
    size: u64,
    trim: u64,
    front: u64,
    deal: u64,
    lots: u64,
    exit: u64,
    shape: u64,
    ground: Option<TerrainGenerator>,
}

impl WorldSettlements {
    /// Builds the settlement field for `catalog` in the world of `seed`.
    pub fn new(seed: u64, catalog: &SettlementCatalog) -> Self {
        Self {
            catalog: catalog.clone(),
            site: derive_seed(seed, SITE_LABEL),
            jitter_x: derive_seed(seed, JITTER_X_LABEL),
            jitter_y: derive_seed(seed, JITTER_Y_LABEL),
            size: derive_seed(seed, SIZE_LABEL),
            trim: derive_seed(seed, TRIM_LABEL),
            front: derive_seed(seed, FRONT_LABEL),
            deal: derive_seed(seed, DEAL_LABEL),
            lots: derive_seed(seed, LOTS_LABEL),
            exit: derive_seed(seed, EXIT_LABEL),
            shape: derive_seed(seed, SHAPE_LABEL),
            ground: None,
        }
    }

    /// The same field laid over the terrain `generator` raises: a block whose corners or middle
    /// are not land is trimmed away, and a site whose middle block is not land hosts nothing,
    /// so no village spreads its streets over a beach or a bay.
    pub fn on_ground(mut self, generator: TerrainGenerator) -> Self {
        self.ground = Some(generator);
        self
    }

    /// The content this field was built from.
    pub fn catalog(&self) -> &SettlementCatalog {
        &self.catalog
    }

    /// The settlement covering column `(x, y)`, or `None` out in the wild. Every settlement
    /// stays inside its own candidate cell, so only that cell's site is ever asked.
    pub fn settlement_at(&self, x: i32, y: i32) -> Option<Settlement> {
        self.settlement_reaching(x, y)
            .filter(|settlement| settlement.zone_at(x, y).is_some())
    }

    /// The index of the zone owning column `(x, y)`, or `None` out in the wild.
    pub fn zone_at(&self, x: i32, y: i32) -> Option<usize> {
        self.settlement_reaching(x, y)
            .and_then(|settlement| settlement.zone_at(x, y))
    }

    /// The settlement of the site of `(x, y)` when the column falls within its grid and
    /// margins; the frame is checked before the blocks, the ground and the lots are laid, so a
    /// column out in the wild costs a handful of rolls.
    fn settlement_reaching(&self, x: i32, y: i32) -> Option<Settlement> {
        let spacing = self.catalog.spacing;
        let (site_x, site_y) = (x.div_euclid(spacing), y.div_euclid(spacing));
        let (origin, cols, rows) = self.frame_of_site(site_x, site_y)?;
        let layout = self.catalog.layout;
        let margin = layout.margin();
        let reach_x = origin.x - layout.street - margin..origin.x + cols * layout.pitch() + margin;
        let reach_y = origin.y - layout.street - margin..origin.y + rows * layout.pitch() + margin;
        if !reach_x.contains(&x) || !reach_y.contains(&y) {
            return None;
        }
        self.settlement_of_site(site_x, site_y)
    }

    /// The id of the zone owning column `(x, y)`, or `None` out in the wild.
    pub fn zone_id_at(&self, x: i32, y: i32) -> Option<&str> {
        self.zone_at(x, y)
            .map(|zone| self.catalog.zones[zone].id.as_str())
    }

    /// The zone of every column of `coords`, in the same order. Resolves each candidate site
    /// once instead of once per column, which is what a chunk's placement pass wants: the
    /// answer is the one [`Self::zone_at`] gives, column by column.
    pub fn zones_over(&self, coords: &[WorldCoord]) -> Vec<Option<usize>> {
        let mut sites: HashMap<(i32, i32), Option<Settlement>> = HashMap::new();
        let spacing = self.catalog.spacing;
        coords
            .iter()
            .map(|coord| {
                let key = (coord.x.div_euclid(spacing), coord.y.div_euclid(spacing));
                sites
                    .entry(key)
                    .or_insert_with(|| self.settlement_of_site(key.0, key.1))
                    .as_ref()
                    .and_then(|settlement| settlement.zone_at(coord.x, coord.y))
            })
            .collect()
    }

    /// Whether each column of `coords` is a street or an exit, in the same order: what
    /// the road pass paves before anything is placed.
    pub fn streets_over(&self, coords: &[WorldCoord]) -> Vec<bool> {
        let street = Some(self.catalog.zone_of(ZoneRole::Street));
        self.zones_over(coords)
            .into_iter()
            .map(|zone| zone == street)
            .collect()
    }

    /// Whether each column of `coords` lies inside a block that stands (centre, residential,
    /// park or the verge on its rim), in the same order: the ground the placement pass turfs before it raises the lots.
    pub fn blocks_over(&self, coords: &[WorldCoord]) -> Vec<bool> {
        self.zones_over(coords)
            .into_iter()
            .map(|zone| {
                zone.is_some_and(|zone| {
                    matches!(
                        self.catalog.zones[zone].role,
                        ZoneRole::Center | ZoneRole::Residential | ZoneRole::Park | ZoneRole::Verge
                    )
                })
            })
            .collect()
    }

    /// Every lot whose anchor falls inside `area`, settlement by settlement in site order.
    pub fn lots_in(&self, area: WorldRect) -> Vec<Lot> {
        let spacing = self.catalog.spacing;
        let mut lots = Vec::new();
        for site_y in area.min_y.div_euclid(spacing)..=area.max_y.div_euclid(spacing) {
            for site_x in area.min_x.div_euclid(spacing)..=area.max_x.div_euclid(spacing) {
                let Some(settlement) = self.settlement_of_site(site_x, site_y) else {
                    continue;
                };
                lots.extend(settlement.lots.iter().copied().filter(|lot| {
                    lot.anchor.x >= area.min_x
                        && lot.anchor.x <= area.max_x
                        && lot.anchor.y >= area.min_y
                        && lot.anchor.y <= area.max_y
                }));
            }
        }
        lots
    }

    /// What grows on column `(x, y)`: its zone's profile, or the wilderness profile outside.
    pub fn profile_at(&self, x: i32, y: i32) -> &ZoneProfile {
        self.profile_of(self.zone_at(x, y))
    }

    /// What an already resolved zone grows; `None` is the wilderness outside every settlement.
    pub fn profile_of(&self, zone: Option<usize>) -> &ZoneProfile {
        match zone {
            Some(zone) => &self.catalog.zones[zone].profile,
            None => &self.catalog.wilderness,
        }
    }

    /// How thickly an already resolved zone grows its greenery; `0` plants none, and the
    /// wilderness outside every settlement grows none of its own (its woods are the biome's).
    pub fn greens_of(&self, zone: Option<usize>) -> f64 {
        match zone {
            Some(zone) => self.catalog.zones[zone].profile.greens,
            None => 0.0,
        }
    }

    /// The spacing the greenery of `zone` keeps at `distance` columns from the nearest
    /// building: tight where it hugs a wall, open out in the clearing, and a zone that grows
    /// more than the catalogue's share tightens both ends of that range.
    pub fn greens_spacing(&self, zone: Option<usize>, distance: f64) -> Option<f64> {
        let density = self.greens_of(zone);
        if density <= 0.0 {
            return None;
        }
        let rules = &self.catalog.greens;
        let reach = (rules.far - rules.near).max(f64::EPSILON);
        let share = ((distance - rules.near) / reach).clamp(0.0, 1.0);
        let spacing = rules.tight + (rules.spacing - rules.tight) * share;
        Some((spacing / density).max(1.0))
    }

    /// Where the grid of the site `(site_x, site_y)` starts and how many blocks it spans along
    /// each axis, when the site hosts a settlement at all.
    fn frame_of_site(&self, site_x: i32, site_y: i32) -> Option<(WorldCoord, i32, i32)> {
        let key = (i64::from(site_x), i64::from(site_y));
        if lattice_at(self.site, key.0, key.1) >= self.catalog.chance {
            return None;
        }
        let layout = self.catalog.layout;
        let count = |offset: i64| {
            let choices = layout.blocks_max - layout.blocks_min + 1;
            layout.blocks_min
                + ((lattice_at(self.size, key.0 * 2 + offset, key.1) * f64::from(choices)).floor()
                    as i32)
                    .min(choices - 1)
        };
        let span = (self.catalog.spacing - layout.max_extent()).max(1);
        let jitter = |stream: u64| {
            ((lattice_at(stream, key.0, key.1) * f64::from(span)).floor() as i32).min(span - 1)
        };
        let lead = layout.margin() + layout.street;
        let origin = WorldCoord {
            x: site_x * self.catalog.spacing + lead + jitter(self.jitter_x),
            y: site_y * self.catalog.spacing + lead + jitter(self.jitter_y),
        };
        Some((origin, count(0), count(1)))
    }

    /// The settlement the candidate site `(site_x, site_y)` hosts, when it hosts one.
    fn settlement_of_site(&self, site_x: i32, site_y: i32) -> Option<Settlement> {
        let (origin, cols, rows) = self.frame_of_site(site_x, site_y)?;
        let layout = self.catalog.layout;
        let key = (i64::from(site_x), i64::from(site_y));
        let mut settlement = Settlement {
            center: WorldCoord {
                x: origin.x + (cols * layout.pitch() - layout.street) / 2,
                y: origin.y + (rows * layout.pitch() - layout.street) / 2,
            },
            origin,
            cols,
            rows,
            layout,
            blocks: Vec::with_capacity((cols * rows) as usize),
            shapes: vec![BlockShape::Square; (cols * rows) as usize],
            lots: Vec::new(),
            exits: [0; 4],
            edge: self.catalog.zone_of(ZoneRole::Edge),
            street: self.catalog.zone_of(ZoneRole::Street),
            verge: self.catalog.verge(),
        };
        for j in 0..rows {
            for i in 0..cols {
                let zone = self
                    .deal_block(&settlement, i, j)
                    .filter(|_| self.is_land(settlement.block_rect(i, j)));
                settlement.blocks.push(zone);
            }
        }
        settlement.block_zone(cols / 2, rows / 2)?;
        self.shape_blocks(&mut settlement);
        for j in 0..rows {
            for i in 0..cols {
                self.lay_lots(&mut settlement, i, j);
            }
        }
        settlement.exits = [
            self.exit_line(rows, key, 0),
            self.exit_line(rows, key, 1),
            self.exit_line(cols, key, 2),
            self.exit_line(cols, key, 3),
        ];
        Some(settlement)
    }

    /// Whether the corners and the middle of `rect` stand on land, or there is no ground to ask.
    fn is_land(&self, rect: WorldRect) -> bool {
        let Some(generator) = &self.ground else {
            return true;
        };
        [
            (rect.min_x, rect.min_y),
            (rect.max_x, rect.min_y),
            (rect.min_x, rect.max_y),
            (rect.max_x, rect.max_y),
            ((rect.min_x + rect.max_x) / 2, (rect.min_y + rect.max_y) / 2),
        ]
        .into_iter()
        .all(|(x, y)| {
            matches!(
                generator.column_at(WorldCoord { x, y }).surface,
                TerrainMaterial::Grass | TerrainMaterial::Ground
            )
        })
    }

    /// The zone block `(i, j)` is dealt, or `None` when the grid trims it away.
    fn deal_block(&self, settlement: &Settlement, i: i32, j: i32) -> Option<usize> {
        let (cols, rows) = (settlement.cols, settlement.rows);
        let rect = settlement.block_rect(i, j);
        let key = (i64::from(rect.min_x), i64::from(rect.min_y));
        if (i, j) == (cols / 2, rows / 2) {
            return Some(self.catalog.zone_of(ZoneRole::Center));
        }
        let corner = (i == 0 || i == cols - 1) && (j == 0 || j == rows - 1);
        if corner
            && cols >= 3
            && rows >= 3
            && lattice_at(self.trim, key.0, key.1) < self.catalog.layout.trim
        {
            return None;
        }
        let front = i == 0 || j == 0;
        let parks_only =
            front && lattice_at(self.front, key.0, key.1) < self.catalog.layout.front_park;
        let candidates: Vec<(usize, f64)> = self
            .catalog
            .zones
            .iter()
            .enumerate()
            .filter(|(_, zone)| match zone.role {
                ZoneRole::Park => true,
                ZoneRole::Residential => !parks_only,
                _ => false,
            })
            .map(|(index, zone)| (index, zone.share))
            .collect();
        let total: f64 = candidates.iter().map(|(_, share)| share).sum();
        if total <= 0.0 {
            return candidates.first().map(|(index, _)| *index);
        }
        let mut roll = lattice_at(self.deal, key.0, key.1) * total;
        for (index, share) in &candidates {
            if roll < *share {
                return Some(*index);
            }
            roll -= share;
        }
        candidates.last().map(|(index, _)| *index)
    }

    /// Bends blocks out of the plain square, row by row: each one that is neither the centre
    /// nor already part of a merge rolls whether it is notched, shrunk or merged with its `+x` or
    /// `+y` neighbour, which then takes its zone and stays square.
    fn shape_blocks(&self, settlement: &mut Settlement) {
        let shares = settlement.layout.shapes;
        let (cols, rows) = (settlement.cols, settlement.rows);
        let centre = (cols / 2, rows / 2);
        let mut locked = vec![false; (cols * rows) as usize];
        let index = |i: i32, j: i32| (j * cols + i) as usize;
        for j in 0..rows {
            for i in 0..cols {
                if (i, j) == centre || locked[index(i, j)] || settlement.block_zone(i, j).is_none()
                {
                    continue;
                }
                let rect = settlement.block_rect(i, j);
                let key = (i64::from(rect.min_x), i64::from(rect.min_y));
                let roll = lattice_at(self.shape, key.0, key.1);
                let pick = lattice_at(self.shape, key.0 + 7, key.1 + 13);
                let shape = if roll < shares.notch {
                    BlockShape::Notched {
                        high_x: pick < 0.5,
                        high_y: (pick * 4.0).fract() < 0.5,
                    }
                } else if roll < shares.notch + shares.shrink {
                    BlockShape::Shrunk {
                        along_x: pick < 0.5,
                        high: (pick * 4.0).fract() < 0.5,
                    }
                } else if roll < shares.notch + shares.shrink + shares.merge {
                    let free = |ni: i32, nj: i32| {
                        ni < cols
                            && nj < rows
                            && (ni, nj) != centre
                            && !locked[index(ni, nj)]
                            && settlement.block_zone(ni, nj).is_some()
                    };
                    let order = if pick < 0.5 {
                        [
                            (BlockShape::MergedX, (i + 1, j)),
                            (BlockShape::MergedY, (i, j + 1)),
                        ]
                    } else {
                        [
                            (BlockShape::MergedY, (i, j + 1)),
                            (BlockShape::MergedX, (i + 1, j)),
                        ]
                    };
                    match order.into_iter().find(|(_, (ni, nj))| free(*ni, *nj)) {
                        Some((shape, (ni, nj))) => {
                            locked[index(ni, nj)] = true;
                            settlement.blocks[index(ni, nj)] = settlement.blocks[index(i, j)];
                            shape
                        }
                        None => BlockShape::Square,
                    }
                } else if roll < shares.notch + shares.shrink + shares.merge + shares.split {
                    BlockShape::Split {
                        along_x: pick < 0.5,
                    }
                } else {
                    BlockShape::Square
                };
                settlement.shapes[index(i, j)] = shape;
            }
        }
    }

    /// Lays the lots of block `(i, j)`: a park takes every cell of its zone on one colour of the
    /// checkerboard, so it grows thick; any other block takes between `lots.min` and `lots.max`
    /// of the cells of its outline that touch a street, on one colour of a checkerboard over the whole world so no
    /// two lots ever touch, shuffled per block; a block with any such cell raises at least one.
    fn lay_lots(&self, settlement: &mut Settlement, i: i32, j: i32) {
        let Some(zone) = settlement.block_zone(i, j) else {
            return;
        };
        let layout = settlement.layout;
        if layout.lots_max == 0 {
            return;
        }
        let rect = settlement.block_rect(i, j);
        let block = WorldCoord {
            x: rect.min_x,
            y: rect.min_y,
        };
        let mut cells: Vec<WorldCoord> = (rect.min_y..=rect.max_y)
            .flat_map(|y| (rect.min_x..=rect.max_x).map(move |x| WorldCoord { x, y }))
            .collect();
        match settlement.block_shape(i, j) {
            BlockShape::MergedX => cells.extend((rect.min_y..=rect.max_y).map(|y| WorldCoord {
                x: rect.max_x + 1,
                y,
            })),
            BlockShape::MergedY => cells.extend((rect.min_x..=rect.max_x).map(|x| WorldCoord {
                x,
                y: rect.max_y + 1,
            })),
            _ => {}
        }
        let street = Some(settlement.street);
        let park = self.catalog.zones[zone].role == ZoneRole::Park;
        let mut slots: Vec<WorldCoord> = cells
            .into_iter()
            .filter(|cell| (cell.x + cell.y).rem_euclid(2) == 0)
            .filter(|cell| settlement.zone_at(cell.x, cell.y) == Some(zone))
            .filter(|cell| {
                park || [(1, 0), (-1, 0), (0, 1), (0, -1)]
                    .into_iter()
                    .any(|(dx, dy)| settlement.zone_at(cell.x + dx, cell.y + dy) == street)
            })
            .collect();
        slots.sort_by_cached_key(|cell| {
            lattice_at(self.lots, i64::from(cell.x) * 3 + 1, i64::from(cell.y)).to_bits()
        });
        let choices = layout.lots_max - layout.lots_min + 1;
        let count = layout.lots_min
            + ((lattice_at(self.lots, i64::from(block.x), i64::from(block.y)) * f64::from(choices))
                .floor() as u32)
                .min(choices - 1);
        let count = if park {
            slots.len()
        } else {
            (count.max(1) as usize).min(slots.len())
        };
        for anchor in slots.into_iter().take(count) {
            settlement.lots.push(Lot {
                anchor,
                zone,
                block,
            });
        }
    }

    /// The street line one side of the grid opens into the wild: an inner line when there is
    /// one, so the exit never leaves from a corner a trim may take away.
    fn exit_line(&self, blocks: i32, key: (i64, i64), side: i64) -> i32 {
        let roll = lattice_at(self.exit, key.0 * 4 + side, key.1);
        if blocks >= 2 {
            1 + ((roll * f64::from(blocks - 1)).floor() as i32).min(blocks - 2)
        } else {
            i32::from(roll >= 0.5)
        }
    }
}

#[cfg(test)]
#[path = "field.test.rs"]
mod tests;
