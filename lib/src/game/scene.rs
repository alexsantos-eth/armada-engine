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
use iso::scene_order::{DrawKey, PlayerSheet};
use macroquad::prelude::*;

use crate::assets::sprites::{SpriteAtlas, SpriteDraw, scene_key};
use crate::effects::ambient::SpawnEnv;
use crate::game::config::{
    BAND_BLEED, ENTITY_LAYER, PLAYER_BEHIND_LAYER, PLAYER_CLIMB_SHEET, PLAYER_FLIP_SHEET,
    PLAYER_FRONT_LAYER, PLAYER_IDLE_SHEET, PLAYER_JETPACK_DEPTH, PLAYER_JETPACK_SHEET,
    PLAYER_JUMP_SHEET, PLAYER_SCALE, PLAYER_SWIM_SHEET, PLAYER_WALK_SHEET, SceneMetrics,
};
use crate::game::frame::FrameView;
use crate::game::ground::water_cell;
use crate::game::state::Game;
use crate::lighting::shadow_view;
use crate::player::body_motion::{BodyMoment, BodyScale, body_quad};
use crate::player::dust_view::DustGround;
use crate::player::flip::FlipMoment;
use crate::player::player_shadow::player_shadow;
use crate::player::player_view::{PlayerMoment, jump_poses};
use crate::player::shadow_clip;
use crate::terrain::terrain_view_blocks::{Surroundings, collect_terrain_sprites};
use crate::water::reflection_view::{Reflected, ReflectionSprite, collect_reflection};

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
        jump_poses: atlas
            .sheet(PLAYER_JUMP_SHEET)
            .and_then(|sheet| jump_poses(sheet.poses(), sheet.columns())),
    }
}

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

        let chunks_drawn = self.collect_world(view);
        let moved = self.collect_player(view);
        self.collect_dust(view, moved);
        self.collect_particles(view);

        SceneStats {
            chunks_drawn,
            sprites: self.draws.len(),
        }
    }

    /// Terrain and baked shadows of the visible chunks, then entities and their reflections.
    /// Returns how many chunks were drawn.
    fn collect_world(&mut self, view: &FrameView) -> usize {
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
                        water_at: |x, y| water_cell(&self.manager, x, y),
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
                let ground = project_block(GridPoint { x, y }, elevation, projection);
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
                for index in 0..cells {
                    let (cell_x, cell_y) = if along_y {
                        (x, y + f64::from(index))
                    } else {
                        (x + f64::from(index), y)
                    };
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
                            match &shade {
                                Some(shade) => self.draws.push(SpriteDraw::shaded_band(
                                    key,
                                    entity_texture,
                                    frame,
                                    layout,
                                    shade.clone(),
                                    piece,
                                )),
                                None => self.draws.push(SpriteDraw::band(
                                    key,
                                    entity_texture,
                                    frame,
                                    layout,
                                    Some(piece),
                                )),
                            }
                        }
                        continue;
                    }
                    let Some(band) = footprint_band(layout, anchor, step, index, cells, BAND_BLEED)
                    else {
                        continue;
                    };
                    match (&shade, cells > 1) {
                        (Some(shade), false) => self.draws.push(SpriteDraw::shaded(
                            key,
                            entity_texture,
                            frame,
                            layout,
                            shade.clone(),
                        )),
                        (Some(shade), true) => self.draws.push(SpriteDraw::shaded_band(
                            key,
                            entity_texture,
                            frame,
                            layout,
                            shade.clone(),
                            band,
                        )),
                        (None, cut) => self.draws.push(SpriteDraw::band(
                            key,
                            entity_texture,
                            frame,
                            layout,
                            cut.then_some(band),
                        )),
                    }
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
                    |x, y| water_cell(&self.manager, x, y),
                    &mut self.draws,
                );
            }
        }
        chunks_drawn
    }

    /// The player's sprite: depth key, pose, artwork or fallback, its reflection and the
    /// shadow falling on it. Returns how far it moved this frame.
    fn collect_player(&mut self, view: &FrameView) -> f64 {
        let projection = view.projection;
        let rp = &view.rp;
        let frame_ms = view.frame_ms;

        let feet = player_feet(
            GridPoint { x: rp.x, y: rp.y },
            rp.elevation + rp.height,
            projection,
        );
        let column = get_player_column(GridPoint { x: rp.x, y: rp.y });
        let key = player_key(
            column,
            rp.elevation,
            player_layer(GridPoint { x: rp.x, y: rp.y }, column),
            projection.tile_height,
        );
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
        let pose = self.animation.advance(
            PlayerMoment {
                climbing,
                motion: self.player.motion,
                direction: self
                    .player
                    .climb
                    .as_ref()
                    .map_or(self.player.walk, |climb| climb.direction),
                moved,
                jump_phase: get_player_jump_phase(&self.player),
                flip,
                elapsed_ms: frame_ms,
            },
            self.sheets,
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
                    |x, y| water_cell(&self.manager, x, y),
                    &mut self.draws,
                );
                match (&shade, upright) {
                    (Some(shade), true) => self.draws.push(SpriteDraw::shaded(
                        key,
                        texture,
                        frame,
                        layout,
                        shade.clone(),
                    )),
                    (None, true) => self
                        .draws
                        .push(SpriteDraw::whole(key, texture, frame, layout)),
                    _ => self.draws.push(SpriteDraw::leaning(
                        key,
                        texture,
                        frame,
                        quad,
                        shade.clone(),
                    )),
                }
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
                    match (&shade, upright) {
                        (Some(shade), true) => self.draws.push(SpriteDraw::shaded(
                            pack_key,
                            pack_texture,
                            pack_frame,
                            pack_layout,
                            shade.clone(),
                        )),
                        (None, true) => self.draws.push(SpriteDraw::whole(
                            pack_key,
                            pack_texture,
                            pack_frame,
                            pack_layout,
                        )),
                        _ => self.draws.push(SpriteDraw::leaning(
                            pack_key,
                            pack_texture,
                            pack_frame,
                            pack_quad,
                            shade.clone(),
                        )),
                    }
                }
            }
            None => draw_circle(feet.x as f32, feet.y as f32, 12.0, GOLD),
        }

        moved
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
        self.dust.collect(projection, &mut self.draws);
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
