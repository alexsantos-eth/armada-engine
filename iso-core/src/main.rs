mod perf;
mod save;
mod services;
mod sprites;
mod terrain_view;

use armada_core::assets::sprite_layout;
use armada_core::entities::EntityLengthAxis;
use armada_core::grid::{WorldCoord, to_chunk_coord};
use armada_core::player::physics::{
    PlayerGround, create_player, find_player_spawn, get_player_column,
    get_player_render_position, jump_player, no_top_inset, set_player_jump_held,
    set_player_run, step_player,
};
use armada_core::services::{InputService, NormalizedInput, UiService, UiEvent, AudioService, SoundEvent};
use services::{MacroquadInput, MacroquadAudio, MacroquadUi};
use armada_core::projection::{
    GridPoint, ProjectionConfig, ScreenPoint, project_block, project_grid_point,
};
use armada_core::simulation::FixedStepper;
use armada_core::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator};
use armada_core::world::ChunkManager;
use armada_core::entities::{EntityCatalogV2, validate_catalog};
use armada_core::camera::{Camera, ScreenSize, visible_chunks as camera_visible_chunks};
use save::{
    load_archive_into_manager, load_save, restore_archive, restore_discovered_from_archive,
    save_archive, sync_manager_to_archive,
};
use perf::{FrameSample, PerfLog};
use sprites::{SpriteAtlas, SpriteDraw, anchored, draw_sorted, scene_key};
use terrain_view::blocks::{TerrainFrames, collect_terrain_sprites};
use macroquad::prelude::*;

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
const PREVIEW_TILE_WIDTH: f64 = 80.0;
const PREVIEW_TILE_HEIGHT: f64 = PREVIEW_TILE_WIDTH / 2.0;
/// One level of elevation, in screen pixels.
///
/// The block artwork is drawn to a fixed ratio: a block's body is 40 pixels tall where its top
/// face is 128 wide, so a level has to be 40/128 of the tile width for stacked blocks to meet.
/// The projection's own default (half the tile height) is shallower than the artwork and left
/// every cliff face overlapping the block below it.
const PREVIEW_ELEVATION_STEP: f64 = PREVIEW_TILE_WIDTH * 40.0 / 128.0;
/// Entities draw above the terrain of the same depth, and the player above the entities.
const ENTITY_LAYER: i32 = 1;
const PLAYER_LAYER: i32 = 2;
/// How tall the player is drawn. Its artwork fills a square frame, so this is both its height
/// and its width; it is placed by the manifest's anchor rather than the block template.
const PLAYER_SIZE: f64 = PREVIEW_TILE_WIDTH * 0.6;
/// Source path of the player's sprite in the asset manifest.
const PLAYER_SPRITE: &str = "/assets/player/block.svg";
/// Extra view the chunk cull keeps around the screen, as a fraction of it.
///
/// Zero: this client culls every frame, so a chunk is included on the frame it first touches the
/// screen and there is nothing for a margin to cover. `CHUNK_VIEW_MARGIN` exists for a client
/// that caches its cull between frames and needs the ring ahead of the camera.
const CHUNK_CULL_MARGIN: f64 = 0.0;

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
    fn occupancy_at(&self, _x: i32, _y: i32) -> Vec<armada_core::player::physics::PlayerObstacle> {
        Vec::new()
    }
    fn chunk_has(&self, coord: armada_core::grid::ChunkCoord) -> bool {
        self.manager.is_discovered(coord)
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    // Load the versioned entity catalog (embedded at compile time).
    let catalog_json = include_str!("../../src/isometric/content/entities.v2.json");

    // Load the asset manifest and atlas (P6 prototype).
    let manifest_json = include_str!("../content/assets.manifest.json");
    let manifest: armada_core::assets::AssetManifest =
        serde_json::from_str(manifest_json).expect("asset manifest is valid JSON");
    armada_core::assets::validate_manifest(&manifest).expect("asset manifest validates");
    // Macroquad loads the atlas as a single texture; sprites are addressed by frame rect.
    //
    // The manifest path is relative to the client root (iso-core/), which is the working
    // directory natively. On the web the fetch resolves against the page instead, and the page
    // lives in `web/`, so it needs one level up — without this the request went to
    // `web/content/atlas.png`, 404'd, and the client panicked before its first frame.
    let atlas_path = if cfg!(target_arch = "wasm32") {
        format!("../{}", manifest.atlas)
    } else {
        manifest.atlas.clone()
    };
    let texture = load_texture(&atlas_path)
        .await
        .unwrap_or_else(|err| panic!("could not load the atlas at {atlas_path}: {err}"));
    let atlas = SpriteAtlas::new(texture, &manifest);
    let (terrain_frames, missing_terrain) = TerrainFrames::new(&atlas);
    for material in &missing_terrain {
        eprintln!("warning: the atlas has no block for {material:?}; it will not be drawn");
    }
    let catalog: EntityCatalogV2 =
        serde_json::from_str(catalog_json).expect("entity catalog is valid JSON");
    validate_catalog(&catalog).expect("entity catalog validates");

    let generator = TerrainGenerator::new(TerrainConfig::default())
        .expect("default terrain configuration is valid");

    let mut manager = ChunkManager::new(generator, catalog);

    // Try to restore a previous save.
    let save = load_save().await;
    let mut archive = restore_archive(save);
    if archive.chunks().count() > 0 {
        for id in load_archive_into_manager(&mut manager, &archive) {
            eprintln!("warning: save refers to unknown entity blueprint {id}; skipped");
        }
    }

    // Load enough chunks around the centre to find a spawn point.
    let centre_chunk = to_chunk_coord(PREVIEW_CENTRE);
    manager.set_focus(vec![centre_chunk]);
    for _ in 0..20 {
        manager.tick();
    }

    // Camera state.
    let mut camera = Camera {
        x: f64::from(PREVIEW_CENTRE.x),
        y: f64::from(PREVIEW_CENTRE.y),
        zoom: 1.0,
    };

    // Find a spawn point and create the player.
    let ground = ChunkGround { manager: &manager };
    let spawn = find_player_spawn(&ground, GridPoint {
        x: f64::from(PREVIEW_CENTRE.x),
        y: f64::from(PREVIEW_CENTRE.y),
    });
    let mut player = create_player(&ground, GridPoint { x: spawn.x, y: spawn.y });

    let mut show_terrain = true;
    let mut last_save = get_time();
    // A saved world is only rewritten when something changed, so an idle player does not pay
    // for a full archive serialization every interval.
    let mut unsaved_changes = false;

    // The player sprite's atlas frame never changes, so it is resolved once here instead of
    // scanning all 63 manifest entries every frame.
    let player_frame = atlas.frame(PLAYER_SPRITE);
    let player_anchor = atlas
        .anchor(PLAYER_SPRITE)
        .unwrap_or(armada_core::assets::SpriteAnchor { x: 0.5, y: 1.0 });
    if player_frame.is_none() {
        eprintln!("warning: the atlas has no player sprite at {PLAYER_SPRITE}");
    }

    // Every sprite drawn in a frame goes through this one list, which is reused so a frame
    // costs no allocation.
    let mut draws: Vec<SpriteDraw> = Vec::new();

    // Fixed simulation step, variable frame rate. `FixedStepper` is the same accumulator the
    // TypeScript game uses and is checked against its fixture; stepping once per frame instead
    // tied the player's speed to the frame rate, so the same walk covered twice the ground at
    // 60 fps as at 30.
    let mut stepper = FixedStepper::default();

    // The quit is intercepted so the final save gets a frame to run before the window closes.
    prevent_quit();

    // Frame timings over a rolling window. The phases are kept beside the frame total: if the
    // three add up to much less than the frame took, the time went on the GPU or on waiting for
    // the display, and no amount of work removed from this loop will show up.
    let mut perf = PerfLog::default();

    // Services.
    let mut audio = MacroquadAudio::default();
    let mut ui = MacroquadUi::default();

    loop {
        let frame_start = get_time();
        if is_key_pressed(KeyCode::T) {
            show_terrain = !show_terrain;
        }
        // Not plain `S`: that walks the player south.
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

        // Input via the normalized service.
        let mut input_service = MacroquadInput;
        let input: NormalizedInput = input_service.poll();
        player.walk = input.walk;
        set_player_run(&mut player, input.run);

        // Jump input.
        if input.jump_pressed {
            jump_player(&mut player);
        }
        set_player_jump_held(&mut player, input.jump_held);

        // Update streaming focus around the player.
        let focus = to_chunk_coord(WorldCoord {
            x: player.x.floor() as i32,
            y: player.y.floor() as i32,
        });
        manager.set_focus(vec![focus]);

        // Step the player: as many fixed ticks as the elapsed frame time earned.
        // `max_frame_ms` already caps a long frame, so the count always fits; saturating keeps
        // that an invariant of this call rather than an assumption about the stepper.
        let frame_ms = f64::from(get_frame_time()) * 1000.0;
        let ticks = u32::try_from(stepper.consume_frame(frame_ms)).unwrap_or(u32::MAX);
        if ticks > 0 {
            let jumps_before = player.feedback.jumps;
            let landings_before = player.feedback.landings;
            let mut ground = ChunkGround { manager: &manager };
            step_player(&mut player, &mut ground, ticks, no_top_inset);
            if player.feedback.jumps > jumps_before {
                audio.play(SoundEvent::Jump);
            }
            if player.feedback.landings > landings_before {
                audio.play(SoundEvent::Land);
            }
        }

        // Everything drawn this frame is placed from the interpolated position, never from
        // `player` directly.
        //
        // The simulation runs at 20 ticks a second and the screen at 60 or more, so `player.x`
        // only changes on one frame in three. Drawing the sprite from the interpolated position
        // while the camera and the projection used the raw one made the world jump in 20 Hz
        // steps and the player slide smoothly against it: the whole scene appeared to shake,
        // and it looked like the game ran at a fraction of its real frame rate.
        let rp = get_player_render_position(&player, stepper.interpolation_alpha());

        // The camera and the projection origin follow that same interpolated position, so the
        // player, the terrain and the entities all move as one.
        camera.x = rp.x;
        camera.y = rp.y;
        let projection = ProjectionConfig {
            tile_width: PREVIEW_TILE_WIDTH,
            tile_height: PREVIEW_TILE_HEIGHT,
            elevation_step: Some(PREVIEW_ELEVATION_STEP),
            origin_x: f64::from(width / 2.0) - (rp.x - rp.y) * 40.0,
            origin_y: f64::from(height / 2.0 + 50.0) + (rp.x + rp.y) * 20.0,
        };

        // Tick streaming, then give any chunk the archive already holds its stored contents back
        // instead of the freshly generated ones.
        let discovered = manager.tick();
        if !discovered.is_empty() {
            unsaved_changes = true;
            for id in restore_discovered_from_archive(&mut manager, &archive, &discovered) {
                ui.push(UiEvent::Message {
                    text: format!("partida guardada con una entidad desconocida: {id}"),
                });
            }
        }

        // Drop chunks the player has left behind, after storing them: hiding a chunk keeps its
        // terrain and entities in memory, so without this a long session grows without bound.
        // One per frame, matching the load budget.
        if let Some(stale) = manager.next_unload_candidate()
            && let Some(saved) = manager.unload_chunk(stale)
        {
            archive.put(saved);
            unsaved_changes = true;
        }

        // Writing the save is one synchronous pass over the whole archive on the main thread:
        // ~25 ms at 42 chunks and growing with every chunk explored, which is a visible freeze.
        // So it happens on quit, on request, and otherwise only as an infrequent safety net.
        // Unloaded chunks are already safe in `archive` in the meantime.
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

        // Camera culling: determine which chunks are in the viewport.
        let viewport = ScreenSize {
            width: f64::from(width),
            height: f64::from(height),
        };
        let culled = camera_visible_chunks(camera, viewport, projection, CHUNK_CULL_MARGIN);
        // Intersect with discovered chunks.
        let visible_set: std::collections::HashSet<_> = culled.into_iter().collect();

        // Render position, interpolated by how far into the current tick the frame sits.
        let elevation = player.elevation.floor() as i32;

        clear_background(Color::from_rgba(21, 29, 42, 255));
        draw_rectangle_lines(16.0, 16.0, width - 32.0, height - 32.0, 2.0, SKYBLUE);

        // Everything visible is queued into one list and sorted once, so a sprite covers
        // exactly what is behind it: the ground, what stands on the ground, and the player.
        draws.clear();
        if !show_terrain {
            draw_grid(projection, WorldCoord {
                x: player.x.floor() as i32,
                y: player.y.floor() as i32,
            });
        }
        // One pass over the visible chunks for both, rather than one each: `visible_chunks`
        // builds a vector every call.
        let mut chunks_drawn = 0usize;
        for coord in manager.visible_chunks() {
            if !visible_set.contains(&coord) {
                continue;
            }
            chunks_drawn += 1;
            if show_terrain && let Some(chunk) = manager.terrain_chunk(coord) {
                // `column_at` indexes straight into the chunk. Scanning the chunk for a
                // matching coordinate searched up to 1024 columns per lookup, and the view
                // asks for two neighbour heights per drawn column: ~4 ms a frame, for a
                // lookup that is O(1).
                collect_terrain_sprites(
                    chunk,
                    projection,
                    &terrain_frames,
                    |point| manager.column_at(point.x, point.y).map(|c| c.elevation),
                    &mut draws,
                );
            }
            // Entities of the same chunk. Each one is drawn from its own blueprint: the sprite
            // its `asset.sprite` names, sized by the footprint and height the blueprint
            // declares. The first version guessed the sprite from the entity's id and drew
            // every one of them as a fixed 64x64 square, so a three-cell pier and a
            // six-storey tower came out the same size as a bush.
            let Some(entities) = manager.entities_chunk(coord) else {
                continue;
            };
            for entity in entities {
                let Some(frame) = atlas.frame(entity.texture_source()) else {
                    continue;
                };
                let x = f64::from(entity.x()) + 0.5;
                let y = f64::from(entity.y()) + 0.5;
                let elevation = f64::from(entity.elevation());
                let ground = project_block(GridPoint { x, y }, elevation, projection);
                let layout = sprite_layout(
                    ScreenPoint {
                        x: ground.screen_x,
                        y: ground.screen_y,
                    },
                    entity.length(),
                    entity.height(),
                    entity.length_axis().unwrap_or(EntityLengthAxis::X),
                    projection,
                );
                if !SpriteAtlas::on_screen(layout) {
                    continue;
                }
                // The anchor is the cell of the footprint nearest the camera, so it is the
                // cell the whole sprite sorts by.
                draws.push(SpriteDraw {
                    key: scene_key(x, y, elevation, ENTITY_LAYER, projection.tile_height),
                    frame,
                    layout,
                });
            }
        }

        // The player, standing on the ground it is over, raised by however far into a jump it
        // is. It joins the same list, so it passes behind what is in front of it instead of
        // being painted over the whole scene.
        let feet = project_block(
            GridPoint { x: rp.x + 0.5, y: rp.y + 0.5 },
            rp.elevation + rp.height,
            projection,
        );
        let feet = ScreenPoint { x: feet.screen_x, y: feet.screen_y };
        match player_frame {
            Some(frame) => draws.push(SpriteDraw {
                // Sorted by the cell the player stands on, not by its exact position: the
                // player walks across a cell continuously, so its own depth would drift past
                // its column's and the block it is standing on would be drawn over it for
                // half of every cell. `get_player_column` is the same rule the physics uses
                // to decide which column holds the player up.
                key: {
                    let cell = get_player_column(GridPoint { x: rp.x, y: rp.y });
                    scene_key(
                        f64::from(cell.x) + 0.5,
                        f64::from(cell.y) + 0.5,
                        rp.elevation + rp.height,
                        PLAYER_LAYER,
                        projection.tile_height,
                    )
                },
                frame,
                layout: anchored(feet, PLAYER_SIZE, player_anchor),
            }),
            // A marker while the atlas has no player sprite, drawn straight away: it is not a
            // sprite, so it cannot go through the sorted list.
            None => draw_circle(feet.x as f32, feet.y as f32, 12.0, GOLD),
        }

        let after_collect = get_time();
        let sprites = draws.len();
        draw_sorted(&atlas, &mut draws);
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
        // The whole report, in the same shape as the TypeScript client's, for comparing the two.
        if is_key_pressed(KeyCode::P) {
            info!("{}", perf.summary());
        }

        // Push HUD update via the UI service.
        ui.push(UiEvent::HudUpdate {
            x: player.x,
            y: player.y,
            elevation,
            motion: format!("{:?}", player.motion),
            chunks: manager.discovered_count(),
        });

        // HUD.
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
            draw_text(
                &text,
                32.0,
                height - 42.0,
                22.0,
                LIGHTGRAY,
            );
        }

        // Frame-time readout, top right. Percentiles over the window rather than an average:
        // a stutter is a handful of frames, and an average hides exactly those.
        let (_, frame_p95, frame_max) = perf.frame_ms();
        let (_, cpu_p95, _) = perf.cpu_ms();
        let readout_colour = if frame_max > 33.4 {
            RED
        } else if frame_max > 20.0 {
            ORANGE
        } else {
            LIME
        };
        draw_rectangle(width - 230.0, 20.0, 210.0, 92.0, Color::from_rgba(21, 29, 42, 205));
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
            format!("cpu p95 {cpu_p95:.1} ms · {} caidos", perf.dropped()),
            width - 218.0,
            82.0,
            15.0,
            LIGHTGRAY,
        );
        // Where the worst frame of the window went: simulation, sprite list, drawing.
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

        // Draw any UI messages.
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

