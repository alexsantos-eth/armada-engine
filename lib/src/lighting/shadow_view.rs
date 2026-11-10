//! Baked shadows for the selectable light phase: the client half of [`iso::lighting`].

use super::shadow_view_atlas;
use super::shadow_view_atlas::{ShadowAtlas, atlas_uv, square_in_slot};
use super::shadow_view_masks::SilhouetteMasks;
use iso::assets::{InkBox, SpriteLayout};
use iso::entities::Entity;
use iso::grid::{CHUNK_SIZE, ChunkCoord, WorldCoord, to_chunk_coord};
use iso::lighting::{
    BakePhase, BoxMetrics, GroundBake, HeightField, MapArea, PhaseLight, SHADE_COLUMNS, SHADE_ROWS,
    SHADOW_MAP_PIXELS_PER_TILE, ShadeGrid, ShadeLatticeSpec, ShadowCaster, ShadowMap, ShadowPoint,
    ShadowReceiver, SpriteExtent, TerrainFace, shade_grid, shaded_at, terrain_faces,
};
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use iso::terrain::TerrainColumn;
use iso::world::ChunkManager;
use macroquad::prelude::{get_time, screen_height, screen_width};
use std::collections::HashMap;
use std::rc::Rc;

use crate::assets::sprites::{ShadeLattice, SpriteDraw, ground_key};
use crate::game::config::PHASE_TRANSITION_SECONDS;

/// How long a frame may spend baking shadows.
pub const BAKE_BUDGET_MS: f64 = 3.0;

/// How far along the ease-in a chunk is, in `[0, 1]`: zero when its bake lands, one later.
fn fade_of(elapsed: f32) -> f32 {
    let t = (elapsed / PHASE_TRANSITION_SECONDS).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Columns whose lattice is read off the map in one piece of work.
const GROUND_SHADE_COLUMNS: usize = 128;

/// Ground shadows draw over the terrain of their own column and under anything standing on it.
pub const GROUND_SHADOW_LAYER: i32 = 1;

/// Quads across an exposed vertical face of ground, and down it, for the shadow on it.
const FACE_SHADE_STEPS: u32 = 3;

/// How far down a column's exposed side a shadow is worked out, in blocks.
pub const FACE_FLOOR: f64 = 10.0;

/// Corners across an entity's artwork, and down it, for the shadows it receives.
pub const ENTITY_SHADE_COLUMNS: u32 = 6;
pub const ENTITY_SHADE_ROWS: u32 = 10;

/// What one shown chunk's shadows amount to.
struct Baked {
    /// Whether each column's top face carries any coverage at all, indexed as the chunk's own
    ground: Vec<bool>,
    /// The shadows falling on the chunk's own entities, by the cell each one stands on.
    shaded: HashMap<(i32, i32), ShadeGrid>,
    /// The chunk's own entities as casters, for its neighbours' bakes and for the player.
    casters: Vec<ShadowCaster>,
    /// The shadow on each of the chunk's exposed vertical faces, as coverage at its corners.
    faces: Vec<(TerrainFace, Rc<ShadeLattice>)>,
    /// Which of the nine chunks around it (itself included) were loaded when it was baked.
    baked_against: u16,
    /// Seconds since this chunk's bake landed; its shadows ease in as it grows.
    born: f32,
}

/// The baked shadows of every shown chunk.
pub struct ShadowScene {
    phase: BakePhase,
    light: PhaseLight,
    masks: SilhouetteMasks,
    chunks: HashMap<ChunkCoord, Baked>,
    /// One map, reused by every bake: it is over a megabyte of texels and only one chunk bakes
    scratch: ShadowMap,
    /// The maps of the shown chunks, on the GPU: the texture the scene's material samples.
    atlas: ShadowAtlas,
    working: Option<Pending>,
    tile_width: f64,
    box_height: f64,
}

/// A chunk's bake, part way through.
struct Pending {
    coord: ChunkCoord,
    /// The neighbours it is being baked against. If that changes under it, it starts again.
    against: u16,
    /// The chunk's own entities as casters, kept for the [`Baked`] it becomes.
    own: Vec<ShadowCaster>,
    /// Those of the chunk and of its eight neighbours, which is what the map is laid from.
    casters: Vec<ShadowCaster>,
    ground: HeightField,
    map: GroundBake,
    shade: Vec<bool>,
    shaded: HashMap<(i32, i32), ShadeGrid>,
    faces: Vec<(TerrainFace, Rc<ShadeLattice>)>,
    stage: Reading,
}

/// What a [`Pending`] does next once its map is laid.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Reading {
    /// Laying the map itself, caster by caster.
    Map,
    /// Sending the laid map to the chunk's slot of the shadow atlas.
    Upload,
    /// Reading back which columns carry any coverage, from this one on.
    Ground(usize),
    Entities,
    Faces,
}

impl ShadowScene {
    /// An empty scene for `phase`, sampling `masks`.
    pub fn new(
        phase: BakePhase,
        masks: SilhouetteMasks,
        atlas: ShadowAtlas,
        tile_width: f64,
        box_height: f64,
    ) -> Self {
        Self {
            phase,
            light: phase.light(),
            masks,
            chunks: HashMap::new(),
            scratch: ShadowMap::new(
                MapArea::around(0, 0, CHUNK_SIZE - 1, CHUNK_SIZE - 1),
                SHADOW_MAP_PIXELS_PER_TILE,
            ),
            atlas,
            working: None,
            tile_width,
            box_height,
        }
    }

    /// The phase used by the current bake.
    pub fn phase(&self) -> BakePhase {
        self.phase
    }

    /// How far in a chunk's shadows have eased, `0.0` straight after its bake lands. Chunks the
    /// scene does not hold yet report `0.0`.
    pub fn chunk_fade(&self, coord: ChunkCoord) -> f32 {
        self.chunks
            .get(&coord)
            .map_or(0.0, |baked| fade_of(baked.born))
    }

    /// Selects a phase and discards every map derived from the previous light.
    pub fn set_phase(&mut self, phase: BakePhase) {
        if self.phase == phase {
            return;
        }
        self.phase = phase;
        self.light = phase.light();
        if let Some(job) = self.working.take() {
            self.atlas.release(job.coord);
        }
        for coord in self.chunks.keys().copied().collect::<Vec<_>>() {
            self.atlas.release(coord);
        }
        self.chunks.clear();
    }

    /// Spends up to [`BAKE_BUDGET_MS`] bringing the bake up to date for `shown`, forgets what the
    /// stream no longer holds, and eases the freshly baked chunks in with `dt_seconds` of real
    /// time.
    pub fn update(&mut self, manager: &ChunkManager, shown: &[ChunkCoord], dt_seconds: f32) {
        let dropped: Vec<ChunkCoord> = self
            .chunks
            .keys()
            .copied()
            .filter(|coord| !manager.is_discovered(*coord))
            .collect();
        for coord in dropped {
            self.chunks.remove(&coord);
            self.atlas.release(coord);
        }
        let step = dt_seconds.max(0.0);
        for baked in self.chunks.values_mut() {
            baked.born = (baked.born + step).min(PHASE_TRANSITION_SECONDS);
        }
        debug_assert!(
            shown.len() <= shadow_view_atlas::SLOT_COUNT,
            "{} chunks shown against {} shadow slots: the atlas will thrash",
            shown.len(),
            shadow_view_atlas::SLOT_COUNT
        );
        for coord in shown {
            self.atlas.touch(*coord);
        }
        if let Some(job) = &self.working {
            let stale = !manager.is_discovered(job.coord)
                || neighbours_loaded(manager, job.coord) != job.against;
            if stale {
                self.working = None;
            }
        }
        let until = get_time() + BAKE_BUDGET_MS / 1000.0;
        loop {
            if self.working.is_none() {
                let Some(coord) = self.next_to_bake(manager, shown) else {
                    return;
                };
                self.start(manager, coord);
            }
            if self.advance(manager) {
                let Some(job) = self.working.take() else {
                    return;
                };
                let Pending {
                    coord,
                    against,
                    own,
                    shade,
                    shaded,
                    faces,
                    ..
                } = job;
                self.chunks.insert(
                    coord,
                    Baked {
                        ground: shade,
                        shaded,
                        casters: own,
                        faces,
                        baked_against: against,
                        born: 0.0,
                    },
                );
            }
            if get_time() >= until {
                return;
            }
        }
    }

    /// The chunk most worth baking next: one that has no shadows at all before one that has
    fn next_to_bake(&self, manager: &ChunkManager, shown: &[ChunkCoord]) -> Option<ChunkCoord> {
        let mut first_time = None;
        let mut again = None;
        for coord in shown.iter().filter(|coord| manager.is_visible(**coord)) {
            match self.chunks.get(coord) {
                Some(baked)
                    if baked.baked_against == neighbours_loaded(manager, *coord)
                        && self.atlas.holds(*coord) => {}
                Some(_) => again = again.or(Some(*coord)),
                None => {
                    first_time = Some(*coord);
                    break;
                }
            }
        }
        first_time.or(again)
    }

    /// Does one piece of the job in hand, and says whether that was the last of it.
    fn advance(&mut self, manager: &ChunkManager) -> bool {
        let Some(mut job) = self.working.take() else {
            return false;
        };
        let mut finished = false;
        match job.stage {
            Reading::Map => {
                let masks = &self.masks;
                let more = job.map.step(
                    &mut self.scratch,
                    &job.casters,
                    Some(&job.ground),
                    &self.light.shadow,
                    BoxMetrics {
                        tile_width: self.tile_width,
                        box_height: self.box_height,
                    },
                    &|index| masks.silhouette_of(index),
                );
                if !more {
                    job.stage = Reading::Upload;
                }
            }
            Reading::Upload => {
                if let Some(turned_out) = self.atlas.put(job.coord, &self.scratch) {
                    self.chunks.remove(&turned_out);
                }
                job.stage = Reading::Ground(0);
            }
            Reading::Ground(from) => {
                let done = self.ground_cover(
                    manager,
                    job.coord,
                    from,
                    GROUND_SHADE_COLUMNS,
                    &mut job.shade,
                );
                job.stage = if done == 0 {
                    Reading::Entities
                } else {
                    Reading::Ground(from + done)
                };
            }
            Reading::Entities => {
                job.shaded = self.shade_entities(manager, job.coord, &job.casters, &job.ground);
                job.stage = Reading::Faces;
            }
            Reading::Faces => {
                job.faces = self.shade_faces(manager, job.coord, &job.casters, &job.ground);
                finished = true;
            }
        }
        self.working = Some(job);
        finished
    }

    /// Opens a bake of `coord`, up to the point where there is a map to lay into.
    fn start(&mut self, manager: &ChunkManager, coord: ChunkCoord) {
        let min_x = coord.cx * CHUNK_SIZE;
        let min_y = coord.cy * CHUNK_SIZE;
        let area = MapArea::around(min_x, min_y, min_x + CHUNK_SIZE - 1, min_y + CHUNK_SIZE - 1);
        let own = self.casters_of(manager, coord);
        let mut casters = own.clone();
        for other in around(coord) {
            if other == coord {
                continue;
            }
            match self.chunks.get(&other) {
                Some(baked) => casters.extend_from_slice(&baked.casters),
                None => casters.extend(self.casters_of(manager, other)),
            }
        }

        self.scratch.move_to(area);
        let level_at = |x: i32, y: i32| manager.column_at(x, y).map(|c| f64::from(c.elevation));
        let ground = Self::ground_field(manager, area.min_x, area.min_y, area.max_x, area.max_y);
        let map = GroundBake::new(&self.scratch, &level_at);
        let columns = manager
            .terrain_chunk(coord)
            .map_or(0, <[TerrainColumn]>::len);
        self.working = Some(Pending {
            coord,
            against: neighbours_loaded(manager, coord),
            own,
            casters,
            ground,
            map,
            shade: Vec::with_capacity(columns),
            shaded: HashMap::new(),
            faces: Vec::new(),
            stage: Reading::Map,
        });
    }

    fn ground_field(
        manager: &ChunkManager,
        min_x: i32,
        min_y: i32,
        max_x: i32,
        max_y: i32,
    ) -> HeightField {
        HeightField::new(min_x, min_y, max_x, max_y, |x, y| {
            manager.column_at(x, y).map(|c| f64::from(c.elevation))
        })
    }

    /// Reads back which of `count` columns from `from` carry any coverage at all, appends the
    fn ground_cover(
        &self,
        manager: &ChunkManager,
        coord: ChunkCoord,
        from: usize,
        count: usize,
        out: &mut Vec<bool>,
    ) -> usize {
        let columns = manager
            .terrain_chunk(coord)
            .map_or(0, <[TerrainColumn]>::len);
        let Some(chunk) = manager
            .terrain_chunk(coord)
            .filter(|_| !self.scratch.is_empty())
        else {
            let blank = columns.saturating_sub(from).min(count);
            out.extend(std::iter::repeat_n(false, blank));
            return blank;
        };
        let per_tile = self.scratch.pixels_per_tile;
        let width = self.scratch.width;
        let mut done = 0;
        for column in chunk.iter().skip(from).take(count) {
            done += 1;
            let Some((from_x, from_y)) = self.scratch.square_of(column.coord.x, column.coord.y)
            else {
                out.push(false);
                continue;
            };
            let any = (from_y..from_y + per_tile).any(|y| {
                let row = (y * width) as usize;
                self.scratch.alpha[row + from_x as usize..row + (from_x + per_tile) as usize]
                    .iter()
                    .any(|&texel| texel > 0)
            });
            out.push(any);
        }
        done
    }

    /// The chunk's entities as casters, in the drawing's own measurements.
    fn casters_of(&self, manager: &ChunkManager, coord: ChunkCoord) -> Vec<ShadowCaster> {
        let Some(entities) = manager.entities_chunk(coord) else {
            return Vec::new();
        };
        entities
            .iter()
            .filter_map(|entity| self.caster_of(entity))
            .collect()
    }

    /// One entity as a caster, or `None` when the atlas has no measured artwork for it.
    fn caster_of(&self, entity: &Entity) -> Option<ShadowCaster> {
        let silhouette = self.masks.index_of(entity.texture_source())?;
        Some(ShadowCaster {
            foot: (f64::from(entity.x()) + 0.5, f64::from(entity.y()) + 0.5),
            elevation: f64::from(entity.elevation()),
            extent: self.extent_of(entity)?,
            silhouette,
        })
    }

    /// Where an entity's artwork is drawn around the ground point it stands on.
    fn extent_of(&self, entity: &Entity) -> Option<SpriteExtent> {
        let ink = self.masks.ink_of(entity.texture_source())?;
        Some(extent_of_ink(ink, self.tile_width))
    }

    /// The lattices of the chunk's own entities, for the ones something shades.
    fn shade_entities(
        &self,
        manager: &ChunkManager,
        coord: ChunkCoord,
        casters: &[ShadowCaster],
        ground: &HeightField,
    ) -> HashMap<(i32, i32), ShadeGrid> {
        let Some(entities) = manager.entities_chunk(coord) else {
            return HashMap::new();
        };
        let masks = &self.masks;
        let mut shaded = HashMap::new();
        for entity in entities {
            let Some(extent) = self.extent_of(entity) else {
                continue;
            };
            let receiver = ShadowReceiver {
                foot: (f64::from(entity.x()) + 0.5, f64::from(entity.y()) + 0.5),
                elevation: f64::from(entity.elevation()),
                extent,
            };
            let others: Vec<ShadowCaster> = casters
                .iter()
                .copied()
                .filter(|caster| caster.foot != receiver.foot)
                .collect();
            if let Some(grid) = shade_grid(
                &receiver,
                &others,
                &self.light.shadow,
                BoxMetrics {
                    tile_width: self.tile_width,
                    box_height: self.box_height,
                },
                &|index| masks.silhouette_of(index),
                Some(ground),
                ShadeLatticeSpec {
                    opacity: self.light.opacity(),
                    columns: ENTITY_SHADE_COLUMNS,
                    rows: ENTITY_SHADE_ROWS,
                },
            ) {
                shaded.insert((entity.x(), entity.y()), grid);
            }
        }
        shaded
    }

    /// The shadow on each exposed vertical face of the chunk's ground.
    fn shade_faces(
        &self,
        manager: &ChunkManager,
        coord: ChunkCoord,
        casters: &[ShadowCaster],
        ground: &HeightField,
    ) -> Vec<(TerrainFace, Rc<ShadeLattice>)> {
        let Some(columns) = manager.terrain_chunk(coord) else {
            return Vec::new();
        };
        let level_at = |x: i32, y: i32| manager.column_at(x, y).map(|c| f64::from(c.elevation));
        let walls = terrain_faces(
            columns
                .iter()
                .map(|c| (c.coord.x, c.coord.y, f64::from(c.elevation), c.surface)),
            level_at,
            FACE_FLOOR,
        );
        let masks = &self.masks;
        let mut shaded = Vec::new();
        for face in walls {
            let mut grid =
                Vec::with_capacity(((FACE_SHADE_STEPS + 1) * (FACE_SHADE_STEPS + 1)) as usize);
            let mut any = false;
            for row in 0..=FACE_SHADE_STEPS {
                let down = f64::from(row) / f64::from(FACE_SHADE_STEPS);
                for column in 0..=FACE_SHADE_STEPS {
                    let along = f64::from(column) / f64::from(FACE_SHADE_STEPS);
                    let (x, y, elevation) = face.point(along, down);
                    let coverage = shaded_at(
                        ShadowPoint { x, y, elevation },
                        casters,
                        &self.light.shadow,
                        self.tile_width,
                        self.box_height,
                        &|index| masks.silhouette_of(index),
                        Some(ground),
                    );
                    any |= coverage > 0.0;
                    grid.push(coverage as f32);
                }
            }
            if any {
                shaded.push((
                    face,
                    Rc::new(ShadeLattice::from_coverage(
                        FACE_SHADE_STEPS,
                        FACE_SHADE_STEPS,
                        grid,
                    )),
                ));
            }
        }
        shaded
    }

    /// Queues the shadow on every exposed vertical face of `coord`'s ground.
    pub fn collect_faces(
        &self,
        coord: ChunkCoord,
        projection: ProjectionConfig,
        out: &mut Vec<SpriteDraw>,
    ) {
        let Some(baked) = self.chunks.get(&coord) else {
            return;
        };
        let opacity = (self.light.opacity() * f64::from(fade_of(baked.born))) as f32;
        let (screen_w, screen_h) = (f64::from(screen_width()), f64::from(screen_height()));
        for (face, shade) in &baked.faces {
            let corner = |along: f64, down: f64| {
                let (x, y, level) = face.point(along, down);
                let point = project_block(GridPoint { x, y }, level, projection);
                (point.screen_x, point.screen_y)
            };
            let corners = [
                corner(0.0, 0.0),
                corner(1.0, 0.0),
                corner(1.0, 1.0),
                corner(0.0, 1.0),
            ];
            let left = corners.iter().fold(f64::INFINITY, |l, c| l.min(c.0));
            let right = corners.iter().fold(f64::NEG_INFINITY, |r, c| r.max(c.0));
            let top = corners.iter().fold(f64::INFINITY, |t, c| t.min(c.1));
            let bottom = corners.iter().fold(f64::NEG_INFINITY, |b, c| b.max(c.1));
            if right < 0.0 || left > screen_w || bottom < 0.0 || top > screen_h {
                continue;
            }
            out.push(SpriteDraw::face_shadow(
                ground_key(
                    f64::from(face.x) + 0.5,
                    f64::from(face.y) + 0.5,
                    face.top,
                    GROUND_SHADOW_LAYER,
                    projection.tile_height,
                ),
                corners,
                Rc::clone(shade),
                opacity,
            ));
        }
    }

    /// The shadows falling on the entity standing at `cell`, if any were baked.
    pub fn shade_of(&self, coord: ChunkCoord, cell: (i32, i32)) -> Option<&ShadeGrid> {
        self.chunks.get(&coord)?.shaded.get(&cell)
    }

    /// The shadows falling on something standing where the player is, sampled now.
    pub fn shade_moving(
        &self,
        manager: &ChunkManager,
        receiver: &ShadowReceiver,
    ) -> Option<ShadeGrid> {
        let cell = WorldCoord {
            x: receiver.foot.0.floor() as i32,
            y: receiver.foot.1.floor() as i32,
        };
        let home = to_chunk_coord(cell);
        let ground = Self::ground_field(manager, cell.x, cell.y, cell.x, cell.y);
        let casters: Vec<ShadowCaster> = around(home)
            .into_iter()
            .filter_map(|coord| self.chunks.get(&coord))
            .flat_map(|baked| baked.casters.iter().copied())
            .collect();
        let masks = &self.masks;
        shade_grid(
            receiver,
            &casters,
            &self.light.shadow,
            BoxMetrics {
                tile_width: self.tile_width,
                box_height: self.box_height,
            },
            &|index| masks.silhouette_of(index),
            Some(&ground),
            ShadeLatticeSpec {
                opacity: self.light.opacity(),
                columns: SHADE_COLUMNS,
                rows: SHADE_ROWS,
            },
        )
    }

    /// Queues the ground shadow of every shaded column of `chunk`, to be sorted and drawn with
    pub fn collect_ground(
        &self,
        coord: ChunkCoord,
        columns: &[TerrainColumn],
        projection: ProjectionConfig,
        out: &mut Vec<SpriteDraw>,
    ) {
        let Some(baked) = self.chunks.get(&coord) else {
            return;
        };
        let Some(slot) = self.atlas.slot_of(coord) else {
            return;
        };
        let opacity = (self.light.opacity() * f64::from(fade_of(baked.born))) as f32;
        let (screen_w, screen_h) = (f64::from(screen_width()), f64::from(screen_height()));
        let half_tile = projection.tile_width / 2.0;
        let per_tile = f64::from(SHADOW_MAP_PIXELS_PER_TILE);
        let (near, far) = (0.5, per_tile - 0.5);
        for (index, column) in columns.iter().enumerate() {
            if !baked.ground.get(index).copied().unwrap_or(false) {
                continue;
            }
            let Some((square_x, square_y)) = square_in_slot(coord, column.coord.x, column.coord.y)
            else {
                continue;
            };
            let level = f64::from(column.elevation);
            let corner = |dx: f64, dy: f64| {
                let point = project_block(
                    GridPoint {
                        x: f64::from(column.coord.x) + dx,
                        y: f64::from(column.coord.y) + dy,
                    },
                    level,
                    projection,
                );
                (point.screen_x, point.screen_y)
            };
            let corners = [
                corner(0.0, 0.0),
                corner(1.0, 0.0),
                corner(1.0, 1.0),
                corner(0.0, 1.0),
            ];
            if corners[0].0 + half_tile < 0.0
                || corners[0].0 - half_tile > screen_w
                || corners[0].1 < 0.0
                || corners[2].1 > screen_h
            {
                continue;
            }
            let texel = |dx: f64, dy: f64| {
                atlas_uv(slot, (f64::from(square_x) + dx, f64::from(square_y) + dy))
            };
            let map_uv = [
                texel(near, near),
                texel(far, near),
                texel(far, far),
                texel(near, far),
            ];
            out.push(SpriteDraw::ground_shadow(
                ground_key(
                    f64::from(column.coord.x) + 0.5,
                    f64::from(column.coord.y) + 0.5,
                    f64::from(column.elevation),
                    GROUND_SHADOW_LAYER,
                    projection.tile_height,
                ),
                corners,
                map_uv,
                opacity,
            ));
        }
    }
}

/// Where a measured drawing is drawn around the ground point it stands on, in screen pixels.
pub fn extent_of_ink(ink: InkBox, tile_width: f64) -> SpriteExtent {
    let layout = iso::assets::ink_layout(ScreenPoint { x: 0.0, y: 0.0 }, ink, tile_width);
    SpriteExtent {
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
    }
}

/// The receiver a sprite drawn into `layout` standing on `foot` at `elevation` makes.
pub fn receiver_of(
    layout: SpriteLayout,
    feet: ScreenPoint,
    foot: (f64, f64),
    elevation: f64,
) -> ShadowReceiver {
    ShadowReceiver {
        foot,
        elevation,
        extent: SpriteExtent {
            left: layout.x - feet.x,
            top: layout.y - feet.y,
            width: layout.width,
            height: layout.height,
        },
    }
}

/// A lattice ready to draw a sprite with, or `None` when nothing shades it after all — or when
/// `fade` is zero, so a chunk straight out of its bake draws as one unshaded quad.
pub fn lattice_of(grid: &ShadeGrid, fade: f32) -> Option<ShadeLattice> {
    (fade > 0.0 && !grid.is_clear()).then(|| ShadeLattice::new(grid).scaled(fade))
}

/// The nine chunks around `coord`, itself included, in a fixed order.
fn around(coord: ChunkCoord) -> [ChunkCoord; 9] {
    let mut all = [coord; 9];
    let mut at = 0;
    for dy in -1..=1 {
        for dx in -1..=1 {
            all[at] = ChunkCoord {
                cx: coord.cx + dx,
                cy: coord.cy + dy,
            };
            at += 1;
        }
    }
    all
}

/// Which of the nine chunks around `coord` the stream has, as one bit each: what a bake was made
fn neighbours_loaded(manager: &ChunkManager, coord: ChunkCoord) -> u16 {
    around(coord)
        .iter()
        .enumerate()
        .filter(|(_, other)| manager.is_discovered(**other))
        .fold(0, |bits, (at, _)| bits | 1 << at)
}

#[cfg(test)]
#[path = "shadow_view.test.rs"]
mod tests;
