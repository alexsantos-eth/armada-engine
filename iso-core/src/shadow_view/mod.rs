//! Baked dawn shadows: the client half of [`armada_core::lighting`].
//!
//! The sun holds still, so shadows are computed once and drawn from the result. This module owns
//! that result and nothing else: when a chunk is shown, its ground shadows are baked into a map
//! and read back as a lattice per column ([`armada_core::lighting::bake`]), and the shadows its entities
//! throw on each other are baked into a lattice per entity
//! ([`armada_core::lighting::received`]). Both are then pure lookups, frame after frame, until
//! the chunk is dropped.
//!
//! The player is the one thing that cannot be baked, because it walks: its lattice is sampled
//! again every frame, from the casters of the chunks around it. That is one lattice a frame.
//!
//! **What casts and what receives.** Entities cast, onto the ground, onto other entities and
//! onto the player. The ground casts too, as a horizon rather than as a silhouette
//! ([`armada_core::lighting::terrain`]), onto itself, onto its own exposed vertical faces
//! ([`armada_core::lighting::faces`]) and onto whatever stands on it. The player does not cast:
//! its shadow would move, and this scene is a bake.
//!
//! **Why a chunk rebakes.** A caster near a chunk edge throws its shadow into the next chunk, so
//! a chunk is baked against the entities of itself and its eight neighbours. Until those
//! neighbours have streamed in the bake is incomplete, so each chunk remembers which neighbours
//! it was baked against and bakes again when that changes. [`BAKES_PER_FRAME`] caps how many do
//! so in one frame.

pub mod masks;

use armada_core::assets::{InkBox, SpriteLayout};
use armada_core::entities::Entity;
use armada_core::grid::{CHUNK_SIZE, ChunkCoord, WorldCoord, to_chunk_coord};
use armada_core::lighting::{
    HeightField, MapArea, PhaseLight, SHADE_COLUMNS, SHADE_ROWS, SHADOW_MAP_PIXELS_PER_TILE,
    ShadeGrid, ShadowCaster, ShadowMap, ShadowPoint, ShadowReceiver, SpriteExtent,
    TerrainFace,
    bake_ground_shadows, shade_grid, shaded_at, terrain_faces,
};
use armada_core::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use armada_core::terrain::TerrainColumn;
use armada_core::world::ChunkManager;
use macroquad::prelude::{screen_height, screen_width};
use masks::SilhouetteMasks;
use std::collections::HashMap;
use std::rc::Rc;

use crate::sprites::{ShadeLattice, SpriteDraw, scene_key};

/// Chunks baked in one frame.
///
/// One. Baking is a few milliseconds of walking texels, and showing a chunk asks it and its
/// eight neighbours to bake again; doing all nine in the frame the player crosses a chunk border
/// is a visible stutter, while doing one a frame fills them in over a seventh of a second with
/// the old shadows still on screen. The TypeScript client stages its own gathering the same way
/// (`SHADOW_GATHERS_PER_FRAME`).
pub const BAKES_PER_FRAME: usize = 1;

/// Ground shadows draw over the terrain of their own column and under anything standing on it.
///
/// One above [`crate::terrain_view::blocks::TERRAIN_LAYER`] and below
/// `PLAYER_BEHIND_LAYER`, so a shadow lies on the ground it was baked for, the player walks over
/// it and a tree growing on that column covers it.
pub const GROUND_SHADOW_LAYER: i32 = 1;

/// Quads across an exposed vertical face of ground, and down it, for the shadow on it.
///
/// A face is at most one block tall and one cell wide, so three either way is finer than a
/// texel of the ground's own map.
const FACE_SHADE_STEPS: u32 = 3;

/// Corners across a column's top face, and down it, for the shadow baked on it.
///
/// The map holds [`SHADOW_MAP_PIXELS_PER_TILE`] texels a tile and the bake blurs it by one, so
/// half that many corners, read between, is not told apart from the map on screen. It follows
/// the map rather than standing on its own: the lattice is how the map is read, so a sharper
/// map read through a coarser lattice would be thrown away again.
///
/// This is the *finest* a column is drawn at, not what it costs. Every corner is a vertex the
/// frame pushes, and at 36 texels a tile that would be 361 of them for a column with a flat
/// shadow on it, so [`coarsened`] halves the lattice back down for each column as far as its
/// own shadow allows.
const GROUND_SHADE_STEPS: u32 = SHADOW_MAP_PIXELS_PER_TILE / 2;

/// How far down a column's exposed side a shadow is worked out, in blocks.
///
/// The same depth the terrain itself stacks to
/// ([`MAX_EXPOSED_BLOCKS`](crate::terrain_view::blocks)): past it the wall is behind the ground
/// in front of it anyway.
const FACE_FLOOR: f64 = 10.0;

/// Corners across an entity's artwork, and down it, for the shadows it receives.
///
/// Coarser than the player's 8 × 16, because every shaded entity on screen pays for its lattice
/// and nothing about an entity moves: six by ten is 77 corners, and at these sprite sizes a
/// shadow edge crossing a trunk is a soft band either way.
pub const ENTITY_SHADE_COLUMNS: u32 = 6;
pub const ENTITY_SHADE_ROWS: u32 = 10;

/// What one shown chunk's shadows amount to.
struct Baked {
    /// The shadow on each column's top face, read off the baked map at the column's own
    /// corners. `None` where the column carries no coverage at all, which is most of a bare
    /// chunk and is what keeps a frame from drawing a transparent quad per column. Indexed as
    /// the chunk's own columns are.
    ground: Vec<Option<Rc<ShadeLattice>>>,
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
    /// One map, reused by every bake: it is 666 KB of texels and only one chunk bakes at a time.
    scratch: ShadowMap,
    tile_width: f64,
    box_height: f64,
}

impl ShadowScene {
    /// An empty scene lit by `light`, sampling `masks`.
    pub fn new(light: PhaseLight, masks: SilhouetteMasks, tile_width: f64, box_height: f64) -> Self {
        Self {
            light,
            masks,
            chunks: HashMap::new(),
            scratch: ShadowMap::new(MapArea::around(0, 0, CHUNK_SIZE - 1, CHUNK_SIZE - 1), SHADOW_MAP_PIXELS_PER_TILE),
            tile_width,
            box_height,
        }
    }

    /// Brings the bake up to date for `shown`, at most [`BAKES_PER_FRAME`] chunks of it, and
    /// forgets the chunks the stream has dropped.
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
        }
        let mut stale: Vec<(ChunkCoord, bool)> = shown
            .iter()
            .filter(|coord| manager.is_visible(**coord))
            .filter_map(|coord| {
                let against = neighbours_loaded(manager, *coord);
                match self.chunks.get(coord) {
                    Some(baked) if baked.baked_against == against => None,
                    Some(_) => Some((*coord, false)),
                    None => Some((*coord, true)),
                }
            })
            .collect();
        stale.sort_by_key(|(_, first_time)| !first_time);
        for (coord, _) in stale.into_iter().take(BAKES_PER_FRAME) {
            self.bake(manager, coord);
        }
    }

    /// Bakes one chunk: its ground map, and the lattices of its own entities.
    fn bake(&mut self, manager: &ChunkManager, coord: ChunkCoord) {
        let min_x = coord.cx * CHUNK_SIZE;
        let min_y = coord.cy * CHUNK_SIZE;
        let area = MapArea::around(min_x, min_y, min_x + CHUNK_SIZE - 1, min_y + CHUNK_SIZE - 1);
        self.chunks.remove(&coord);
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
        let masks = &self.masks;
        // The level a shadow lands on is the top the view actually draws, not the plane the
        // column's elevation names: the beach is a shallow slab drawn half a block under its
        // cell, except on the terrace row, where the view lifts it back ([`preview_top_level`]).
        let height_at = |point: WorldCoord| manager.column_at(point.x, point.y).map(|c| c.elevation);
        let level_at =
            |x: i32, y: i32| manager.column_at(x, y).map(|c| crate::preview_top_level(c, height_at));
        // The ground casts too, and a cliff that shades this chunk's edge usually stands in the
        // next one, so the field reaches past the area the map covers.
        let ground = Self::ground_field(manager, area.min_x, area.min_y, area.max_x, area.max_y);
        bake_ground_shadows(
            &mut self.scratch,
            &casters,
            Some(&ground),
            &self.light.shadow,
            self.tile_width,
            self.box_height,
            &level_at,
            &|index| masks.silhouette_of(index),
        );

        let ground_shade = self.ground_shade(manager, coord);
        let shaded = self.shade_entities(manager, coord, &casters, &ground);
        let faces = self.shade_faces(manager, coord, &casters, &ground);
        self.chunks.insert(coord, Baked {
            ground: ground_shade,
            shaded,
            casters: own,
            faces,
            baked_against: neighbours_loaded(manager, coord),
        });
    }

    /// The drawn heights of an area of ground, which is what the ground casts its own shadow
    /// from. [`HeightField`] grows the area by the ray's reach itself.
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

    /// Reads the baked map back into one lattice of coverage per column of the chunk.
    ///
    /// The map used to be uploaded as a texture per chunk and each column drawn as a quad of
    /// it. That was a texture of its own between every two blocks of ground, and Macroquad
    /// starts a new draw call whenever the bound texture changes: a scene that was one batch
    /// became a hundred and thirty. The shadows are static, so the same texels are read here
    /// once, at bake time, and carried as the colour of a lattice drawn out of the shared atlas
    /// ([`crate::sprites::WHITE_PATCH`]) — which costs nothing to bind, because the ground is
    /// already drawn from it.
    fn ground_shade(&self, manager: &ChunkManager, coord: ChunkCoord) -> Vec<Option<Rc<ShadeLattice>>> {
        let columns = manager.terrain_chunk(coord).map_or(0, <[TerrainColumn]>::len);
        let Some(chunk) = manager.terrain_chunk(coord).filter(|_| !self.scratch.is_empty()) else {
            return vec![None; columns];
        };
        let steps = GROUND_SHADE_STEPS.max(1);
        let per_tile = f64::from(self.scratch.pixels_per_tile);
        // A corner of the lattice, in texels along the column's own square. The two at the ends
        // are pulled in to the middle of the column's outermost texel instead of sitting on its
        // edge, because an edge reads half of the next column's texel — and that column is at
        // another level, drawn somewhere else. The texture did the same thing, but only in its
        // outermost row of pixels; a lattice spreads it over the sixth of a cell up to the next
        // corner, which put the pale line back at the foot of every step.
        let along = |corner: u32| {
            (f64::from(corner) / f64::from(steps) * per_tile).clamp(0.5, per_tile - 0.5)
        };
        chunk
            .iter()
            .map(|column| {
                let (from_x, from_y) = self.scratch.square_of(column.coord.x, column.coord.y)?;
                let mut coverage = Vec::with_capacity(((steps + 1) * (steps + 1)) as usize);
                let mut any = false;
                for row in 0..=steps {
                    let y = f64::from(from_y) + along(row);
                    for across in 0..=steps {
                        let x = f64::from(from_x) + along(across);
                        let value = self.coverage_at(x, y);
                        any |= value > 0.0;
                        coverage.push(value);
                    }
                }
                // A column the sun reaches everywhere draws nothing at all, which is most of a
                // bare chunk and the difference between a quad per column and a quad per shadow.
                let (steps, coverage) = coarsened(steps, coverage);
                any.then(|| Rc::new(ShadeLattice::from_coverage(steps, steps, coverage)))
            })
            .collect()
    }

    /// The map's coverage at a point of it, in `[0, 1]`, read between the four texels around it.
    ///
    /// `x` and `y` are in texels of the map, counted from its corner, so a texel's own middle is
    /// at its index plus a half — which is the convention a texture sampler reads by, and what
    /// keeps the lattice showing what the texture used to.
    fn coverage_at(&self, x: f64, y: f64) -> f32 {
        let (width, height) = (self.scratch.width, self.scratch.height);
        if width == 0 || height == 0 {
            return 0.0;
        }
        let place = |value: f64, span: u32| {
            let shifted = (value - 0.5).clamp(0.0, f64::from(span - 1));
            let first = shifted.floor() as u32;
            (first, (first + 1).min(span - 1), shifted - f64::from(first))
        };
        let (x0, x1, tx) = place(x, width);
        let (y0, y1, ty) = place(y, height);
        let at = |x: u32, y: u32| f64::from(self.scratch.alpha[(y * width + x) as usize]) / 255.0;
        let top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
        let bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
        (top + (bottom - top) * ty) as f32
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
            out.push(SpriteDraw::shadow(
                scene_key(
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
        let opacity = self.light.opacity() as f32;
        let (screen_w, screen_h) = (f64::from(screen_width()), f64::from(screen_height()));
        let half_tile = projection.tile_width / 2.0;
        for (index, column) in columns.iter().enumerate() {
            let Some(shade) = baked.ground.get(index).and_then(Option::as_ref) else {
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
            out.push(SpriteDraw::shadow(
                scene_key(
                    f64::from(column.coord.x) + 0.5,
                    f64::from(column.coord.y) + 0.5,
                    f64::from(column.elevation),
                    GROUND_SHADOW_LAYER,
                    projection.tile_height,
                ),
                corners,
                Rc::clone(shade),
                opacity,
            ));
        }
    }
}

/// Where a measured drawing is drawn around the ground point it stands on, in screen pixels.
pub fn extent_of_ink(ink: InkBox, tile_width: f64) -> SpriteExtent {
    let layout = armada_core::assets::ink_layout(ScreenPoint { x: 0.0, y: 0.0 }, ink, tile_width);
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



/// Drops every other corner of a square lattice while what is dropped can be read back between
/// the ones kept, and gives what is left.
///
/// Every corner is a vertex the frame pushes, and most shaded columns need very few: one deep
/// inside a tree's shadow is the same value in all directions, and one the shadow misses
/// entirely is already gone. Only the columns an edge crosses pay for the fine lattice, so the
/// map can be read as sharply as it likes without the whole ground paying for it.
///
/// `steps` halves while it stays even, so what comes back still divides
/// [`SHADOW_MAP_PIXELS_PER_TILE`] — the corners are still read at texel centres.
fn coarsened(steps: u32, coverage: Vec<f32>) -> (u32, Vec<f32>) {
    /// How far a corner read between its neighbours may fall from its own value, in coverage.
    /// A shadow is drawn at about a third opacity, so this is well under one step of a byte.
    const TOLERANCE: f32 = 8.0 / 255.0;
    let (mut steps, mut coverage) = (steps, coverage);
    while steps >= 2 && steps % 2 == 0 {
        let across = (steps + 1) as usize;
        let half = steps as usize / 2;
        // A corner that survives this halving, by its place in the thinner lattice.
        let kept = |row: usize, column: usize| coverage[row * 2 * across + column * 2];
        let between = |row: usize, column: usize| {
            let (low_row, low_column) = (row / 2, column / 2);
            let (high_row, high_column) = (low_row + row % 2, low_column + column % 2);
            let mix = |a: f32, b: f32| if a == b { a } else { (a + b) / 2.0 };
            mix(
                mix(kept(low_row, low_column), kept(low_row, high_column)),
                mix(kept(high_row, low_column), kept(high_row, high_column)),
            )
        };
        let fits = (0..=steps as usize).all(|row| {
            (0..=steps as usize).all(|column| {
                row % 2 == 0 && column % 2 == 0
                    || (between(row, column) - coverage[row * across + column]).abs() <= TOLERANCE
            })
        });
        if !fits {
            break;
        }
        let mut thinner = Vec::with_capacity((half + 1) * (half + 1));
        for row in 0..=half {
            for column in 0..=half {
                thinner.push(kept(row, column));
            }
        }
        steps /= 2;
        coverage = thinner;
    }
    (steps, coverage)
}

#[cfg(test)]
#[path = "mod.test.rs"]
mod tests;
