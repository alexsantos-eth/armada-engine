mod assets;
mod lighting;
mod perf;
mod player;
mod rendering;
mod save;
mod services;
mod terrain;
mod water;

use assets::sprites::{SpriteAtlas, SpriteDraw, draw_sorted, scene_key};
use iso::assets::{
    InkBox, SVG_BLOCK_HEIGHT, SVG_TILE_WIDTH, SpriteFrame, footprint_band, ink_layout,
};
use iso::camera::{
    CAMERA_LEVEL_SMOOTH_MS, Camera, CameraFocus, ScreenSize,
    visible_chunks as camera_visible_chunks,
};
use iso::entities::{EntityCatalogV2, EntityLengthAxis, validate_catalog};
use iso::grid::{WorldCoord, to_chunk_coord};
use iso::lighting::DAWN;
use iso::player::get_player_jump_phase;
use iso::player::physics::PlayerObstacle;
use iso::player::physics::get_player_climb_progress;
use iso::player::physics::{
    PlayerGround, create_player, find_player_spawn, get_player_column, get_player_render_position,
    jump_player, set_player_jump_held, set_player_run, step_player,
};
use iso::projection::{
    GridPoint, ProjectionConfig, ScreenPoint, project_block, project_grid_point,
};
use iso::scene_order::PlayerSheet;
use iso::services::{AudioService, InputService, NormalizedInput, SoundEvent, UiEvent, UiService};
use iso::simulation::FixedStepper;
use iso::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator, TerrainMaterial};
use iso::world::{ChunkManager, ChunkRadii};
use lighting::cloud_shadows::{CLOUD_SHADOW_SOURCE, CloudShadows};
use lighting::shadow_view::ShadowScene;
use lighting::shadow_view_atlas::ShadowAtlas;
use lighting::shadow_view_masks::SilhouetteMasks;
use macroquad::prelude::*;
use perf::{FrameSample, PerfLog};
use player::dust_view::{DustGround, DustPuffs};
use player::player_view::{PlayerAnimation, PlayerMoment, PlayerSheets, jump_poses};
use rendering::scene_material::SceneMaterial;
use save::{
    load_archive_into_manager, load_save, restore_archive, restore_discovered_from_archive,
    save_archive, sync_manager_to_archive,
};
use services::{MacroquadAudio, MacroquadInput, MacroquadUi};
use terrain::terrain_view_appearance::TerrainLook;
use terrain::terrain_view_blocks::{TerrainFrames, collect_terrain_sprites};
use water::reflection_view::{Reflected, WaterCell, collect_reflection};

fn window_conf() -> Conf {
    Conf {
        window_title: "Armada Engine".to_owned(),
        window_width: 960,
        window_height: 600,
        ..Default::default()
    }
}

/// Diagnostic centre of the world; the player spawns near here.
const PREVIEW_CENTRE: WorldCoord = WorldCoord { x: 16, y: 88 };
/// The scene's zoom: how wide one tile is drawn, in screen pixels. Everything else in the view
const PREVIEW_TILE_WIDTH: f64 = 280.0;
const PREVIEW_TILE_HEIGHT: f64 = PREVIEW_TILE_WIDTH / 2.0;
/// One level of elevation, in screen pixels: as tall as the artwork draws a block's body, so
const PREVIEW_ELEVATION_STEP: f64 = PREVIEW_TILE_WIDTH * SVG_BLOCK_HEIGHT / SVG_TILE_WIDTH;

/// How far each band of a multi-cell sprite reaches past its cut, in screen pixels.
const BAND_BLEED: f64 = 0.5;

/// Entities draw above the terrain of the same depth, and the player either side of them.
const ENTITY_LAYER: i32 = 3;
/// The player on the half of its column furthest from the camera: over the ground, under what
const PLAYER_BEHIND_LAYER: i32 = 2;
/// The player on the half of its column nearest the camera: over what stands there.
const PLAYER_FRONT_LAYER: i32 = 4;
/// How big the player is drawn, as a fraction of the size its artwork was drawn at: the same
const PLAYER_SCALE: f64 = 0.75;
/// Source path of the player's still figure in the asset manifest, drawn if a sheet is missing.
const PLAYER_SPRITE: &str = "/assets/player/block.svg";
/// The player's sheets of poses, in the manifest: walking, standing, jumping and climbing.
const PLAYER_WALK_SHEET: &str = "/assets/player-16/walk.svg";
const PLAYER_IDLE_SHEET: &str = "/assets/player-16/idle.svg";
const PLAYER_JUMP_SHEET: &str = "/assets/player-16/jump.svg";
const PLAYER_CLIMB_SHEET: &str = "/assets/player-16/climb.svg";
/// Extra view the chunk cull keeps around the screen, as a fraction of it.
const CHUNK_CULL_MARGIN: f64 = 0.0;

/// This view's projection with its origin at `(origin_x, origin_y)`: the tile size and the
fn preview_projection(origin_x: f64, origin_y: f64) -> ProjectionConfig {
    ProjectionConfig {
        tile_width: PREVIEW_TILE_WIDTH,
        tile_height: PREVIEW_TILE_HEIGHT,
        elevation_step: Some(PREVIEW_ELEVATION_STEP),
        origin_x,
        origin_y,
    }
}

/// The water of the cell `(x, y)`, or `None` where there is none: what a reflection asks the
fn water_cell(manager: &ChunkManager, x: i32, y: i32) -> Option<WaterCell> {
    let column = manager.column_at(x, y)?;
    if column.surface != TerrainMaterial::Water {
        return None;
    }
    Some(WaterCell {
        level: f64::from(column.elevation),
        elevation: f64::from(column.elevation),
    })
}

/// The player's artwork: its frame in the atlas and where that drawing belongs over the ground
#[derive(Clone, Copy)]
struct PlayerSprite {
    frame: SpriteFrame,
    ink: InkBox,
    /// Which of the atlas's textures that frame is cut from.
    texture: usize,
}

/// Where a manifest path is fetched from.
fn client_path(path: &str) -> String {
    if cfg!(target_arch = "wasm32") {
        format!("./{path}")
    } else {
        path.to_owned()
    }
}

/// How many poses each of the player's sheets holds, out of the atlas.
fn player_sheets(atlas: &SpriteAtlas) -> PlayerSheets {
    let columns = |source| atlas.sheet(source).map(|sheet| sheet.columns());
    PlayerSheets {
        walk_poses: columns(PLAYER_WALK_SHEET).map(|columns| columns as i32 - 1),
        idle_poses: columns(PLAYER_IDLE_SHEET).map(|columns| columns as i32),
        climb_poses: columns(PLAYER_CLIMB_SHEET).map(|columns| columns as i32),
        jump_poses: atlas
            .sheet(PLAYER_JUMP_SHEET)
            .and_then(|sheet| jump_poses(sheet.poses(), sheet.columns())),
    }
}

/// Which layer the player draws in over the column it stands on.
fn player_layer(position: GridPoint, column: WorldCoord) -> i32 {
    if position.x + position.y > f64::from(column.x) + f64::from(column.y) {
        PLAYER_BEHIND_LAYER
    } else {
        PLAYER_FRONT_LAYER
    }
}

/// Projects the point where the player's feet meet the top of its current column.
fn player_feet(position: GridPoint, elevation: f64, projection: ProjectionConfig) -> ScreenPoint {
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

/// How far this client streams chunks, below the shared defaults (1 / 2 / 3).
const CHUNK_RADII: ChunkRadii = ChunkRadii {
    load: 1,
    prefetch: 1,
    keep: 2,
};

/// Safety-net interval for the periodic save; the real save happens on quit and on request.
const AUTOSAVE_SECONDS: f64 = 120.0;

/// Wraps a `ChunkManager` so it satisfies `PlayerGround` for locomotion.
struct ChunkGround<'a> {
    manager: &'a ChunkManager,
}

impl PlayerGround for ChunkGround<'_> {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn> {
        self.manager.column_at(x, y)
    }
    fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle> {
        let coord = iso::grid::to_chunk_coord(iso::grid::WorldCoord { x, y });
        let Some(entities) = self.manager.entities_chunk(coord) else {
            return Vec::new();
        };
        entities
            .iter()
            .filter(|entity| {
                let axis = entity.length_axis().unwrap_or(EntityLengthAxis::X);
                let length = entity.length().max(1);
                (0..length).any(|i| {
                    let (cx, cy) = if axis == EntityLengthAxis::X {
                        (entity.x() + i, entity.y())
                    } else {
                        (entity.x(), entity.y() + i)
                    };
                    cx == x && cy == y
                })
            })
            .map(|entity| {
                let collision = entity.collision_at(x, y);
                PlayerObstacle {
                    walkable: entity.walkable(),
                    height: Some(entity.height() as f64),
                    elevation: Some(entity.elevation() as f64),
                    collision_at: Some(collision),
                }
            })
            .collect()
    }
    fn chunk_has(&self, coord: iso::grid::ChunkCoord) -> bool {
        self.manager.is_discovered(coord)
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    let catalog_json = include_str!("../../web/src/isometric/content/entities.v2.json");

    let manifest_json = include_str!("../content/assets.manifest.json");
    let manifest: iso::assets::AssetManifest =
        serde_json::from_str(manifest_json).expect("asset manifest is valid JSON");
    iso::assets::validate_manifest(&manifest).expect("asset manifest validates");
    let atlas_path = client_path(&manifest.atlas);
    let texture = load_texture(&atlas_path)
        .await
        .unwrap_or_else(|err| panic!("could not load the atlas at {atlas_path}: {err}"));
    let mut sheet_textures = Vec::new();
    let mut sheet_paths: Vec<&String> = manifest
        .entries
        .iter()
        .filter_map(|entry| entry.texture.as_ref())
        .collect();
    sheet_paths.sort();
    sheet_paths.dedup();
    for path in sheet_paths {
        let loaded = load_texture(&client_path(path)).await;
        match loaded {
            Ok(texture) => sheet_textures.push((path.clone(), texture)),
            Err(err) => eprintln!("warning: could not load the sheet at {path}: {err}"),
        }
    }
    let atlas = SpriteAtlas::new(texture, sheet_textures, &manifest);
    let mut clouds = match load_texture(&client_path(CLOUD_SHADOW_SOURCE)).await {
        Ok(texture) => Some(CloudShadows::new(texture)),
        Err(err) => {
            eprintln!("warning: could not load the cloud shadows at {CLOUD_SHADOW_SOURCE}: {err}");
            None
        }
    };
    let masks = SilhouetteMasks::load(&atlas_path, &manifest).await;
    if masks.is_none() {
        eprintln!("warning: could not read {atlas_path} for the shadow silhouettes; no shadows");
    }
    if !atlas.has_white_patch() {
        eprintln!(
            "warning: the atlas has no {}; the shadows still draw, but each one binds a texture \
             of its own and the scene is no longer one batch",
            crate::assets::sprites::WHITE_PATCH
        );
    }
    let shadow_atlas = ShadowAtlas::new();
    let material = match SceneMaterial::load(shadow_atlas.texture()) {
        Ok(material) => Some(material),
        Err(reason) => {
            eprintln!("warning: {reason}; se dibujara sin sombras horneadas");
            None
        }
    };
    let mut shadows = masks.filter(|_| material.is_some()).map(|masks| {
        ShadowScene::new(
            DAWN,
            masks,
            shadow_atlas,
            PREVIEW_TILE_WIDTH,
            PREVIEW_ELEVATION_STEP,
        )
    });
    let (terrain_frames, missing_terrain) = TerrainFrames::new(&atlas);
    for material in &missing_terrain {
        eprintln!("warning: the atlas has no block for {material:?}; it will not be drawn");
    }
    let terrain_config = TerrainConfig::default();
    let (terrain_look, missing_tops) = TerrainLook::new(terrain_config.seed, |source| {
        atlas
            .asset(source)
            .and_then(|asset| Some((asset.frame, asset.ink?)))
    });
    for source in &missing_tops {
        eprintln!("warning: the atlas has no measured artwork for {source}; it will not grow");
    }
    let catalog: EntityCatalogV2 =
        serde_json::from_str(catalog_json).expect("entity catalog is valid JSON");
    validate_catalog(&catalog).expect("entity catalog validates");

    let generator =
        TerrainGenerator::new(terrain_config).expect("default terrain configuration is valid");

    let mut manager = ChunkManager::with_radii(generator, catalog, CHUNK_RADII);

    let save = load_save().await;
    let mut archive = restore_archive(save);
    if archive.chunks().count() > 0 {
        for id in load_archive_into_manager(&mut manager, &archive) {
            eprintln!("warning: save refers to unknown entity blueprint {id}; skipped");
        }
    }

    let centre_chunk = to_chunk_coord(PREVIEW_CENTRE);
    manager.set_focus(vec![centre_chunk]);
    for _ in 0..20 {
        manager.tick();
    }

    let ground = ChunkGround { manager: &manager };
    let spawn = find_player_spawn(
        &ground,
        GridPoint {
            x: f64::from(PREVIEW_CENTRE.x),
            y: f64::from(PREVIEW_CENTRE.y),
        },
    );
    let mut player = create_player(
        &ground,
        GridPoint {
            x: spawn.x,
            y: spawn.y,
        },
    );

    let spawned = get_player_render_position(&player, 1.0);
    let mut camera_focus = CameraFocus::new(&spawned);
    let mut camera = Camera {
        x: spawned.x,
        y: spawned.y,
        zoom: 1.0,
    };

    let mut show_terrain = true;
    let mut last_save = get_time();
    let mut unsaved_changes = false;

    let player_asset = atlas.asset(PLAYER_SPRITE).and_then(|asset| {
        Some(PlayerSprite {
            frame: asset.frame,
            ink: asset.ink?,
            texture: asset.texture,
        })
    });
    if player_asset.is_none() {
        eprintln!("warning: the atlas has no measured player sprite at {PLAYER_SPRITE}");
    }
    let sheets = player_sheets(&atlas);
    if sheets.walk_poses.is_none() {
        eprintln!("warning: the atlas has no player sheets; the still figure will be drawn");
    }
    let mut animation = PlayerAnimation::default();
    let mut drawn_at = (spawned.x, spawned.y);
    let mut dust = DustPuffs::new();

    let mut draws: Vec<SpriteDraw> = Vec::new();

    let mut stepper = FixedStepper::default();

    prevent_quit();

    let mut perf = PerfLog::default();

    let mut audio = MacroquadAudio::default();
    let mut ui = MacroquadUi::default();

    loop {
        let frame_start = get_time();
        if is_key_pressed(KeyCode::T) {
            show_terrain = !show_terrain;
        }
        let save_requested = is_key_pressed(KeyCode::F5)
            || (is_key_pressed(KeyCode::S)
                && (is_key_down(KeyCode::LeftControl) || is_key_down(KeyCode::RightControl)));
        if save_requested {
            sync_manager_to_archive(&manager, &mut archive);
            save_archive(&archive);
            unsaved_changes = false;
            last_save = get_time();
        }

        let width = screen_width();
        let height = screen_height();

        let mut input_service = MacroquadInput;
        let input: NormalizedInput = input_service.poll();
        player.walk = input.walk;
        set_player_run(&mut player, input.run);

        if input.jump_pressed {
            jump_player(&mut player);
        }
        set_player_jump_held(&mut player, input.jump_held);

        let focus = to_chunk_coord(WorldCoord {
            x: player.x.floor() as i32,
            y: player.y.floor() as i32,
        });
        manager.set_single_focus(focus);

        let frame_ms = f64::from(get_frame_time()) * 1000.0;
        let ticks = u32::try_from(stepper.consume_frame(frame_ms)).unwrap_or(u32::MAX);
        if ticks > 0 {
            let jumps_before = player.feedback.jumps;
            let landings_before = player.feedback.landings;
            let mut ground = ChunkGround { manager: &manager };
            step_player(&mut player, &mut ground, ticks);
            if player.feedback.jumps > jumps_before {
                audio.play(SoundEvent::Jump);
            }
            if player.feedback.landings > landings_before {
                audio.play(SoundEvent::Land);
            }
        }

        let rp = get_player_render_position(&player, stepper.interpolation_alpha());

        camera.x = rp.x;
        camera.y = rp.y;
        let level = camera_focus.advance(&rp, player.motion, frame_ms, CAMERA_LEVEL_SMOOTH_MS);
        let projection = preview_projection(
            f64::from(width / 2.0) - (camera.x - camera.y) * (PREVIEW_TILE_WIDTH / 2.0),
            f64::from(height / 2.0 + 50.0)
                + (camera.x + camera.y) * (PREVIEW_TILE_HEIGHT / 2.0)
                + level * PREVIEW_ELEVATION_STEP,
        );

        let discovered = manager.tick();
        if !discovered.is_empty() {
            unsaved_changes = true;
            for id in restore_discovered_from_archive(&mut manager, &archive, &discovered) {
                ui.push(UiEvent::Message {
                    text: format!("partida guardada con una entidad desconocida: {id}"),
                });
            }
        }

        if let Some(stale) = manager.next_unload_candidate()
            && let Some(saved) = manager.unload_chunk(stale)
        {
            archive.put(saved);
            unsaved_changes = true;
        }

        let quitting = is_quit_requested();
        if unsaved_changes && (quitting || get_time() - last_save > AUTOSAVE_SECONDS) {
            sync_manager_to_archive(&manager, &mut archive);
            save_archive(&archive);
            unsaved_changes = false;
            last_save = get_time();
        }
        if quitting {
            return;
        }

        let after_simulation = get_time();

        let viewport = ScreenSize {
            width: f64::from(width),
            height: f64::from(height),
        };
        let culled = camera_visible_chunks(camera, viewport, projection, CHUNK_CULL_MARGIN);
        if let Some(shadows) = shadows.as_mut() {
            shadows.update(&manager, &culled);
        }

        let elevation = player.elevation.floor() as i32;

        clear_background(Color::from_rgba(21, 29, 42, 255));
        draw_rectangle_lines(16.0, 16.0, width - 32.0, height - 32.0, 2.0, SKYBLUE);

        draws.clear();
        if !show_terrain {
            draw_grid(
                projection,
                WorldCoord {
                    x: player.x.floor() as i32,
                    y: player.y.floor() as i32,
                },
            );
        }
        let mut chunks_drawn = 0usize;
        for &coord in &culled {
            if !manager.is_visible(coord) {
                continue;
            }
            chunks_drawn += 1;
            if show_terrain && let Some(chunk) = manager.terrain_chunk(coord) {
                collect_terrain_sprites(
                    chunk,
                    projection,
                    &terrain_frames,
                    &terrain_look,
                    |point| manager.column_at(point.x, point.y).map(|c| c.elevation),
                    &mut draws,
                );
                if let Some(shadows) = shadows.as_ref() {
                    shadows.collect_ground(coord, chunk, projection, &mut draws);
                    shadows.collect_faces(coord, projection, &mut draws);
                }
            }
            let Some(entities) = manager.entities_chunk(coord) else {
                continue;
            };
            for entity in entities {
                let x = f64::from(entity.x()) + 0.5;
                let y = f64::from(entity.y()) + 0.5;
                let elevation = f64::from(entity.elevation());
                let ground = project_block(GridPoint { x, y }, elevation, projection);
                let entity_texture = atlas
                    .asset(entity.texture_source())
                    .map_or(0, |asset| asset.texture);
                let Some((frame, layout)) = atlas.standing(
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
                let shade = shadows
                    .as_ref()
                    .and_then(|shadows| shadows.shade_of(coord, (entity.x(), entity.y())))
                    .and_then(lighting::shadow_view::lattice_of);
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
                for index in 0..cells {
                    let Some(band) = footprint_band(layout, anchor, step, index, cells, BAND_BLEED)
                    else {
                        continue;
                    };
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
                    match (&shade, cells > 1) {
                        (Some(shade), false) => draws.push(SpriteDraw::shaded(
                            key,
                            entity_texture,
                            frame,
                            layout,
                            shade.clone(),
                        )),
                        (Some(shade), true) => draws.push(SpriteDraw::shaded_band(
                            key,
                            entity_texture,
                            frame,
                            layout,
                            shade.clone(),
                            band,
                        )),
                        (None, cut) => draws.push(SpriteDraw::band(
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
                            atlas.standing(source, anchor, projection.tile_width)?;
                        let texture = atlas.asset(source).map_or(0, |asset| asset.texture);
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
                    mirrored.0,
                    mirrored.1,
                    mirrored.2,
                    anchor,
                    elevation,
                    mirrored.3,
                    projection,
                    |x, y| water_cell(&manager, x, y),
                    &mut draws,
                );
            }
        }

        let feet = player_feet(
            GridPoint { x: rp.x, y: rp.y },
            rp.elevation + rp.height,
            projection,
        );
        let column = get_player_column(GridPoint { x: rp.x, y: rp.y });
        let column_elevation = manager
            .column_at(column.x, column.y)
            .map_or(rp.elevation, |c| f64::from(c.elevation));
        let key = scene_key(
            f64::from(column.x) + 0.5,
            f64::from(column.y) + 0.5,
            column_elevation,
            player_layer(GridPoint { x: rp.x, y: rp.y }, column),
            projection.tile_height,
        );
        let climbing = get_player_climb_progress(&player, stepper.interpolation_alpha());
        let moved = (rp.x - drawn_at.0).hypot(rp.y - drawn_at.1);
        let pose = animation.advance(
            PlayerMoment {
                climbing,
                motion: player.motion,
                direction: player
                    .climb
                    .as_ref()
                    .map_or(player.walk, |climb| climb.direction),
                moved,
                jump_phase: get_player_jump_phase(&player),
                elapsed_ms: frame_ms,
            },
            sheets,
        );
        drawn_at = (rp.x, rp.y);
        let sheet = atlas.sheet(match pose.sheet {
            PlayerSheet::Walk => PLAYER_WALK_SHEET,
            PlayerSheet::Idle => PLAYER_IDLE_SHEET,
            PlayerSheet::Jump => PLAYER_JUMP_SHEET,
            PlayerSheet::Climb => PLAYER_CLIMB_SHEET,
        });
        let drawn = match (sheet, player_asset) {
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
                let layout = ink_layout(feet, ink, projection.tile_width);
                let shade = shadows.as_ref().and_then(|shadows| {
                    let receiver = lighting::shadow_view::receiver_of(
                        layout,
                        feet,
                        (rp.x + 0.5, rp.y + 0.5),
                        rp.elevation + rp.height,
                    );
                    shadows
                        .shade_moving(&manager, &receiver)
                        .as_ref()
                        .and_then(lighting::shadow_view::lattice_of)
                });
                collect_reflection(
                    texture,
                    frame,
                    layout,
                    feet,
                    rp.elevation + rp.height,
                    Reflected::Standing { turn_at: None },
                    projection,
                    |x, y| water_cell(&manager, x, y),
                    &mut draws,
                );
                match shade {
                    Some(shade) => {
                        draws.push(SpriteDraw::shaded(key, texture, frame, layout, shade));
                    }
                    None => draws.push(SpriteDraw::whole(key, texture, frame, layout)),
                }
            }
            None => draw_circle(feet.x as f32, feet.y as f32, 12.0, GOLD),
        }

        let elevation_at = |x: i32, y: i32| manager.column_at(x, y).map(|c| f64::from(c.elevation));
        dust.advance(frame_ms);
        dust.react(
            &player,
            DustGround {
                feet: GridPoint { x: rp.x, y: rp.y },
                level: rp.elevation + rp.height,
                ground: rp.elevation,
                moved,
                tile_height: projection.tile_height,
            },
            &elevation_at,
        );
        dust.collect(projection, &mut draws);

        let after_collect = get_time();
        let sprites = draws.len();
        draw_sorted(&atlas, material.as_ref(), &mut draws);
        if let Some(clouds) = clouds.as_mut() {
            clouds.advance(frame_ms);
            clouds.draw(
                (projection.origin_x, projection.origin_y),
                (projection.tile_width, projection.tile_height),
                (f64::from(width), f64::from(height)),
            );
        }
        let after_draw = get_time();
        perf.push(FrameSample {
            frame_ms,
            simulation_ms: (after_simulation - frame_start) * 1000.0,
            scene_ms: (after_collect - after_simulation) * 1000.0,
            draw_ms: (after_draw - after_collect) * 1000.0,
            sprites,
            chunks: chunks_drawn,
            chunks_alive: manager.discovered_count(),
        });
        if is_key_pressed(KeyCode::P) {
            info!("{}", perf.summary());
        }

        ui.push(UiEvent::HudUpdate {
            x: player.x,
            y: player.y,
            elevation,
            motion: format!("{:?} {}", player.motion, animation.facing_name()),
            chunks: manager.discovered_count(),
        });

        draw_rectangle(20.0, 20.0, 510.0, 80.0, Color::from_rgba(21, 29, 42, 205));
        draw_text("Armada Engine / Macroquad", 32.0, 58.0, 32.0, WHITE);
        draw_text(
            "WASD/Flechas | Espacio: saltar | Shift: correr | T: terreno | P: perf | F5: guardar",
            32.0,
            89.0,
            18.0,
            LIGHTGRAY,
        );
        draw_rectangle(
            20.0,
            height - 70.0,
            width - 40.0,
            48.0,
            Color::from_rgba(21, 29, 42, 205),
        );
        if let Some((x, y, elev, motion, chunks)) = &ui.hud {
            let text = format!(
                "Mundo: ({x:.2}, {y:.2}, {elev}) | {motion} | chunks: {chunks} | {fps} fps ({frame_ms:.1} ms)",
                fps = get_fps(),
                frame_ms = frame_ms,
            );
            draw_text(&text, 32.0, height - 42.0, 22.0, LIGHTGRAY);
        }

        let (_, frame_p95, frame_max) = perf.frame_ms();
        let (_, cpu_p95, _) = perf.cpu_ms();
        let readout_colour = if frame_max > 33.4 {
            RED
        } else if frame_max > 20.0 {
            ORANGE
        } else {
            LIME
        };
        draw_rectangle(
            width - 230.0,
            20.0,
            210.0,
            92.0,
            Color::from_rgba(21, 29, 42, 205),
        );
        draw_text(
            format!("{} fps", get_fps()),
            width - 218.0,
            46.0,
            28.0,
            readout_colour,
        );
        draw_text(
            format!("frame p95 {frame_p95:.1} max {frame_max:.1}"),
            width - 218.0,
            66.0,
            15.0,
            readout_colour,
        );
        draw_text(
            format!(
                "cpu p95 {cpu_p95:.1} ms · {} caidos · polvo {}",
                perf.dropped(),
                dust.live()
            ),
            width - 218.0,
            82.0,
            15.0,
            LIGHTGRAY,
        );
        let worst = perf.worst();
        draw_text(
            format!(
                "peor: sim {:.1} esc {:.1} dib {:.1}",
                worst.simulation_ms, worst.scene_ms, worst.draw_ms
            ),
            width - 218.0,
            98.0,
            15.0,
            LIGHTGRAY,
        );

        for (i, msg) in ui.messages.iter().enumerate() {
            draw_text(msg, 32.0, 120.0 + i as f32 * 20.0, 18.0, YELLOW);
        }
        ui.messages.clear();
        next_frame().await;
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use lighting::shadow_view_atlas::SLOT_COUNT;

    /// The shadow atlas holds nine chunks, and the chunk whose slot it turns out is the one
    #[test]
    fn the_atlas_holds_more_chunks_than_the_camera_can_show() {
        let viewport = ScreenSize {
            width: 3840.0,
            height: 2160.0,
        };
        let projection = preview_projection(0.0, 0.0);
        let camera = Camera {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        };

        let culled = camera_visible_chunks(camera, viewport, projection, CHUNK_CULL_MARGIN);

        assert!(
            culled.len() <= SLOT_COUNT,
            "the camera shows {} chunks and the shadow atlas holds {SLOT_COUNT}",
            culled.len()
        );
    }

    #[test]
    fn player_feet_stay_at_their_terrain_column_centre() {
        let projection = ProjectionConfig {
            tile_width: 150.0,
            tile_height: 75.0,
            elevation_step: Some(50.0),
            origin_x: 400.0,
            origin_y: 300.0,
        };
        let position = GridPoint { x: 12.0, y: 7.0 };

        assert_eq!(
            player_feet(position, 0.0, projection),
            ScreenPoint {
                x: 775.0,
                y: -450.0
            },
            "player feet use the same projected centre as their supporting terrain column"
        );
    }

    #[test]
    fn the_player_is_drawn_at_its_measured_artwork_scaled_about_its_feet() {
        let ink = InkBox {
            x: -0.128_125,
            y: -0.278_809,
            width: 0.263_086,
            height: 0.332_91,
        };
        let feet = ScreenPoint { x: 400.0, y: 300.0 };

        let layout = ink_layout(feet, ink.scaled(PLAYER_SCALE), PREVIEW_TILE_WIDTH);

        let expect = |value: f64| value * PLAYER_SCALE * PREVIEW_TILE_WIDTH;
        assert!((layout.x - (feet.x + expect(ink.x))).abs() < 1e-9);
        assert!((layout.y - (feet.y + expect(ink.y))).abs() < 1e-9);
        assert!((layout.width - expect(ink.width)).abs() < 1e-9);
        assert!((layout.height - expect(ink.height)).abs() < 1e-9);
        assert!(
            layout.width < PREVIEW_TILE_WIDTH,
            "the figure is narrower than the tile it stands on"
        );
    }

    #[test]
    fn the_player_and_what_stands_on_its_column_sort_by_the_same_point() {
        use crate::assets::sprites::ground_key;
        use iso::scene_order::compare_draw_keys;
        use terrain::terrain_view_blocks::TERRAIN_LAYER;

        let (x, y, elevation) = (12.5, 7.5, 2.0);
        let key = |layer| scene_key(x, y, elevation, layer, PREVIEW_TILE_HEIGHT);

        let entity = key(ENTITY_LAYER);
        let behind = key(PLAYER_BEHIND_LAYER);
        let front = key(PLAYER_FRONT_LAYER);

        assert_eq!(behind.depth, entity.depth, "one cell is one depth");
        assert_eq!(
            compare_draw_keys(&behind, &entity),
            std::cmp::Ordering::Less,
            "walking along the back of the column it goes under the tree"
        );
        assert_eq!(
            compare_draw_keys(&front, &entity),
            std::cmp::Ordering::Greater,
            "along the front of the same column it goes over it"
        );

        let own_ground = ground_key(x, y, elevation, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT);
        assert_eq!(
            compare_draw_keys(&own_ground, &behind),
            std::cmp::Ordering::Less,
            "the player stands on its column's top, not under it"
        );
    }

    /// The bug Alex saw as "the sprite is cut at the joins": the player is drawn at its exact
    #[test]
    fn level_ground_towards_the_camera_never_covers_the_player_and_a_step_still_does() {
        use crate::assets::sprites::ground_key;
        use iso::scene_order::compare_draw_keys;
        use std::cmp::Ordering;
        use terrain::terrain_view_blocks::TERRAIN_LAYER;

        let (x, y, elevation) = (12.5, 7.5, 2.0);
        for layer in [PLAYER_BEHIND_LAYER, PLAYER_FRONT_LAYER] {
            let player = scene_key(x, y, elevation, layer, PREVIEW_TILE_HEIGHT);
            for (dx, dy) in [(-1.0, 0.0), (0.0, -1.0)] {
                let level = ground_key(
                    x + dx,
                    y + dy,
                    elevation,
                    TERRAIN_LAYER,
                    PREVIEW_TILE_HEIGHT,
                );
                assert_eq!(
                    compare_draw_keys(&level, &player),
                    Ordering::Less,
                    "ground level with the player's at ({dx}, {dy}) is drawn under it"
                );
                let step = ground_key(
                    x + dx,
                    y + dy,
                    elevation + 1.0,
                    TERRAIN_LAYER,
                    PREVIEW_TILE_HEIGHT,
                );
                assert_eq!(
                    compare_draw_keys(&step, &player),
                    Ordering::Greater,
                    "a step up at ({dx}, {dy}) still hides the player behind it"
                );
            }
        }
    }

    /// The cell across the corner is the one tile towards the camera still drawn after the
    #[test]
    fn the_cell_across_the_corner_only_ever_touches_the_players_feet() {
        let projection = ProjectionConfig {
            origin_x: 0.0,
            origin_y: 0.0,
            tile_width: PREVIEW_TILE_WIDTH,
            tile_height: PREVIEW_TILE_HEIGHT,
            elevation_step: Some(PREVIEW_ELEVATION_STEP),
        };
        let (cx, cy, elevation) = (12.0, 7.0, 2.0);
        let feet = player_feet(
            GridPoint {
                x: cx - 0.5,
                y: cy - 0.5,
            },
            elevation,
            projection,
        );
        let across = project_block(
            GridPoint {
                x: cx - 0.5,
                y: cy - 0.5,
            },
            elevation,
            projection,
        );
        assert!(
            (across.screen_y - PREVIEW_TILE_HEIGHT / 2.0 - feet.y).abs() < 1e-9,
            "the diamond starts where the feet stop"
        );
    }

    /// A shadow is painted on a cell's top, so it moves back with that top: left keyed by the
    #[test]
    fn what_is_painted_on_the_ground_sorts_with_the_ground_it_lies_on() {
        use crate::assets::sprites::ground_key;
        use crate::lighting::shadow_view::GROUND_SHADOW_LAYER;
        use iso::scene_order::compare_draw_keys;
        use std::cmp::Ordering;
        use terrain::terrain_view_blocks::TERRAIN_LAYER;

        let (x, y, elevation) = (12.5, 7.5, 2.0);
        let shadow = ground_key(x, y, elevation, GROUND_SHADOW_LAYER, PREVIEW_TILE_HEIGHT);
        assert_eq!(
            compare_draw_keys(
                &ground_key(x, y, elevation, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
                &shadow,
            ),
            Ordering::Less,
            "it lies on its own ground",
        );
        for (dx, dy) in [(-1.0, 0.0), (0.0, -1.0), (-1.0, -1.0)] {
            assert_eq!(
                compare_draw_keys(
                    &ground_key(
                        x + dx,
                        y + dy,
                        elevation,
                        TERRAIN_LAYER,
                        PREVIEW_TILE_HEIGHT,
                    ),
                    &shadow,
                ),
                Ordering::Greater,
                "and the ground at ({dx}, {dy}) covers it, as it covered it before",
            );
        }
        assert_eq!(
            compare_draw_keys(
                &shadow,
                &scene_key(x, y, elevation, PLAYER_BEHIND_LAYER, PREVIEW_TILE_HEIGHT),
            ),
            Ordering::Less,
            "and the player walks over it",
        );
    }

    /// Moving every block of the terrain back by the same cell cannot change its order among
    #[test]
    fn the_terrain_keeps_its_order_among_itself() {
        use crate::assets::sprites::ground_key;
        use iso::scene_order::compare_draw_keys;
        use terrain::terrain_view_blocks::TERRAIN_LAYER;

        let cells = [
            (4.5, 9.5, 0.0),
            (3.5, 9.5, 1.0),
            (4.5, 8.5, -2.0),
            (3.5, 8.5, 3.0),
        ];
        for &(ax, ay, ae) in &cells {
            for &(bx, by, be) in &cells {
                let before = compare_draw_keys(
                    &scene_key(ax, ay, ae, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
                    &scene_key(bx, by, be, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
                );
                let after = compare_draw_keys(
                    &ground_key(ax, ay, ae, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
                    &ground_key(bx, by, be, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT),
                );
                assert_eq!(
                    before, after,
                    "({ax}, {ay}, {ae}) against ({bx}, {by}, {be})"
                );
            }
        }
    }

    #[test]
    fn the_player_passes_behind_what_stands_on_the_far_half_of_its_column() {
        let column = WorldCoord { x: 12, y: 7 };

        assert_eq!(
            player_layer(GridPoint { x: 12.3, y: 7.0 }, column),
            PLAYER_BEHIND_LAYER,
            "past the column's centre it is further from the camera than the tree on it"
        );
        assert_eq!(
            player_layer(GridPoint { x: 11.7, y: 7.0 }, column),
            PLAYER_FRONT_LAYER,
            "before the centre it is nearer the camera and covers what stands there"
        );
        assert_eq!(
            player_layer(GridPoint { x: 12.0, y: 7.0 }, column),
            PLAYER_FRONT_LAYER,
            "on the centre it stands in front, like the TypeScript client"
        );
        const {
            assert!(PLAYER_BEHIND_LAYER < ENTITY_LAYER && ENTITY_LAYER < PLAYER_FRONT_LAYER);
        }
    }
}
