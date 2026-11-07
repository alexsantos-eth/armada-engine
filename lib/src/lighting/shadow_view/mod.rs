//! Baked dawn shadows: the client half of [`iso::lighting`].
//!
//! The sun holds still, so shadows are computed once and drawn from the result. This module owns
//! that result and nothing else: when a chunk is shown, its ground shadows are baked into a map
//! of texels ([`iso::lighting::bake`]) which goes to the GPU as a slot of the shadow
//! atlas ([`atlas`]), and the shadows its entities throw on each other are baked into a lattice
//! per entity ([`iso::lighting::received`]). Both are then pure lookups, frame after
//! frame, until the chunk is dropped.
//!
//! A column's shadow is therefore four vertices naming its square of the atlas, and all this
//! module keeps per column is whether there is anything to draw at all. It used to read the map
//! back as a lattice of corners and carry the shading as vertex colour, which batched but cost
//! 221 vertices a column — 96 % of everything a frame drew. [`atlas`] has that story.
//!
//! The player is the one thing that cannot be baked, because it walks: its lattice is sampled
//! again every frame, from the casters of the chunks around it. That is one lattice a frame.
//!
//! **What casts and what receives.** Entities cast, onto the ground, onto other entities and
//! onto the player. The ground casts too, as a horizon rather than as a silhouette
//! ([`iso::lighting::terrain`]), onto itself, onto its own exposed vertical faces
//! ([`iso::lighting::faces`]) and onto whatever stands on it. The player does not cast:
//! its shadow would move, and this scene is a bake.
//!
//! **Why a chunk rebakes.** A caster near a chunk edge throws its shadow into the next chunk, so
//! a chunk is baked against the entities of itself and its eight neighbours. Until those
//! neighbours have streamed in the bake is incomplete, so each chunk remembers which neighbours
//! it was baked against and bakes again when that changes. A bake is spread over frames, a
//! piece at a time, within [`BAKE_BUDGET_MS`].

pub mod atlas;
pub mod masks;

use iso::assets::{InkBox, SpriteLayout};
use iso::entities::Entity;
use iso::grid::{CHUNK_SIZE, ChunkCoord, WorldCoord, to_chunk_coord};
use iso::lighting::{
    HeightField, MapArea, PhaseLight, SHADE_COLUMNS, SHADE_ROWS, SHADOW_MAP_PIXELS_PER_TILE,
    ShadeGrid, ShadowCaster, ShadowMap, ShadowPoint, ShadowReceiver, SpriteExtent,
    TerrainFace,
    GroundBake, shade_grid, shaded_at, terrain_faces,
};
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use iso::terrain::TerrainColumn;
use iso::world::ChunkManager;
use macroquad::prelude::{get_time, screen_height, screen_width};
use masks::SilhouetteMasks;
use std::collections::HashMap;
use std::rc::Rc;

use atlas::{ShadowAtlas, atlas_uv, square_in_slot};

use crate::assets::sprites::{ShadeLattice, SpriteDraw, ground_key};

/// How long a frame may spend baking shadows.
///
/// A whole chunk is tens of milliseconds, more than a frame has, and a step across a chunk
/// border reveals several chunks at once and makes all of their neighbours stale with them — so
/// a chunk a frame was a run of dropped frames, which is what walking felt like. The bake is cut
/// into pieces instead ([`GroundBake`] for the map, a band of columns for the lattices read off
/// it) and a frame does as many as fit here, with the chunk's previous shadows still on screen
/// until the last piece lands. The TypeScript client has no such cost: it gathers its shadows
/// into a render texture on the GPU.
///
/// Three milliseconds leaves most of a sixty-hertz frame to the rest of the scene, and fills a
/// chunk in over a few frames. It is checked between pieces, not inside one, so a frame can
/// overrun it by whatever the largest piece costs.
pub const BAKE_BUDGET_MS: f64 = 3.0;

/// Columns whose lattice is read off the map in one piece of work.
///
/// A chunk is 1024 of them and each one scans its own square of the map for coverage, so this is
/// the knob that keeps that stage inside the budget rather than its own hitch.
const GROUND_SHADE_COLUMNS: usize = 128;

/// Ground shadows draw over the terrain of their own column and under anything standing on it.
///
/// One above [`crate::terrain::terrain_view::blocks::TERRAIN_LAYER`] and below
/// `PLAYER_BEHIND_LAYER`, so a shadow lies on the ground it was baked for, the player walks over
/// it and a tree growing on that column covers it.
pub const GROUND_SHADOW_LAYER: i32 = 1;

/// Quads across an exposed vertical face of ground, and down it, for the shadow on it.
///
/// A face is at most one block tall and one cell wide, so three either way is finer than a
/// texel of the ground's own map.
const FACE_SHADE_STEPS: u32 = 3;

/// How far down a column's exposed side a shadow is worked out, in blocks.
///
/// The same depth the terrain itself stacks to
/// ([`MAX_EXPOSED_BLOCKS`](crate::terrain::terrain_view::blocks)): past it the wall is behind the ground
/// in front of it anyway.
pub const FACE_FLOOR: f64 = 10.0;

/// Corners across an entity's artwork, and down it, for the shadows it receives.
///
/// Coarser than the player's 8 × 16, because every shaded entity on screen pays for its lattice
/// and nothing about an entity moves: six by ten is 77 corners, and at these sprite sizes a
/// shadow edge crossing a trunk is a soft band either way.
pub const ENTITY_SHADE_COLUMNS: u32 = 6;
pub const ENTITY_SHADE_ROWS: u32 = 10;

/// What one shown chunk's shadows amount to.
struct Baked {
    /// Whether each column's top face carries any coverage at all, indexed as the chunk's own
    /// columns are.
    ///
    /// The shading itself lives in the chunk's slot of the shadow atlas, where the sampler reads
    /// it, so all a frame needs from the CPU is whether there is anything to draw: most of a
    /// bare chunk is in full sun, and this is what keeps a frame from drawing a transparent quad
    /// per column.
    ground: Vec<bool>,
    /// The shadows falling on the chunk's own entities, by the cell each one stands on.
    shaded: HashMap<(i32, i32), ShadeGrid>,
    /// The chunk's own entities as casters, for its neighbours' bakes and for the player.
    casters: Vec<ShadowCaster>,
    /// The shadow on each of the chunk's exposed vertical faces, as coverage at its corners.
    faces: Vec<(TerrainFace, Rc<ShadeLattice>)>,
    /// Which of the nine chunks around it (itself included) were loaded when it was baked.
    baked_against: u16,
}

/// The baked shadows of every shown chunk.
pub struct ShadowScene {
    light: PhaseLight,
    masks: SilhouetteMasks,
    chunks: HashMap<ChunkCoord, Baked>,
    /// One map, reused by every bake: it is over a megabyte of texels and only one chunk bakes
    /// at a time. While [`working`](Self::working) holds a job, the map belongs to that job.
    scratch: ShadowMap,
    /// The maps of the shown chunks, on the GPU: the texture the scene's material samples.
    atlas: ShadowAtlas,
    working: Option<Pending>,
    tile_width: f64,
    box_height: f64,
}

/// A chunk's bake, part way through.
///
/// Each piece of it is small enough to fit in a frame beside everything else, and the chunk's
/// previous shadows stay on screen until the last piece lands.
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
    /// An empty scene lit by `light`, sampling `masks`.
    pub fn new(
        light: PhaseLight,
        masks: SilhouetteMasks,
        atlas: ShadowAtlas,
        tile_width: f64,
        box_height: f64,
    ) -> Self {
        Self {
            light,
            masks,
            chunks: HashMap::new(),
            scratch: ShadowMap::new(MapArea::around(0, 0, CHUNK_SIZE - 1, CHUNK_SIZE - 1), SHADOW_MAP_PIXELS_PER_TILE),
            atlas,
            working: None,
            tile_width,
            box_height,
        }
    }

    /// Spends up to [`BAKE_BUDGET_MS`] bringing the bake up to date for `shown`, and forgets
    /// the chunks the stream has dropped.
    ///
    /// Chunks never baked go first, so a chunk the player has just walked into gets its shadows
    /// before a chunk that only needs them refreshed.
    pub fn update(&mut self, manager: &ChunkManager, shown: &[ChunkCoord]) {
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
        // Counts every shown chunk as a use of its slot, so the one the atlas turns out when it
        // runs short is one the camera is not looking at. That only holds while the camera
        // shows fewer chunks than the atlas has slots, which the client's own zoom guarantees
        // with room to spare (`the_atlas_holds_more_chunks_than_the_camera_can_show`); past it
        // the atlas would turn out a chunk that is on screen and bake it again every frame.
        debug_assert!(
            shown.len() <= atlas::SLOT_COUNT,
            "{} chunks shown against {} shadow slots: the atlas will thrash",
            shown.len(),
            atlas::SLOT_COUNT
        );
        for coord in shown {
            self.atlas.touch(*coord);
        }
        // A job whose chunk went away, or whose neighbours changed under it, is thrown away: it
        // was being baked against something that is no longer true.
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
                let Some(job) = self.working.take() else { return };
                let Pending { coord, against, own, shade, shaded, faces, .. } = job;
                self.chunks.insert(coord, Baked {
                    ground: shade,
                    shaded,
                    casters: own,
                    faces,
                    baked_against: against,
                });
            }
            if get_time() >= until {
                return;
            }
        }
    }

    /// The chunk most worth baking next: one that has no shadows at all before one that has
    /// shadows baked against fewer neighbours than it has now.
    fn next_to_bake(&self, manager: &ChunkManager, shown: &[ChunkCoord]) -> Option<ChunkCoord> {
        let mut first_time = None;
        let mut again = None;
        for coord in shown.iter().filter(|coord| manager.is_visible(**coord)) {
            match self.chunks.get(coord) {
                // Its map has to be in the atlas as well as baked: a chunk whose slot was taken
                // while it was off screen has nothing left to sample.
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
    ///
    /// The job is taken out of the scene for the duration so that each piece can read the
    /// scene — its masks, its light, the map it is laying into — without borrowing the job
    /// through it.
    fn advance(&mut self, manager: &ChunkManager) -> bool {
        let Some(mut job) = self.working.take() else { return false };
        let mut finished = false;
        match job.stage {
            Reading::Map => {
                let masks = &self.masks;
                let more = job.map.step(
                    &mut self.scratch,
                    &job.casters,
                    Some(&job.ground),
                    &self.light.shadow,
                    self.tile_width,
                    self.box_height,
                    &|index| masks.silhouette_of(index),
                );
                if !more {
                    job.stage = Reading::Upload;
                }
            }
            Reading::Upload => {
                // One upload of the whole slot, and a step of its own: it is a megabyte and a
                // half, and the budget is checked between steps.
                //
                // A chunk turned out to make room is forgotten rather than refilled, because
                // keeping its texels to refill from would cost as much memory again. It bakes
                // afresh if the camera comes back to it.
                if let Some(turned_out) = self.atlas.put(job.coord, &self.scratch) {
                    self.chunks.remove(&turned_out);
                }
                job.stage = Reading::Ground(0);
            }
            Reading::Ground(from) => {
                let done = self
                    .ground_cover(manager, job.coord, from, GROUND_SHADE_COLUMNS, &mut job.shade);
                job.stage =
                    if done == 0 { Reading::Entities } else { Reading::Ground(from + done) };
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
    ///
    /// Everything that has to be read out of the world in one go happens here — which entities
    /// cast, how high the ground stands — so that the pieces that follow only touch the job's
    /// own numbers.
    fn start(&mut self, manager: &ChunkManager, coord: ChunkCoord) {
        let min_x = coord.cx * CHUNK_SIZE;
        let min_y = coord.cy * CHUNK_SIZE;
        let area = MapArea::around(min_x, min_y, min_x + CHUNK_SIZE - 1, min_y + CHUNK_SIZE - 1);
        let own = self.casters_of(manager, coord);
        // Its neighbours' casters as well: a tree a column from the edge throws most of its
        // shadow into the next chunk.
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
        // The level a shadow lands on is the top the view actually draws, not the plane the
        // column's elevation names: the beach is a shallow slab drawn half a block under its
        // cell, except on the terrace row, where the view lifts it back ([`preview_top_level`]).
        let height_at = |point: WorldCoord| manager.column_at(point.x, point.y).map(|c| c.elevation);
        let level_at =
            |x: i32, y: i32| manager.column_at(x, y).map(|c| crate::preview_top_level(c, height_at));
        // The ground casts too, and a cliff that shades this chunk's edge usually stands in the
        // next one, so the field reaches past the area the map covers.
        let ground = Self::ground_field(manager, area.min_x, area.min_y, area.max_x, area.max_y);
        let map = GroundBake::new(&self.scratch, &level_at);
        let columns = manager.terrain_chunk(coord).map_or(0, <[TerrainColumn]>::len);
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
        let height_at = |point: WorldCoord| manager.column_at(point.x, point.y).map(|c| c.elevation);
        HeightField::new(min_x, min_y, max_x, max_y, |x, y| {
            manager.column_at(x, y).map(|c| crate::preview_top_level(c, height_at))
        })
    }

    /// Reads back which of `count` columns from `from` carry any coverage at all, appends the
    /// answers to `out`, and says how many columns it got through — fewer at the chunk's end.
    ///
    /// Only the flag: the shading itself stays in the chunk's slot of the shadow atlas, where
    /// the sampler reads it. The first version read a lattice of corners back here instead, and
    /// that lattice was what every frame then had to push as vertices.
    ///
    /// The whole of a column's square is scanned, not just the corners its quad reads between: a
    /// shadow that only clips the square's outer half texel draws a quad that shows almost
    /// nothing, and that is cheaper than missing one that does show.
    fn ground_cover(
        &self,
        manager: &ChunkManager,
        coord: ChunkCoord,
        from: usize,
        count: usize,
        out: &mut Vec<bool>,
    ) -> usize {
        let columns = manager.terrain_chunk(coord).map_or(0, <[TerrainColumn]>::len);
        let Some(chunk) = manager.terrain_chunk(coord).filter(|_| !self.scratch.is_empty()) else {
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
    ///
    /// A footprint of several cells is one caster standing on its anchor, not one per cell: the
    /// measured box already spans every cell the drawing covers, and a silhouette is an upright
    /// cut-out whatever it is a drawing of.
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
    ///
    /// One lattice covers the whole drawing, however many cells its footprint spans: the
    /// measured box already spans every cell, and the bands a long sprite is cut into read
    /// their own part out of it. Cutting a lattice per band instead would step the shadow at
    /// every cut.
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
            // Everything but itself: a sprite does not shade the sprite it is.
            let others: Vec<ShadowCaster> = casters
                .iter()
                .copied()
                .filter(|caster| caster.foot != receiver.foot)
                .collect();
            if let Some(grid) = shade_grid(
                &receiver,
                &others,
                &self.light.shadow,
                self.light.opacity(),
                self.tile_width,
                self.box_height,
                &|index| masks.silhouette_of(index),
                Some(ground),
                ENTITY_SHADE_COLUMNS,
                ENTITY_SHADE_ROWS,
            ) {
                shaded.insert((entity.x(), entity.y()), grid);
            }
        }
        shaded
    }

    /// The shadow on each exposed vertical face of the chunk's ground.
    ///
    /// A face has no artwork to carry a lattice, so each corner is a real point of the world and
    /// is asked directly ([`shaded_at`]): the casters around it, and the ground's own horizon,
    /// which is what darkens a cliff standing in another cliff's shadow. The phase's opacity is
    /// left off here and applied when the face is drawn, so the lattice is plain coverage.
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
        let height_at = |point: WorldCoord| manager.column_at(point.x, point.y).map(|c| c.elevation);
        let level_at =
            |x: i32, y: i32| manager.column_at(x, y).map(|c| crate::preview_top_level(c, height_at));
        let walls = terrain_faces(
            columns
                .iter()
                .map(|c| (c.coord.x, c.coord.y, crate::preview_top_level(*c, height_at), c.surface)),
            level_at,
            FACE_FLOOR,
        );
        let masks = &self.masks;
        let mut shaded = Vec::new();
        for face in walls {
            let mut grid = Vec::with_capacity(((FACE_SHADE_STEPS + 1) * (FACE_SHADE_STEPS + 1)) as usize);
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
                    Rc::new(ShadeLattice::from_coverage(FACE_SHADE_STEPS, FACE_SHADE_STEPS, grid)),
                ));
            }
        }
        shaded
    }

    /// Queues the shadow on every exposed vertical face of `coord`'s ground.
    ///
    /// A face is drawn with its own column, one layer over the terrain, so the column in front
    /// of it still covers whatever of it that column hides.
    pub fn collect_faces(
        &self,
        coord: ChunkCoord,
        projection: ProjectionConfig,
        out: &mut Vec<SpriteDraw>,
    ) {
        let Some(baked) = self.chunks.get(&coord) else {
            return;
        };
        let opacity = self.light.opacity() as f32;
        let (screen_w, screen_h) = (f64::from(screen_width()), f64::from(screen_height()));
        for (face, shade) in &baked.faces {
            // The wall the player sees is the block's own drawing, and a terrain block fills
            // its cell exactly (`artifacts/terrain_blocks.py`), so the quad is the cell's own
            // edge from the top down to the neighbour's level.
            let corner = |along: f64, down: f64| {
                let (x, y, level) = face.point(along, down);
                let point = project_block(GridPoint { x, y }, level, projection);
                (point.screen_x, point.screen_y)
            };
            let corners = [corner(0.0, 0.0), corner(1.0, 0.0), corner(1.0, 1.0), corner(0.0, 1.0)];
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
    ///
    /// The player moves, so this is the one lattice that is not baked. It reads the casters of
    /// the chunk it stands in and the eight around it, which is the same neighbourhood a chunk
    /// bakes its ground against.
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
        // The ground it stands on casts too, and its own field is small: a height field grows
        // itself by the ray's reach, so one cell is all this has to ask for.
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
            self.light.opacity(),
            self.tile_width,
            self.box_height,
            &|index| masks.silhouette_of(index),
            Some(&ground),
            SHADE_COLUMNS,
            SHADE_ROWS,
        )
    }

    /// Queues the ground shadow of every shaded column of `chunk`, to be sorted and drawn with
    /// everything else.
    ///
    /// One quad per column that carries any shadow, laid on that column's own top face at its
    /// own level: the quad *is* the diamond, so a shadow cannot spill over the cliff beside it,
    /// and it carries the column's own depth so the ground in front of it still covers it.
    ///
    /// The quad is the cell itself, at the level the column's top is actually drawn at
    /// ([`crate::preview_top_level`]). That only works because a terrain block fills its whole
    /// cell (`artifacts/terrain_blocks.py`): while the blocks were a few percent narrower, a
    /// quad on the cell overhung its own slab onto the one behind and the two shadows added up
    /// into a seam, and a quad cut to the drawing left every groove between the blocks lit.
    ///
    /// How dark it is comes from the lattice baked with the chunk, not from a texture, so the
    /// quad is drawn out of the shared atlas and costs no draw call of its own.
    pub fn collect_ground(
        &self,
        coord: ChunkCoord,
        columns: &[TerrainColumn],
        projection: ProjectionConfig,
        height_at: impl Fn(WorldCoord) -> Option<i32>,
        out: &mut Vec<SpriteDraw>,
    ) {
        let Some(baked) = self.chunks.get(&coord) else {
            return;
        };
        // No slot, nothing to sample: a chunk whose map was turned out of the atlas draws no
        // ground shadows until it is baked again, which `next_to_bake` already asks for.
        let Some(slot) = self.atlas.slot_of(coord) else {
            return;
        };
        let opacity = self.light.opacity() as f32;
        let (screen_w, screen_h) = (f64::from(screen_width()), f64::from(screen_height()));
        let half_tile = projection.tile_width / 2.0;
        // Where in its own square a corner reads the map: the middle of the square's outermost
        // texel, not its edge. An edge reads half of the next column's texel, and that column is
        // at another level and drawn somewhere else, which put a pale line at the foot of every
        // step.
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
            let level = crate::preview_top_level(*column, &height_at);
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
            // The four corners of the top diamond, starting at the one towards the camera
            // (the column's own coordinate, which is also lowest on screen) and going round.
            // The projection puts a larger `x + y` higher up, so the corner opposite it is the
            // cell past it along both axes.
            let corners = [corner(0.0, 0.0), corner(1.0, 0.0), corner(1.0, 1.0), corner(0.0, 1.0)];
            // The near corner sits on the diamond's own centre line, so it gives the column's
            // horizontal place directly; the near and far corners bound it vertically.
            if corners[0].0 + half_tile < 0.0
                || corners[0].0 - half_tile > screen_w
                || corners[0].1 < 0.0
                || corners[2].1 > screen_h
            {
                continue;
            }
            // Each corner reads the map at its own place in the square, in the same order: along
            // the square's x with the grid's x, and down its y with the grid's y.
            let texel = |dx: f64, dy: f64| {
                atlas_uv(slot, (f64::from(square_x) + dx, f64::from(square_y) + dy))
            };
            let map_uv = [texel(near, near), texel(far, near), texel(far, far), texel(near, far)];
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
pub fn receiver_of(layout: SpriteLayout, feet: ScreenPoint, foot: (f64, f64), elevation: f64) -> ShadowReceiver {
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

/// A lattice ready to draw a sprite with, or `None` when nothing shades it after all.
pub fn lattice_of(grid: &ShadeGrid) -> Option<ShadeLattice> {
    (!grid.is_clear()).then(|| ShadeLattice::new(grid))
}

/// The nine chunks around `coord`, itself included, in a fixed order.
fn around(coord: ChunkCoord) -> [ChunkCoord; 9] {
    let mut all = [coord; 9];
    let mut at = 0;
    for dy in -1..=1 {
        for dx in -1..=1 {
            all[at] = ChunkCoord { cx: coord.cx + dx, cy: coord.cy + dy };
            at += 1;
        }
    }
    all
}

/// Which of the nine chunks around `coord` the stream has, as one bit each: what a bake was made
/// against, so it can be made again when a neighbour arrives.
fn neighbours_loaded(manager: &ChunkManager, coord: ChunkCoord) -> u16 {
    around(coord)
        .iter()
        .enumerate()
        .filter(|(_, other)| manager.is_discovered(**other))
        .fold(0, |bits, (at, _)| bits | 1 << at)
}



#[cfg(test)]
#[path = "mod.test.rs"]
mod tests;
