mod save;
mod services;
mod terrain_view;

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
use armada_core::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator};
use armada_core::world::ChunkManager;
use armada_core::entities::{EntityCatalogV2, validate_catalog};
use save::{load_archive_into_manager, load_save, restore_archive, save_archive, sync_manager_to_archive};
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
    let manifest_json = include_str!("../../iso-core/content/assets.manifest.json");
    let manifest: armada_core::assets::AssetManifest =
        serde_json::from_str(manifest_json).expect("asset manifest is valid JSON");
    armada_core::assets::validate_manifest(&manifest).expect("asset manifest validates");
    // Macroquad loads the atlas as a single texture; sprites are addressed by frame rect.
    // The manifest path is already relative to the client root (iso-core/).
    let atlas = load_texture(&manifest.atlas).await.unwrap();
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
        load_archive_into_manager(&mut manager, &archive);
    }

    // Load enough chunks around the centre to find a spawn point.
    let centre_chunk = to_chunk_coord(PREVIEW_CENTRE);
    manager.set_focus(vec![centre_chunk]);
    for _ in 0..20 {
        manager.tick();
    }

    // Find a spawn point and create the player.
    let ground = ChunkGround { manager: &manager };
    let spawn = find_player_spawn(&ground, GridPoint {
        x: f64::from(PREVIEW_CENTRE.x),
        y: f64::from(PREVIEW_CENTRE.y),
    });
    let mut player = create_player(&ground, GridPoint { x: spawn.x, y: spawn.y });

    let mut show_terrain = true;
    let mut last_save = get_time();

    // Services.
    let mut audio = MacroquadAudio::default();
    let mut ui = MacroquadUi::default();

    loop {
        if is_key_pressed(KeyCode::T) {
            show_terrain = !show_terrain;
        }
        if is_key_pressed(KeyCode::S) {
            sync_manager_to_archive(&manager, &mut archive);
            save_archive(&archive);
            last_save = get_time();
        }

        let width = screen_width();
        let height = screen_height();
        let projection = ProjectionConfig {
            tile_width: 80.0,
            tile_height: PREVIEW_TILE_HEIGHT,
            elevation_step: None,
            origin_x: f64::from(width / 2.0)
                - (f64::from(PREVIEW_CENTRE.x) - f64::from(PREVIEW_CENTRE.y)) * 40.0,
            origin_y: f64::from(height / 2.0 + 50.0)
                + (f64::from(PREVIEW_CENTRE.x) + f64::from(PREVIEW_CENTRE.y)) * 20.0,
        };

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

        // Step the player (1 tick per frame).
        let jumps_before = player.feedback.jumps;
        let landings_before = player.feedback.landings;
        let mut ground = ChunkGround { manager: &manager };
        step_player(&mut player, &mut ground, 1, no_top_inset);
        if player.feedback.jumps > jumps_before {
            audio.play(SoundEvent::Jump);
        }
        if player.feedback.landings > landings_before {
            audio.play(SoundEvent::Land);
        }

        // Tick streaming.
        manager.tick();

        // Periodically sync and save.
        if get_time() - last_save > 10.0 {
            sync_manager_to_archive(&manager, &mut archive);
            save_archive(&archive);
            last_save = get_time();
        }

        // Collect visible columns for drawing.
        let mut columns: Vec<TerrainColumn> = Vec::new();
        for coord in manager.visible_chunks() {
            if let Some(chunk) = manager.terrain_chunk(coord) {
                columns.extend(chunk.iter().copied());
            }
        }
        columns.sort_by(|a, b| {
            let key = |column: &TerrainColumn| DrawKey {
                depth: get_draw_depth(
                    -(PREVIEW_TILE_HEIGHT / 2.0) * f64::from(column.coord.x + column.coord.y + 1),
                    f64::from(column.elevation),
                    f64::from(column.coord.x),
                    PREVIEW_TILE_HEIGHT,
                    0,
                    LengthAxis::X,
                ),
                layer: 0,
            };
            compare_draw_keys(&key(a), &key(b))
        });

        // Render position for smooth drawing.
        let rp = get_player_render_position(&player, 0.0);
        let elevation = player.elevation as i32;

        clear_background(Color::from_rgba(21, 29, 42, 255));
        draw_rectangle_lines(16.0, 16.0, width - 32.0, height - 32.0, 2.0, SKYBLUE);
        if show_terrain {
            draw_terrain_preview(&columns, projection, |point| {
                manager
                    .terrain_chunk(to_chunk_coord(point))
                    .and_then(|chunk| {
                        chunk
                            .iter()
                            .find(|c| c.coord == point)
                            .map(|c| c.elevation)
                    })
            });
        } else {
            draw_grid(projection, PREVIEW_CENTRE);
        }

        // Draw player marker.
        let marker = project_block(
            GridPoint { x: rp.x + 0.5, y: rp.y + 0.5 },
            rp.elevation + rp.height,
            projection,
        );
        let marker = vec2(marker.screen_x as f32, marker.screen_y as f32);
        draw_circle(marker.x, marker.y, 12.0, GOLD);

        // P6 prototype: draw the first atlas sprite (block) at the player's position.
        if let Some(entry) = manifest.entries.iter().find(|e| e.id == "block")
            && let Some(frame) = entry.primary_frame()
        {
            let src = Rect::new(
                frame.x as f32,
                frame.y as f32,
                frame.width as f32,
                frame.height as f32,
            );
            draw_texture_ex(
                &atlas,
                marker.x - 32.0,
                marker.y - 64.0,
                WHITE,
                DrawTextureParams {
                    source: Some(src),
                    dest_size: Some(vec2(64.0, 64.0)),
                    ..Default::default()
                },
            );
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
            "WASD/Flechas | Espacio: saltar | Shift: correr | T: terreno | S: guardar",
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
            let text = format!("Mundo: ({:.2}, {:.2}, {}) | {} | chunks: {}", x, y, elev, motion, chunks);
            draw_text(
                &text,
                32.0,
                height - 42.0,
                22.0,
                LIGHTGRAY,
            );
        }

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

