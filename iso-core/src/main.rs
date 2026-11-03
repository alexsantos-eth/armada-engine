mod save;
mod services;
mod terrain_view;

use armada_core::assets::{AssetEntry, SpriteFrame};
use armada_core::grid::{WorldCoord, to_chunk_coord};
use armada_core::player::physics::{
    PlayerGround, create_player, find_player_spawn,
    get_player_render_position, jump_player, no_top_inset, set_player_jump_held,
    set_player_run, step_player,
};
use armada_core::services::{InputService, NormalizedInput, UiService, UiEvent, AudioService, SoundEvent};
use services::{MacroquadInput, MacroquadAudio, MacroquadUi};
use armada_core::projection::{GridPoint, ProjectionConfig, project_block, project_grid_point};
use armada_core::scene_order::{DrawKey, LengthAxis, compare_draw_keys, get_draw_depth};
use armada_core::simulation::FixedStepper;
use armada_core::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator};
use armada_core::world::ChunkManager;
use armada_core::entities::{EntityCatalogV2, validate_catalog};
use armada_core::camera::{Camera, ScreenSize, visible_chunks as camera_visible_chunks};
use std::collections::HashMap;
use save::{
    load_archive_into_manager, load_save, restore_archive, restore_discovered_from_archive,
    save_archive, sync_manager_to_archive,
};
use terrain_view::preview::draw_terrain_preview;
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
const PREVIEW_TILE_HEIGHT: f64 = 40.0;
/// Entities draw above the terrain of the same depth.
const ENTITY_LAYER: i32 = 1;
/// Safety-net interval for the periodic save; the real save happens on quit and on request.
const AUTOSAVE_SECONDS: f64 = 120.0;

/// One entity queued for drawing this frame, with the depth key it sorts by.
struct EntityDraw {
    key: DrawKey,
    x: f64,
    y: f64,
    elevation: f64,
    frame: SpriteFrame,
}

/// Depth key of a terrain column under the preview projection.
fn terrain_draw_key(column: &TerrainColumn) -> DrawKey {
    DrawKey {
        depth: get_draw_depth(
            -(PREVIEW_TILE_HEIGHT / 2.0) * f64::from(column.coord.x + column.coord.y + 1),
            f64::from(column.elevation),
            f64::from(column.coord.x),
            PREVIEW_TILE_HEIGHT,
            0,
            LengthAxis::X,
        ),
        layer: 0,
    }
}

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
    let atlas = load_texture(&atlas_path)
        .await
        .unwrap_or_else(|err| panic!("could not load the atlas at {atlas_path}: {err}"));
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

    // Build a lookup from entity type to atlas frame.
    let mut entity_atlas: HashMap<String, SpriteFrame> = HashMap::new();
    for entry in &manifest.entries {
        if let Some(frame) = entry.primary_frame() {
            // Entity type is the source filename without directory, extension or `_block` suffix.
            let entity_type = entry
                .source
                .trim_end_matches(".svg")
                .rsplit('/')
                .next()
                .unwrap_or(&entry.id)
                .trim_end_matches("_block")
                .to_owned();
            entity_atlas.insert(entity_type, frame);
        }
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
    let player_frame = manifest
        .entries
        .iter()
        .find(|entry| entry.id.contains("player") || entry.source.contains("player"))
        .and_then(AssetEntry::primary_frame);

    // Fixed simulation step, variable frame rate. `FixedStepper` is the same accumulator the
    // TypeScript game uses and is checked against its fixture; stepping once per frame instead
    // tied the player's speed to the frame rate, so the same walk covered twice the ground at
    // 60 fps as at 30.
    let mut stepper = FixedStepper::default();

    // The quit is intercepted so the final save gets a frame to run before the window closes.
    prevent_quit();

    // Frame-time readout state.
    let mut frame_peak_ms: f64 = 0.0;
    let mut worst_ms: f64 = 0.0;
    let mut peak_since = get_time();

    // Services.
    let mut audio = MacroquadAudio::default();
    let mut ui = MacroquadUi::default();

    loop {
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
        // Worst frame of the last second: a stutter is a few slow frames, and an average or an
        // instantaneous fps reading hides exactly those.
        frame_peak_ms = frame_peak_ms.max(frame_ms);
        if get_time() - peak_since > 1.0 {
            worst_ms = frame_peak_ms;
            frame_peak_ms = 0.0;
            peak_since = get_time();
        }
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
            tile_width: 80.0,
            tile_height: PREVIEW_TILE_HEIGHT,
            elevation_step: None,
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
        if let Some(&stale) = manager.unload_candidates().first()
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

        // Camera culling: determine which chunks are in the viewport.
        let viewport = ScreenSize {
            width: f64::from(width),
            height: f64::from(height),
        };
        let culled = camera_visible_chunks(
            camera,
            viewport,
            projection,
            armada_core::camera::CHUNK_VIEW_MARGIN,
        );
        // Intersect with discovered chunks.
        let visible_set: std::collections::HashSet<_> = culled.into_iter().collect();

        // Collect visible columns for drawing.
        let mut columns: Vec<TerrainColumn> = Vec::new();
        for coord in manager.visible_chunks() {
            if !visible_set.contains(&coord) {
                continue;
            }
            if let Some(chunk) = manager.terrain_chunk(coord) {
                columns.extend(chunk.iter().copied());
            }
        }
        // Sort by precomputed keys. `sort_by` recomputed `get_draw_depth` on both sides of every
        // comparison, so a chunk's worth of columns paid O(n log n) depth computations instead
        // of one per column.
        let mut ordered: Vec<(DrawKey, TerrainColumn)> = columns
            .into_iter()
            .map(|column| (terrain_draw_key(&column), column))
            .collect();
        ordered.sort_by(|a, b| compare_draw_keys(&a.0, &b.0));
        let columns: Vec<TerrainColumn> = ordered.into_iter().map(|(_, column)| column).collect();

        // Render position, interpolated by how far into the current tick the frame sits.
        let elevation = player.elevation.floor() as i32;

        clear_background(Color::from_rgba(21, 29, 42, 255));
        draw_rectangle_lines(16.0, 16.0, width - 32.0, height - 32.0, 2.0, SKYBLUE);
        if show_terrain {
            // `column_at` indexes straight into the chunk. Scanning the chunk for a matching
            // coordinate searched up to 1024 columns per lookup, and the view asks for two
            // neighbour heights per drawn column: ~4 ms a frame, for a lookup that is O(1).
            draw_terrain_preview(&columns, projection, |point| {
                manager.column_at(point.x, point.y).map(|c| c.elevation)
            });
        } else {
            draw_grid(projection, WorldCoord {
                x: player.x.floor() as i32,
                y: player.y.floor() as i32,
            });
        }

        // Draw entities from visible (culled) chunks.
        let mut entity_draws: Vec<EntityDraw> = Vec::new();
        for coord in manager.visible_chunks() {
            if !visible_set.contains(&coord) {
                continue;
            }
            if let Some(entities) = manager.entities_chunk(coord) {
                for entity in entities {
                    let Some(&frame) = entity_atlas.get(entity.type_()) else {
                        continue;
                    };
                    let x = f64::from(entity.x()) + 0.5;
                    let y = f64::from(entity.y()) + 0.5;
                    let elevation = f64::from(entity.elevation());
                    entity_draws.push(EntityDraw {
                        key: DrawKey {
                            depth: get_draw_depth(
                                -(PREVIEW_TILE_HEIGHT / 2.0) * (x + y + 1.0),
                                elevation,
                                x,
                                PREVIEW_TILE_HEIGHT,
                                0,
                                LengthAxis::X,
                            ),
                            layer: ENTITY_LAYER,
                        },
                        x,
                        y,
                        elevation,
                        frame,
                    });
                }
            }
        }
        // Order entities with the same depth function the terrain uses. `y + elevation` was a
        // proxy that disagreed with it: a taller entity one column further back could sort in
        // front of a shorter one, and the engine already has the tested rule for this.
        entity_draws.sort_by(|a, b| compare_draw_keys(&a.key, &b.key));
        for EntityDraw { x: ex, y: ey, elevation: elev, frame, .. } in &entity_draws {
            let pos = project_block(GridPoint { x: *ex, y: *ey }, *elev, projection);
            draw_atlas_frame(
                &atlas,
                *frame,
                vec2(pos.screen_x as f32, pos.screen_y as f32),
            );
        }

        // Draw player sprite from atlas.
        let marker = project_block(
            GridPoint { x: rp.x + 0.5, y: rp.y + 0.5 },
            rp.elevation + rp.height,
            projection,
        );
        let marker = vec2(marker.screen_x as f32, marker.screen_y as f32);

        // The player sprite, or a marker while the atlas has no player frame.
        //
        // The leftover P6 prototype that drew the first atlas entry at this same position used
        // to run right after this, covering the player with a terrain block every frame.
        if let Some(frame) = player_frame {
            draw_atlas_frame(&atlas, frame, marker);
        } else {
            draw_circle(marker.x, marker.y, 12.0, GOLD);
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
            "WASD/Flechas | Espacio: saltar | Shift: correr | T: terreno | F5: guardar",
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

        // Frame-time readout, top right. The worst frame of the last second is what shows a
        // stutter; an fps average smooths exactly the spikes worth seeing.
        let fps_text = format!("{} fps", get_fps());
        let worst_text = format!("peor {worst_ms:.1} ms");
        let readout_colour = if worst_ms > 33.0 {
            RED
        } else if worst_ms > 20.0 {
            ORANGE
        } else {
            LIME
        };
        draw_rectangle(width - 190.0, 20.0, 170.0, 58.0, Color::from_rgba(21, 29, 42, 205));
        draw_text(&fps_text, width - 178.0, 46.0, 28.0, readout_colour);
        draw_text(&worst_text, width - 178.0, 68.0, 18.0, readout_colour);

        // Draw any UI messages.
        for (i, msg) in ui.messages.iter().enumerate() {
            draw_text(msg, 32.0, 120.0 + i as f32 * 20.0, 18.0, YELLOW);
        }
        ui.messages.clear();
        next_frame().await;
    }
}

/// Draws one atlas frame with its bottom centre near `at`, the anchor every sprite shares until
/// the manifest's per-entry anchors are wired in.
fn draw_atlas_frame(atlas: &Texture2D, frame: SpriteFrame, at: Vec2) {
    draw_texture_ex(
        atlas,
        at.x - 32.0,
        at.y - 64.0,
        WHITE,
        DrawTextureParams {
            source: Some(Rect::new(
                frame.x as f32,
                frame.y as f32,
                frame.width as f32,
                frame.height as f32,
            )),
            dest_size: Some(vec2(64.0, 64.0)),
            ..Default::default()
        },
    );
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

