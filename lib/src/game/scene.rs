//! Scene assembly: from the world and the player to the queue of sprites to draw.
//!
//! This is the view half of the frame: it reads the world, the camera and the player, fills the
//! reusable draw queue and projects the grid for the T-key debug view. It never mutates the
//! world; simulation lives in `game::frame`.

use iso::assets::{InkBox, SpriteFrame, SpriteLayout, footprint_band, ink_layout, sway_band};
use iso::camera::Camera;
use iso::entities::EntityLengthAxis;
use iso::grid::WorldCoord;
use iso::player::get_player_jump_phase;
use iso::player::physics::{get_player_climb_progress, get_player_column};
use iso::projection::{
    GridPoint, ProjectionConfig, ScreenPoint, project_block, project_grid_point,
};
use iso::scene_order::{CoverMask, DrawKey, Occludee, PlayerSheet, bounding_layout, cover_share};
use macroquad::prelude::*;

use crate::assets::sprites::{Focus, SpriteAtlas, SpriteDraw, ground_key, scene_key};
use crate::effects::ambient::SpawnEnv;
use crate::effects::emitters::EffectSpot;
use crate::effects::fire::FireSpot;
use crate::game::config::{
    BAND_BLEED, ENTITY_LAYER, NpcArt, PLAYER_BEHIND_LAYER, PLAYER_CLIMB_SHEET, PLAYER_FLIP_SHEET,
    PLAYER_FRONT_LAYER, PLAYER_GATHER_SHEET, PLAYER_IDLE_SHEET, PLAYER_JETPACK_DEPTH,
    PLAYER_JETPACK_SHEET, PLAYER_JUMP_SHEET, PLAYER_SCALE, PLAYER_SWIM_SHEET, PLAYER_WALK_SHEET,
    PLAYER_XRAY, SceneMetrics, chop_sheet,
};
use crate::game::frame::FrameView;
use crate::game::ground::WaterField;
use crate::game::state::Game;
use crate::lighting::shadow_view;
use crate::player::body_motion::{BodyMoment, BodyScale, body_quad};
use crate::player::dust_view::DustGround;
use crate::player::flip::FlipMoment;
use crate::player::player_shadow::player_shadow;
use crate::player::player_view::{PlayerMoment, jump_poses};
use crate::player::shadow_clip;
use crate::terrain::terrain_view_blocks::{Surroundings, TERRAIN_LAYER, collect_terrain_sprites};
use crate::water::reflection_view::{Reflected, ReflectionSprite, collect_reflection};

/// Tile heights above a market's ground point at which its icon floats.
const MARK_HEIGHT: f64 = 1.05;

/// This view's projection with its origin at `(origin_x, origin_y)`: the tile metrics are the
/// scene's, the origin follows the camera.
pub(crate) fn preview_projection(
    origin_x: f64,
    origin_y: f64,
    metrics: SceneMetrics,
) -> ProjectionConfig {
    ProjectionConfig {
        tile_width: metrics.tile_width,
        tile_height: metrics.tile_height,
        elevation_step: Some(metrics.elevation_step),
        origin_x,
        origin_y,
    }
}

/// The player's artwork: its frame in the atlas and where that drawing belongs over the ground.
#[derive(Clone, Copy)]
pub(crate) struct PlayerSprite {
    pub(crate) frame: SpriteFrame,
    pub(crate) ink: InkBox,
    /// Which of the atlas's textures that frame is cut from.
    pub(crate) texture: usize,
}

/// How many poses each of the player's sheets holds, out of the atlas.
pub(crate) fn player_sheets(atlas: &SpriteAtlas) -> crate::player::player_view::PlayerSheets {
    let columns = |source| atlas.sheet(source).map(|sheet| sheet.columns());
    crate::player::player_view::PlayerSheets {
        walk_poses: columns(PLAYER_WALK_SHEET).map(|columns| columns as i32 - 1),
        idle_poses: columns(PLAYER_IDLE_SHEET).map(|columns| columns as i32),
        climb_poses: columns(PLAYER_CLIMB_SHEET).map(|columns| columns as i32),
        swim_poses: columns(PLAYER_SWIM_SHEET).map(|columns| columns as i32),
        flip_poses: columns(PLAYER_FLIP_SHEET).map(|columns| columns as i32),
        gather_poses: columns(PLAYER_GATHER_SHEET).map(|columns| columns as i32),
        jump_poses: atlas
            .sheet(PLAYER_JUMP_SHEET)
            .and_then(|sheet| jump_poses(sheet.poses(), sheet.columns())),
    }
}

/// How many poses an animal's sheets hold, out of the atlas: a walk sheet whose first column
/// stands, an idle cycle and, for one that hops, the five jump phases. It has nothing to climb,
/// swim or flip with.
pub(crate) fn npc_sheets(
    atlas: &SpriteAtlas,
    art: NpcArt,
) -> crate::player::player_view::PlayerSheets {
    let columns = |source| atlas.sheet(source).map(|sheet| sheet.columns());
    crate::player::player_view::PlayerSheets {
        walk_poses: columns(art.walk).map(|columns| columns as i32 - 1),
        idle_poses: columns(art.idle).map(|columns| columns as i32),
        jump_poses: art
            .jump
            .and_then(|jump| atlas.sheet(jump))
            .and_then(|sheet| jump_poses(sheet.poses(), sheet.columns())),
        ..Default::default()
    }
}

/// Size of a heap's shadow on the ground against the player's.
const DROP_SHADOW_SCALE: f64 = 0.45;

/// The player's depth key for this frame. It stands on its rounded column, but the key's
/// elevation rides the feet, so climbing or descending a flight tilts the order gradually
/// instead of snapping with the column's integer level.
pub(crate) fn player_key(
    column: WorldCoord,
    feet_elevation: f64,
    layer: i32,
    tile_height: f64,
) -> DrawKey {
    scene_key(
        f64::from(column.x) + 0.5,
        f64::from(column.y) + 0.5,
        feet_elevation,
        layer,
        tile_height,
    )
}

/// Lifts the player's key just past every piece of ground decor (`drawUnderPlayer`, the small
/// rocks) around it that would otherwise draw after it, so a rock never covers the player.
/// `decor` gives each piece's anchor column and base elevation; only pieces at or below the
/// player's feet count, so a rock up on a step in front still sorts with its step.
pub(crate) fn lift_over_ground_decor(
    key: DrawKey,
    feet_elevation: f64,
    decor: impl IntoIterator<Item = (WorldCoord, f64)>,
    tile_height: f64,
) -> DrawKey {
    let mut lifted = key;
    for (cell, elevation) in decor {
        if elevation > feet_elevation + 1e-6 {
            continue;
        }
        let rock = scene_key(
            f64::from(cell.x) + 0.5,
            f64::from(cell.y) + 0.5,
            elevation,
            ENTITY_LAYER,
            tile_height,
        );
        if iso::scene_order::compare_draw_keys(&rock, &lifted).is_ge() {
            lifted = DrawKey {
                depth: rock.depth,
                layer: ENTITY_LAYER + 1,
            };
        }
    }
    lifted
}

/// How many columns past its anchor the longest footprint reaches (a 2-tile grove: 1).
pub(crate) const FOOTPRINT_REACH: i32 = 1;

/// How far short of a covering cell's key a held figure stops: below the smallest real step
/// between two keys (one column along `x`), above any `FIGURE_NUDGE`.
pub(crate) const COVER_GAP: f64 = 1e-5;

/// Keeps a lift over ground decor from carrying the figure past what really stands in front
/// of it. A rock two diagonals ahead sorts after the trees one diagonal ahead, so lifting the
/// figure past the rock would also draw it over those trees (or one cell of a grove or palm
/// grove), or over the ledge of a higher level in front (see `ledge_cover`). `cover` gives
/// the key of everything around the figure that must keep covering it; the figure stops just
/// short of the first one it would otherwise pass, never below `key`. A small rock may then
/// overlap the figure, which beats a figure drawn over a tree or a cliff.
pub(crate) fn hold_behind_cover(
    key: DrawKey,
    lifted: DrawKey,
    cover: impl IntoIterator<Item = DrawKey>,
) -> DrawKey {
    let mut held = lifted;
    for block in cover {
        if iso::scene_order::compare_draw_keys(&block, &key).is_le()
            || iso::scene_order::compare_draw_keys(&block, &held).is_gt()
        {
            continue;
        }
        if block.depth - COVER_GAP <= key.depth {
            return key;
        }
        held = DrawKey {
            depth: block.depth - COVER_GAP,
            ..held
        };
    }
    held
}

/// The cover key of something standing on `cell` at `elevation` (a tree, a building).
pub(crate) fn standing_cover(cell: WorldCoord, elevation: f64, tile_height: f64) -> DrawKey {
    scene_key(
        f64::from(cell.x) + 0.5,
        f64::from(cell.y) + 0.5,
        elevation,
        ENTITY_LAYER,
        tile_height,
    )
}

/// The cover key of the column on `cell`, whose top is at `top`, against a figure whose feet
/// are at `feet`: the lowest of its terrain blocks that rises above the feet, or `None` when
/// the column is not higher than the feet. A figure down on the beach with a rock in front is
/// lifted past the rock, which would also carry it past the grass ledge one level up between
/// them; this keeps the ledge in front of it. Level ground never counts, so the lift still
/// clears the rock there.
pub(crate) fn ledge_cover(
    cell: WorldCoord,
    top: i32,
    feet: f64,
    tile_height: f64,
) -> Option<DrawKey> {
    let lowest_above = (feet.floor() as i32 + 1).min(top);
    (f64::from(top) > feet + 1e-6).then(|| {
        ground_key(
            f64::from(cell.x) + 0.5,
            f64::from(cell.y) + 0.5,
            f64::from(lowest_above),
            TERRAIN_LAYER,
            tile_height,
        )
    })
}

/// How far a figure's key moves per block it stands off its column's centre: far below every
/// step between two real keys, so it only ever settles a tie between two figures.
pub(crate) const FIGURE_NUDGE: f64 = 1e-6;

/// Settles the order of two walking figures (the player, the NPCs) that share a column, and
/// so its depth and layer: the one nearer the camera (the smaller `x + y`) draws after. A key
/// lifted over ground decor only moves forward, so it never slips back behind the rock.
pub(crate) fn nudge_figure_key(
    key: DrawKey,
    position: GridPoint,
    column: WorldCoord,
    lifted: bool,
) -> DrawKey {
    let ahead = f64::from(column.x + column.y) - (position.x + position.y);
    let nudge = if lifted { 1.0 + ahead } else { ahead };
    DrawKey {
        depth: key.depth + FIGURE_NUDGE * nudge,
        ..key
    }
}

/// Which layer the player draws in over the column it stands on.
pub(crate) fn player_layer(position: GridPoint, column: WorldCoord) -> i32 {
    if position.x + position.y > f64::from(column.x) + f64::from(column.y) {
        PLAYER_BEHIND_LAYER
    } else {
        PLAYER_FRONT_LAYER
    }
}

/// Projects the point where the player's feet meet the top of its current column.
pub(crate) fn player_feet(
    position: GridPoint,
    elevation: f64,
    projection: ProjectionConfig,
) -> ScreenPoint {
    let projected = project_block(
        GridPoint {
            x: position.x + 0.5,
            y: position.y + 0.5,
        },
        elevation,
        projection,
    );
    ScreenPoint {
        x: projected.screen_x,
        y: projected.screen_y,
    }
}

/// Scales the player artwork about its feet, so its contact point never slides across the ground.
pub(crate) fn scale_player_layout(
    layout: SpriteLayout,
    feet: ScreenPoint,
    scale: BodyScale,
) -> SpriteLayout {
    let width = layout.width * scale.x;
    let height = layout.height * scale.y;
    SpriteLayout {
        x: feet.x + (layout.x - feet.x) * scale.x,
        y: feet.y + (layout.y + layout.height - feet.y) * scale.y - height,
        width,
        height,
    }
}

/// An entity's sprite as the scene lays it out: the rectangle of its artwork and the cells of
/// its footprint, each drawn as a band with a key of its own.
#[derive(Clone, Copy)]
pub(crate) struct StandingSprite<'a> {
    pub(crate) layout: SpriteLayout,
    /// Where the artwork is solid inside that rectangle, when the atlas measured it.
    pub(crate) mask: Option<&'a CoverMask>,
    /// The centre of the footprint's first cell, in the grid.
    pub(crate) cell: (f64, f64),
    pub(crate) elevation: f64,
    /// Where that first cell's ground is on screen.
    pub(crate) anchor: ScreenPoint,
    /// The screen step from one cell of the footprint to the next.
    pub(crate) step: (f64, f64),
    pub(crate) cells: i32,
    pub(crate) along_y: bool,
}

impl StandingSprite<'_> {
    /// The centre of the `index`-th cell of the footprint, in the grid.
    pub(crate) fn cell_at(&self, index: i32) -> (f64, f64) {
        if self.along_y {
            (self.cell.0, self.cell.1 + f64::from(index))
        } else {
            (self.cell.0 + f64::from(index), self.cell.1)
        }
    }

    /// Whether this sprite hides `player`: one of its cells is drawn after the player and the
    /// part of the artwork standing on that cell lies over the player's box. Without a mask
    /// the artwork is taken to fill its rectangle.
    pub(crate) fn hides(&self, player: &Occludee, tile_height: f64) -> bool {
        if cover_share(player.area, self.layout) <= 0.0 {
            return false;
        }
        (0..self.cells).any(|index| {
            let (x, y) = self.cell_at(index);
            let key = scene_key(x, y, self.elevation, ENTITY_LAYER, tile_height);
            let area = if self.cells == 1 {
                Some(self.layout)
            } else {
                footprint_band(
                    self.layout,
                    self.anchor,
                    self.step,
                    index,
                    self.cells,
                    BAND_BLEED,
                )
                .and_then(|band| bounding_layout(band.corners()))
            };
            area.is_some_and(|area| {
                let share = match self.mask {
                    Some(mask) => mask.share_over(player.area, self.layout, area),
                    None => cover_share(player.area, area),
                };
                player.hidden_by(key, share)
            })
        })
    }
}

/// What a frame's scene pass measured.
pub(crate) struct SceneStats {
    pub(crate) chunks_drawn: usize,
    pub(crate) sprites: usize,
}

fn screen_point(point: GridPoint, projection: ProjectionConfig) -> Vec2 {
    let screen = project_grid_point(point, projection);
    vec2(screen.x as f32, screen.y as f32)
}

fn draw_grid(projection: ProjectionConfig, centre: WorldCoord) {
    let color = Color::from_rgba(96, 142, 161, 130);
    for x in centre.x - 3..=centre.x + 2 {
        for y in centre.y - 3..=centre.y + 2 {
            let corner = screen_point(
                GridPoint {
                    x: x as f64,
                    y: y as f64,
                },
                projection,
            );
            let along_x = screen_point(
                GridPoint {
                    x: (x + 1) as f64,
                    y: y as f64,
                },
                projection,
            );
            let along_y = screen_point(
                GridPoint {
                    x: x as f64,
                    y: (y + 1) as f64,
                },
                projection,
            );
            draw_line(corner.x, corner.y, along_x.x, along_x.y, 1.0, color);
            draw_line(corner.x, corner.y, along_y.x, along_y.y, 1.0, color);
        }
    }
}

/// The origin of the projection for this frame, from the camera, its current level and the
/// scene's tile metrics.
pub(crate) fn frame_projection(
    camera: Camera,
    level: f64,
    width: f32,
    height: f32,
    metrics: SceneMetrics,
) -> ProjectionConfig {
    preview_projection(
        f64::from(width / 2.0) - (camera.x - camera.y) * (metrics.tile_width / 2.0),
        f64::from(height / 2.0 + 50.0)
            + (camera.x + camera.y) * (metrics.tile_height / 2.0)
            + level * metrics.elevation_step,
        metrics,
    )
}

impl Game {
    /// Draws the cloud shadows over the finished scene, under the HUD.
    pub(crate) fn draw_clouds(&mut self, frame_ms: f64, projection: &ProjectionConfig) {
        if let Some(clouds) = self.clouds.as_mut() {
            clouds.advance(frame_ms);
            clouds.draw(
                (projection.origin_x, projection.origin_y),
                (projection.tile_width, projection.tile_height),
                (f64::from(screen_width()), f64::from(screen_height())),
            );
        }
    }

    /// This frame's sprites: terrain and baked shadows, entities and their reflections, the
    /// player and the dust. Reuses the draw queue; nothing here touches the world.
    pub(crate) fn collect_scene(&mut self, view: &FrameView) -> SceneStats {
        let projection = view.projection;

        self.draws.clear();
        if !self.show_terrain {
            draw_grid(
                projection,
                WorldCoord {
                    x: self.player.x.floor() as i32,
                    y: self.player.y.floor() as i32,
                },
            );
        }

        self.occlusion.begin(view.frame_ms);
        let xray = PLAYER_XRAY && self.player.motion != iso::player::PlayerMotionType::Gathering;
        let player = xray.then(|| self.player_cover(view)).flatten();
        let water = WaterField::from_chunks(
            view.culled
                .iter()
                .filter(|coord| self.manager.is_visible(**coord))
                .filter_map(|coord| self.manager.terrain_chunk(*coord)),
        );
        self.fire_spots.clear();
        self.effect_spots.clear();
        self.market_marks.clear();
        let chunks_drawn = self.collect_world(view, player, &water);
        let moved = self.collect_player(view, &water);
        self.collect_npcs(view, &water);
        self.collect_drops(view);
        self.collect_dust(view, moved);
        self.collect_particles(view);
        self.collect_fires(view);
        self.update_soundscape(view.frame_ms);

        SceneStats {
            chunks_drawn,
            sprites: self.draws.len(),
        }
    }

    /// What has to stay visible this frame: the player's box at rest, standing where it is
    /// drawn, and the key it sorts by. The box is the idle pose's whatever pose is showing,
    /// so a stride or a lean never flickers what fades.
    fn player_cover(&self, view: &FrameView) -> Option<Occludee> {
        let projection = view.projection;
        let rp = &view.rp;
        let ink = self
            .atlas
            .sheet(PLAYER_IDLE_SHEET)
            .map(|sheet| sheet.ink)
            .or(self.player_asset.map(|asset| asset.ink))?
            .scaled(PLAYER_SCALE);
        let position = GridPoint { x: rp.x, y: rp.y };
        let feet = player_feet(position, rp.elevation + rp.height, projection);
        Some(Occludee {
            area: ink_layout(feet, ink, projection.tile_width),
            key: self.player_draw_key(view),
        })
    }

    /// Where the player's chest is on screen this frame: the point a pick-up flies from.
    pub(crate) fn player_chest(&self, view: &FrameView) -> ScreenPoint {
        let rp = &view.rp;
        let feet = player_feet(
            GridPoint { x: rp.x, y: rp.y },
            rp.elevation + rp.height,
            view.projection,
        );
        ScreenPoint {
            x: feet.x,
            y: feet.y - view.projection.tile_height * 0.9,
        }
    }

    /// The key the player's body sorts by: see `figure_draw_key`.
    fn player_draw_key(&self, view: &FrameView) -> DrawKey {
        let rp = &view.rp;
        self.figure_draw_key(
            GridPoint { x: rp.x, y: rp.y },
            rp.elevation,
            view.projection.tile_height,
        )
    }

    /// The key a walking figure (the player or an NPC) sorts by: its column and half, lifted
    /// past the ground decor around it (see `lift_over_ground_decor`), so a small rock never
    /// covers it, and nudged by where it stands in its column (see `nudge_figure_key`), so two
    /// figures side by side draw in the order they stand in.
    fn figure_draw_key(&self, position: GridPoint, elevation: f64, tile_height: f64) -> DrawKey {
        let column = get_player_column(position);
        let key = player_key(
            column,
            elevation,
            player_layer(position, column),
            tile_height,
        );
        let near =
            |cell: WorldCoord| (cell.x - column.x).abs() <= 1 && (cell.y - column.y).abs() <= 1;
        // A footprint runs +x or +y from its anchor, so one that reaches the 3×3 around the
        // figure is anchored at most `FOOTPRINT_REACH` columns further back.
        let mut chunks = Vec::new();
        for dy in -1 - FOOTPRINT_REACH..=1 {
            for dx in -1 - FOOTPRINT_REACH..=1 {
                let chunk = iso::grid::to_chunk_coord(WorldCoord {
                    x: column.x + dx,
                    y: column.y + dy,
                });
                if !chunks.contains(&chunk) {
                    chunks.push(chunk);
                }
            }
        }
        let mut decor = Vec::new();
        let mut cover = Vec::new();
        for chunk in chunks {
            let Some(entities) = self.manager.entities_chunk(chunk) else {
                continue;
            };
            for entity in entities {
                let base = f64::from(entity.elevation());
                if entity.draw_under_player() {
                    let anchor = WorldCoord {
                        x: entity.x(),
                        y: entity.y(),
                    };
                    if near(anchor) {
                        decor.push((anchor, base));
                    }
                    continue;
                }
                let along_y = entity.length_axis() == Some(EntityLengthAxis::Y);
                for index in 0..entity.length().max(1) {
                    let cell = if along_y {
                        WorldCoord {
                            x: entity.x(),
                            y: entity.y() + index,
                        }
                    } else {
                        WorldCoord {
                            x: entity.x() + index,
                            y: entity.y(),
                        }
                    };
                    if near(cell) {
                        cover.push(standing_cover(cell, base, tile_height));
                    }
                }
            }
        }
        for dy in -1..=1 {
            for dx in -1..=1 {
                let cell = WorldCoord {
                    x: column.x + dx,
                    y: column.y + dy,
                };
                if let Some(top) = self.manager.column_at(cell.x, cell.y).map(|c| c.elevation)
                    && let Some(ledge) = ledge_cover(cell, top, elevation, tile_height)
                {
                    cover.push(ledge);
                }
            }
        }
        let lifted = lift_over_ground_decor(key, elevation, decor, tile_height);
        let held = hold_behind_cover(key, lifted, cover);
        nudge_figure_key(held, position, column, held != key)
    }

    /// Terrain and baked shadows of the visible chunks, then entities and their reflections.
    /// An entity's sprite that hides `player` is thinned out. Returns how many chunks were
    /// drawn.
    fn collect_world(
        &mut self,
        view: &FrameView,
        player: Option<Occludee>,
        water: &WaterField,
    ) -> usize {
        let projection = view.projection;
        self.wind_ms += view.frame_ms;
        let mut chunks_drawn = 0usize;
        for &coord in &view.culled {
            if !self.manager.is_visible(coord) {
                continue;
            }
            chunks_drawn += 1;
            if self.show_terrain
                && let Some(chunk) = self.manager.terrain_chunk(coord)
            {
                collect_terrain_sprites(
                    chunk,
                    projection,
                    &self.terrain_frames,
                    &self.terrain_look,
                    Surroundings {
                        height_at: |point| {
                            self.manager
                                .column_at(point.x, point.y)
                                .map(|c| c.elevation)
                        },
                        water_at: |x, y| water.at(x, y),
                        surface_at: |point| {
                            self.manager.column_at(point.x, point.y).map(|c| c.surface)
                        },
                    },
                    (f64::from(screen_width()), f64::from(screen_height())),
                    &mut self.draws,
                );
                if let Some(shadows) = self.shadows.as_ref() {
                    shadows.collect_ground(coord, chunk, projection, &mut self.draws);
                    shadows.collect_faces(coord, projection, &mut self.draws);
                }
            }
            let Some(entities) = self.manager.entities_chunk(coord) else {
                continue;
            };
            for entity in entities {
                let x = f64::from(entity.x()) + 0.5;
                let y = f64::from(entity.y()) + 0.5;
                let elevation = f64::from(entity.elevation());
                let mut ground = project_block(GridPoint { x, y }, elevation, projection);
                if let Some(shake) = self.impacts.shake_of(entity.id()) {
                    ground.screen_x += shake * projection.tile_width;
                }
                let entity_texture = self
                    .atlas
                    .asset(entity.texture_source())
                    .map_or(0, |asset| asset.texture);
                let Some((frame, layout)) = self.atlas.standing(
                    entity.texture_source(),
                    ScreenPoint {
                        x: ground.screen_x,
                        y: ground.screen_y,
                    },
                    projection.tile_width,
                ) else {
                    continue;
                };
                if !SpriteAtlas::on_screen(layout) {
                    continue;
                }
                if self.economy.is_merchant(entity.type_()) {
                    self.market_marks.push(crate::shop::MarketMark {
                        at: (
                            ground.screen_x as f32,
                            (ground.screen_y - projection.tile_height * MARK_HEIGHT) as f32,
                        ),
                        side: crate::shop::mark_side(projection.tile_width as f32),
                        near: self
                            .merchant
                            .as_ref()
                            .is_some_and(|merchant| merchant.id == entity.id()),
                    });
                }
                if entity.fire() {
                    self.fire_spots.push(FireSpot {
                        x,
                        y,
                        ground: elevation,
                    });
                }
                if let Some(kind) = entity.effect() {
                    self.effect_spots.push(EffectSpot {
                        kind,
                        at: FireSpot {
                            x,
                            y,
                            ground: elevation,
                        },
                    });
                }
                let cells = entity.length().max(1);
                let shade = self.shadows.as_ref().and_then(|shadows| {
                    let fade = shadows.chunk_fade(coord);
                    shadows
                        .shade_of(coord, (entity.x(), entity.y()))
                        .and_then(|grid| shadow_view::lattice_of(grid, fade))
                });
                let along_y = entity.length_axis() == Some(EntityLengthAxis::Y);
                let (half, quarter) = (projection.tile_width / 2.0, projection.tile_height / 2.0);
                let step = if along_y {
                    (-half, -quarter)
                } else {
                    (half, -quarter)
                };
                let anchor = ScreenPoint {
                    x: ground.screen_x,
                    y: ground.screen_y,
                };
                let sway_lean = (cells == 1).then(|| entity.sway()).flatten().map(|sway| {
                    let strength = self
                        .manager
                        .biomes()
                        .map_or(iso::wind::DEFAULT_WIND_STRENGTH, |world| {
                            world.biome(entity.x(), entity.y()).wind_strength
                        });
                    let offset = iso::wind::sway_offset(
                        sway,
                        iso::wind::sway_phase(entity.id()),
                        self.wind_ms,
                        strength,
                    );
                    (sway.cut, offset)
                });
                let standing = StandingSprite {
                    layout,
                    mask: self.atlas.cover_mask(entity.texture_source()),
                    cell: (x, y),
                    elevation,
                    anchor,
                    step,
                    cells,
                    along_y,
                };
                let covering = !entity.walkable()
                    && !entity.draw_under_player()
                    && player
                        .as_ref()
                        .is_some_and(|player| standing.hides(player, projection.tile_height));
                let opacity = self.occlusion.opacity(entity.id(), covering) as f32;
                for index in 0..cells {
                    let (cell_x, cell_y) = standing.cell_at(index);
                    let key = scene_key(
                        cell_x,
                        cell_y,
                        elevation,
                        ENTITY_LAYER,
                        projection.tile_height,
                    );
                    if let Some((cut, offset)) = sway_lean {
                        for piece in [
                            sway_band(layout, cut, 0.0, false),
                            sway_band(layout, cut, offset, true),
                        ] {
                            let Some(piece) = piece else { continue };
                            let draw = match &shade {
                                Some(shade) => SpriteDraw::shaded_band(
                                    key,
                                    entity_texture,
                                    frame,
                                    layout,
                                    shade.clone(),
                                    piece,
                                ),
                                None => SpriteDraw::band(
                                    key,
                                    entity_texture,
                                    frame,
                                    layout,
                                    Some(piece),
                                ),
                            };
                            self.draws.push(draw.see_through(opacity));
                        }
                        continue;
                    }
                    let Some(band) = footprint_band(layout, anchor, step, index, cells, BAND_BLEED)
                    else {
                        continue;
                    };
                    let draw = match (&shade, cells > 1) {
                        (Some(shade), false) => {
                            SpriteDraw::shaded(key, entity_texture, frame, layout, shade.clone())
                        }
                        (Some(shade), true) => SpriteDraw::shaded_band(
                            key,
                            entity_texture,
                            frame,
                            layout,
                            shade.clone(),
                            band,
                        ),
                        (None, cut) => SpriteDraw::band(
                            key,
                            entity_texture,
                            frame,
                            layout,
                            cut.then_some(band),
                        ),
                    };
                    self.draws.push(draw.see_through(opacity));
                }
                let mirrored = entity
                    .reflection_source()
                    .and_then(|source| {
                        let (drawn, laid) =
                            self.atlas.standing(source, anchor, projection.tile_width)?;
                        let texture = self.atlas.asset(source).map_or(0, |asset| asset.texture);
                        Some((texture, drawn, laid, Reflected::AsDrawn))
                    })
                    .unwrap_or_else(|| {
                        let turn_at =
                            (cells > 1).then(|| anchor.x + step.0 * f64::from(cells - 1) / 2.0);
                        (
                            entity_texture,
                            frame,
                            layout,
                            Reflected::Standing { turn_at },
                        )
                    });
                if !water.is_empty() {
                    collect_reflection(
                        ReflectionSprite {
                            texture: mirrored.0,
                            frame: mirrored.1,
                            layout: mirrored.2,
                            feet: anchor,
                            elevation,
                            lift: 0.0,
                        },
                        mirrored.3,
                        projection,
                        |x, y| water.at(x, y),
                        &mut self.draws,
                    );
                }
            }
        }
        chunks_drawn
    }

    /// The player's sprite: depth key, pose, artwork or fallback, its reflection and the
    /// shadow falling on it. Returns how far it moved this frame.
    fn collect_player(&mut self, view: &FrameView, water: &WaterField) -> f64 {
        let projection = view.projection;
        let rp = &view.rp;
        let frame_ms = view.frame_ms;

        let feet = player_feet(
            GridPoint { x: rp.x, y: rp.y },
            rp.elevation + rp.height,
            projection,
        );
        let column = get_player_column(GridPoint { x: rp.x, y: rp.y });
        let key = self.player_draw_key(view);
        let ground_feet = player_feet(GridPoint { x: rp.x, y: rp.y }, rp.elevation, projection);
        let phase = self
            .shadows
            .as_ref()
            .map(crate::lighting::shadow_view::ShadowScene::phase)
            .unwrap_or_else(|| iso::lighting::phase_at(self.clock.tick));
        let shadow = player_shadow(ground_feet, rp.height, projection, phase.light());
        let outline = shadow_clip::sheared_ellipse(
            shadow.centre,
            shadow.width,
            shadow.height,
            shadow.shear,
            20,
        );
        let clip = shadow_clip::ground_diamonds(&outline, rp.elevation, projection, |x, y| {
            self.manager.column_at(x, y).map(|c| c.elevation)
        });
        self.draws.push(SpriteDraw::ground_ellipse(
            player_key(
                column,
                rp.elevation,
                shadow_view::GROUND_SHADOW_LAYER,
                projection.tile_height,
            ),
            shadow.centre,
            shadow.width,
            shadow.height,
            shadow.alpha,
            shadow.shear,
            clip,
        ));
        let flip = self.flip.advance(FlipMoment {
            jumps: self.player.feedback.jumps,
            landings: self.player.feedback.landings,
            air_jump: self.player.feedback.air_jump,
            elapsed_ms: frame_ms,
        });
        let climbing = get_player_climb_progress(&self.player, self.stepper.interpolation_alpha());
        let moved = (rp.x - self.drawn_at.0).hypot(rp.y - self.drawn_at.1);
        let struck = self.struck_target();
        // Swinging a tool, the player strikes with the chop sheet of the one it holds (its right
        // hand, always); with bare hands, or a tool whose sheet is missing, it punches.
        let chop = struck.as_ref().and_then(|target| {
            let tool = iso::harvest::tool_in_hand(&target.blueprint, &self.carried, &self.items)?;
            let source = chop_sheet(&tool.id);
            let columns = self.atlas.sheet(&source)?.columns();
            Some((source, columns as i32))
        });
        let gather = struck.as_ref().map(|_| {
            let alpha = self.stepper.interpolation_alpha();
            let swing = (f64::from(self.harvester.swing()) + alpha)
                / f64::from(iso::harvest::HARVEST_STRIKE_TICKS);
            // The gather sheet holds two blows, one with each fist: odd blows take its second
            // half. A blow counts in `strikes` once it lands, so one past its landing is still it.
            let landed = u64::from(self.harvester.swing() >= iso::harvest::HARVEST_STRIKE_AT);
            let blow = self.harvester.strikes().wrapping_sub(landed) % 2;
            if chop.is_some() {
                swing
            } else {
                (blow as f64 + swing) / 2.0
            }
        });
        let pose = self.animation.advance(
            PlayerMoment {
                climbing,
                motion: self.player.motion,
                direction: match &struck {
                    Some(target) => GridPoint {
                        x: f64::from(target.anchor.x) - self.player.x,
                        y: f64::from(target.anchor.y) - self.player.y,
                    },
                    None => self
                        .player
                        .climb
                        .as_ref()
                        .map_or(self.player.walk, |climb| climb.direction),
                },
                gather,
                moved,
                jump_phase: get_player_jump_phase(&self.player),
                flip,
                elapsed_ms: frame_ms,
            },
            crate::player::player_view::PlayerSheets {
                gather_poses: chop
                    .as_ref()
                    .map(|(_, columns)| *columns)
                    .or(self.sheets.gather_poses),
                ..self.sheets
            },
        );
        let velocity = self.player.velocity;
        let previous = self.player.previous.velocity;
        let body = self.body.advance(BodyMoment {
            motion: self.player.motion,
            speed: velocity.x.hypot(velocity.y),
            velocity,
            acceleration: GridPoint {
                x: velocity.x - previous.x,
                y: velocity.y - previous.y,
            },
            skidding: iso::player::physics::is_player_skidding(&self.player),
            walked: self.animation.walked(),
            vertical_speed: self.player.vertical_speed,
            climbing,
            elapsed_ms: frame_ms,
            jumps: self.player.feedback.jumps,
            landings: self.player.feedback.landings,
            impact: self.player.feedback.impact,
        });
        self.drawn_at = (rp.x, rp.y);
        let sheet = self.atlas.sheet(match pose.sheet {
            PlayerSheet::Walk => PLAYER_WALK_SHEET,
            PlayerSheet::Idle => PLAYER_IDLE_SHEET,
            PlayerSheet::Jump => PLAYER_JUMP_SHEET,
            PlayerSheet::Climb => PLAYER_CLIMB_SHEET,
            PlayerSheet::Swim => PLAYER_SWIM_SHEET,
            PlayerSheet::Flip => PLAYER_FLIP_SHEET,
            PlayerSheet::Gather => chop
                .as_ref()
                .map_or(PLAYER_GATHER_SHEET, |(source, _)| source.as_str()),
        });
        let drawn = match (sheet, self.player_asset) {
            (Some(sheet), _) => Some((
                sheet.texture,
                sheet.frame(pose.facing, pose.pose),
                sheet.ink.scaled(PLAYER_SCALE),
            )),
            (None, Some(asset)) => {
                Some((asset.texture, asset.frame, asset.ink.scaled(PLAYER_SCALE)))
            }
            (None, None) => None,
        };
        match drawn {
            Some((texture, frame, ink)) => {
                let layout = scale_player_layout(
                    ink_layout(feet, ink, projection.tile_width),
                    feet,
                    body.scale,
                );
                let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
                // Upright, the body is the rectangle it has always been; leant or turned, it is
                // drawn into a quad of its own, which costs a mesh instead of a textured rect.
                let upright = body.tilt == 0.0 && body.turned == 0.0;
                let quad = body_quad(layout, (feet.x, feet.y), body.tilt, body.turned, box_height);
                let shade = self.shadows.as_ref().and_then(|shadows| {
                    let receiver = shadow_view::receiver_of(
                        layout,
                        feet,
                        (rp.x + 0.5, rp.y + 0.5),
                        rp.elevation + rp.height,
                    );
                    let home = iso::grid::to_chunk_coord(WorldCoord {
                        x: receiver.foot.0.floor() as i32,
                        y: receiver.foot.1.floor() as i32,
                    });
                    let fade = shadows.chunk_fade(home);
                    shadows
                        .shade_moving(&self.manager, &receiver)
                        .and_then(|grid| shadow_view::lattice_of(&grid, fade))
                });
                if !water.is_empty() {
                    collect_reflection(
                        ReflectionSprite {
                            texture,
                            frame,
                            layout,
                            feet,
                            elevation: rp.elevation + rp.height,
                            lift: rp.height,
                        },
                        Reflected::Standing { turn_at: None },
                        projection,
                        |x, y| water.at(x, y),
                        &mut self.draws,
                    );
                }
                let mut sprite = match (&shade, upright) {
                    (Some(shade), true) => {
                        SpriteDraw::shaded(key, texture, frame, layout, shade.clone())
                    }
                    (None, true) => SpriteDraw::whole(key, texture, frame, layout),
                    _ => SpriteDraw::leaning(key, texture, frame, quad, shade.clone()),
                };
                sprite.focus = Focus::Player;
                self.draws.push(sprite);
                // The jetpack on its back, from its own sheet: one column, laid out from its own
                // ink so it lands right whatever sheet the body is drawn from, and drawn just
                // after the body. Swimming it is hidden: the pack has no pose lying down.
                let pack = (self.player.jetpack && self.player.swim.is_none())
                    .then(|| self.atlas.sheet(PLAYER_JETPACK_SHEET))
                    .flatten()
                    .map(|sheet| {
                        (
                            sheet.texture,
                            sheet.frame(pose.facing, 0),
                            sheet.ink.scaled(PLAYER_SCALE),
                        )
                    });
                if let Some((pack_texture, pack_frame, pack_ink)) = pack {
                    let pack_layout = scale_player_layout(
                        ink_layout(feet, pack_ink, projection.tile_width),
                        feet,
                        body.scale,
                    );
                    let pack_quad = body_quad(
                        pack_layout,
                        (feet.x, feet.y),
                        body.tilt,
                        body.turned,
                        box_height,
                    );
                    let pack_key = DrawKey {
                        depth: key.depth + PLAYER_JETPACK_DEPTH,
                        layer: key.layer,
                    };
                    let mut sprite = match (&shade, upright) {
                        (Some(shade), true) => SpriteDraw::shaded(
                            pack_key,
                            pack_texture,
                            pack_frame,
                            pack_layout,
                            shade.clone(),
                        ),
                        (None, true) => {
                            SpriteDraw::whole(pack_key, pack_texture, pack_frame, pack_layout)
                        }
                        _ => SpriteDraw::leaning(
                            pack_key,
                            pack_texture,
                            pack_frame,
                            pack_quad,
                            shade.clone(),
                        ),
                    };
                    sprite.focus = Focus::Player;
                    self.draws.push(sprite);
                }
            }
            None => draw_circle(feet.x as f32, feet.y as f32, 12.0, GOLD),
        }

        moved
    }

    /// The characters on show: each one's ground shadow, its pose off the walk, idle, climb
    /// or jump sheet, the shadows falling on it and its reflection, laid out like the player's.
    /// The heaps of items on the ground: each one tossed out of what dropped it, then bobbing
    /// over a small shadow of its own, sorted with the figures by where it lies.
    fn collect_drops(&mut self, view: &FrameView) {
        let projection = view.projection;
        if self.drop_views.advance(view.frame_ms, self.drops.list()) > 0 {
            iso::services::AudioService::play(&mut self.audio, iso::services::SoundEvent::ItemDrop);
        }
        let light = self
            .shadows
            .as_ref()
            .map(crate::lighting::shadow_view::ShadowScene::phase)
            .unwrap_or_else(|| iso::lighting::phase_at(self.clock.tick))
            .light();
        let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
        for drop in self.drops.list() {
            let column = get_player_column(drop.at);
            if !self.manager.is_visible(iso::grid::to_chunk_coord(column)) {
                continue;
            }
            // A voxel piece is drawn with its own sprite, a heap with its item's.
            let piece_source = drop
                .piece
                .as_ref()
                .map(|piece| format!("/assets/{}.png", piece.sprite));
            let Some(sprite) = piece_source.as_deref().or_else(|| {
                self.items
                    .item(&drop.item)
                    .and_then(|item| item.sprite.as_deref())
            }) else {
                continue;
            };
            let pose = crate::harvest::drop_view::toss(self.drop_views.age(drop.id), drop);
            let ground = player_feet(pose.at, drop.elevation, projection);
            // A wide piece's sprite was rendered moved off its foot: its foot goes back by that.
            let foot = drop.piece.as_ref().map_or(ground, |piece| {
                player_feet(
                    GridPoint {
                        x: pose.at.x - piece.shift[0],
                        y: pose.at.y - piece.shift[1],
                    },
                    drop.elevation,
                    projection,
                )
            });
            let Some((frame, mut layout)) =
                self.atlas.standing(sprite, foot, projection.tile_width)
            else {
                continue;
            };
            layout.y -= pose.lift * box_height;
            if !SpriteAtlas::on_screen(layout) {
                continue;
            }
            let texture = self.atlas.asset(sprite).map_or(0, |asset| asset.texture);
            let shadow = crate::npc::npc_view::scaled_shadow(
                player_shadow(ground, pose.lift, projection, light),
                DROP_SHADOW_SCALE,
            );
            let outline = shadow_clip::sheared_ellipse(
                shadow.centre,
                shadow.width,
                shadow.height,
                shadow.shear,
                16,
            );
            let clip =
                shadow_clip::ground_diamonds(&outline, drop.elevation, projection, |x, y| {
                    self.manager.column_at(x, y).map(|c| c.elevation)
                });
            self.draws.push(SpriteDraw::ground_ellipse(
                player_key(
                    column,
                    drop.elevation,
                    shadow_view::GROUND_SHADOW_LAYER,
                    projection.tile_height,
                ),
                shadow.centre,
                shadow.width,
                shadow.height,
                shadow.alpha,
                shadow.shear,
                clip,
            ));
            let key = self.figure_draw_key(pose.at, drop.elevation, projection.tile_height);
            self.draws
                .push(SpriteDraw::whole(key, texture, frame, layout));
        }
    }

    fn collect_npcs(&mut self, view: &FrameView, water: &WaterField) {
        let projection = view.projection;
        let alpha = self.stepper.interpolation_alpha();
        let phase = self
            .shadows
            .as_ref()
            .map(crate::lighting::shadow_view::ShadowScene::phase)
            .unwrap_or_else(|| iso::lighting::phase_at(self.clock.tick));
        self.npc_views.begin();
        for npc in self.npcs.iter() {
            let rp = npc.render_pose(alpha);
            let at = GridPoint { x: rp.x, y: rp.y };
            let column = get_player_column(at);
            if !self.manager.is_visible(iso::grid::to_chunk_coord(column)) {
                continue;
            }
            let feet = player_feet(at, rp.elevation + rp.height, projection);
            let art = crate::game::config::npc_art(npc.kind);
            let sheets = self.npc_sheets.of(npc.kind);
            let Some(idle) = self.atlas.sheet(art.idle) else {
                continue;
            };
            let look = iso::npc::npc_look(npc.kind, npc.id);
            let scale = look.scale;
            let ink = idle.ink.scaled(scale);
            if !SpriteAtlas::on_screen(ink_layout(feet, ink, projection.tile_width)) {
                continue;
            }
            let pose = self.npc_views.advance(npc, at, view.frame_ms, sheets);
            let Some(sheet) = self.atlas.sheet(match pose.sheet {
                PlayerSheet::Walk => art.walk,
                PlayerSheet::Jump => art.jump.unwrap_or(art.idle),
                _ => art.idle,
            }) else {
                continue;
            };
            let (texture, frame) = (sheet.texture, sheet.frame(pose.facing, pose.pose));
            let layout = ink_layout(feet, sheet.ink.scaled(scale), projection.tile_width);
            let key = self.figure_draw_key(at, rp.elevation, projection.tile_height);
            let ground_feet = player_feet(at, rp.elevation, projection);
            let shadow = crate::npc::npc_view::scaled_shadow(
                player_shadow(ground_feet, rp.height, projection, phase.light()),
                look.scale * art.shadow_scale,
            );
            let outline = shadow_clip::sheared_ellipse(
                shadow.centre,
                shadow.width,
                shadow.height,
                shadow.shear,
                20,
            );
            let clip = shadow_clip::ground_diamonds(&outline, rp.elevation, projection, |x, y| {
                self.manager.column_at(x, y).map(|c| c.elevation)
            });
            self.draws.push(SpriteDraw::ground_ellipse(
                player_key(
                    column,
                    rp.elevation,
                    shadow_view::GROUND_SHADOW_LAYER,
                    projection.tile_height,
                ),
                shadow.centre,
                shadow.width,
                shadow.height,
                shadow.alpha,
                shadow.shear,
                clip,
            ));
            let shade = self.shadows.as_ref().and_then(|shadows| {
                let receiver = shadow_view::receiver_of(
                    layout,
                    feet,
                    (at.x + 0.5, at.y + 0.5),
                    rp.elevation + rp.height,
                );
                let home = iso::grid::to_chunk_coord(WorldCoord {
                    x: receiver.foot.0.floor() as i32,
                    y: receiver.foot.1.floor() as i32,
                });
                let fade = shadows.chunk_fade(home);
                shadows
                    .shade_moving(&self.manager, &receiver)
                    .and_then(|grid| shadow_view::lattice_of(&grid, fade))
            });
            if !water.is_empty() {
                collect_reflection(
                    ReflectionSprite {
                        texture,
                        frame,
                        layout,
                        feet,
                        elevation: rp.elevation + rp.height,
                        lift: rp.height,
                    },
                    Reflected::Standing { turn_at: None },
                    projection,
                    |x, y| water.at(x, y),
                    &mut self.draws,
                );
            }
            let draw = match shade {
                Some(shade) => SpriteDraw::shaded(key, texture, frame, layout, shade),
                None => SpriteDraw::whole(key, texture, frame, layout),
            };
            self.draws
                .push(draw.tinted_by(crate::npc::npc_view::coat_color(look.tint)));
        }
        self.npc_views.finish();
    }

    /// The dust kicked up by the player's movement.
    fn collect_dust(&mut self, view: &FrameView, moved: f64) {
        let projection = view.projection;
        let rp = &view.rp;
        let frame_ms = view.frame_ms;

        let elevation_at =
            |x: i32, y: i32| self.manager.column_at(x, y).map(|c| f64::from(c.elevation));
        self.dust.advance(frame_ms);
        self.dust.react(
            &self.player,
            DustGround {
                feet: GridPoint { x: rp.x, y: rp.y },
                level: rp.elevation + rp.height,
                ground: rp.elevation,
                moved,
                facing: self.animation.facing(),
                elapsed_ms: frame_ms,
                tile_height: projection.tile_height,
            },
            &elevation_at,
        );
        self.impacts.advance(frame_ms);
        for burst in self.impacts.take_bursts() {
            let color = burst.color;
            let shape = match (burst.felled, color) {
                (true, Some(color)) => iso::harvest::felled_chips(color),
                (true, None) => iso::harvest::felled_chips(iso::player::DUST_COLORS.0),
                (false, color) => iso::harvest::strike_chips_of(color),
            };
            let feet = GridPoint { x: rp.x, y: rp.y };
            let at = iso::harvest::strike_point(burst.anchor, feet);
            let level = f64::from(burst.elevation) + iso::harvest::STRIKE_LIFT;
            self.dust.chip(
                shape,
                DustGround {
                    feet: at,
                    level,
                    ground: level,
                    moved: 0.0,
                    facing: self.animation.facing(),
                    elapsed_ms: frame_ms,
                    tile_height: projection.tile_height,
                },
                GridPoint {
                    x: feet.x - at.x,
                    y: feet.y - at.y,
                },
                &elevation_at,
            );
        }
        self.dust.collect(projection, &mut self.draws);
        self.debris.advance(frame_ms);
        self.debris
            .collect(projection, &self.atlas, &mut self.draws);
    }

    /// The flames, sparks and smoke of the fires in view, drawn like the dust: real time, in the
    /// scene's depth order.
    fn collect_fires(&mut self, view: &FrameView) {
        self.fire.update(view.frame_ms, &self.fire_spots);
        self.fire.collect(
            &self.fire_spots,
            self.wind_ms,
            view.projection,
            &mut self.draws,
        );
        self.emitters
            .update(view.frame_ms, self.wind_ms, &self.effect_spots);
        self.emitters.collect(
            &self.effect_spots,
            self.wind_ms,
            view.projection,
            &mut self.draws,
        );
    }

    /// The motes and fireflies adrift over the world, spawned and drawn like the dust:
    /// the phase and the ground decide what is airborne, the wind decides where it goes.
    fn collect_particles(&mut self, view: &FrameView) {
        let phase = self
            .phase_override
            .unwrap_or_else(|| iso::lighting::phase_at(self.clock.tick));
        let biomes = self.manager.biomes();
        let height_at =
            |x: i32, y: i32| self.manager.column_at(x, y).map(|c| f64::from(c.elevation));
        let surface_at = |x: i32, y: i32| self.manager.column_at(x, y).map(|c| c.surface);
        let wind_at = |x: i32, y: i32| {
            biomes.map_or(iso::wind::DEFAULT_WIND_STRENGTH, |world| {
                world.biome(x, y).wind_strength
            })
        };
        let env = SpawnEnv {
            center_x: self.player.x,
            center_y: self.player.y,
            phase,
            time_ms: self.wind_ms,
            height_at: &height_at,
            surface_at: &surface_at,
            wind_at: &wind_at,
        };
        self.particles.update(view.frame_ms, &env);
        self.particles.collect(view.projection, &mut self.draws);
    }
}

#[cfg(test)]
#[path = "scene.test.rs"]
mod tests;
