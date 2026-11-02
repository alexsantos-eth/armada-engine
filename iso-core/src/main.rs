mod game;
mod save;
mod terrain_view;

use armada_core::entities::{EntityCatalogV2, validate_catalog};
use armada_core::grid::{WorldCoord, to_chunk_coord};
use armada_core::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block, project_grid_point, unproject_screen_delta};
use armada_core::scene_order::{DrawKey, LengthAxis, compare_draw_keys, get_draw_depth};
use armada_core::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator};
use armada_core::world::ChunkManager;
use game::preview::{PREVIEW_CENTRE, PREVIEW_TILE_HEIGHT};
use macroquad::prelude::*;
use save::{load_archive_into_manager, load_save, restore_archive, save_archive, sync_manager_to_archive};
use terrain_view::preview::draw_terrain_preview;

fn window_conf() -> Conf {
    Conf {
        window_title: "Armada Engine".to_owned(),
        window_width: 960,
        window_height: 600,
        ..Default::default()
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    // Load the versioned entity catalog (embedded at compile time).
    let catalog_json = include_str!("../../src/isometric/content/entities.v2.json");
    let catalog: EntityCatalogV2 =
        serde_json::from_str(catalog_json).expect("entity catalog is valid JSON");
    validate_catalog(&catalog).expect("entity catalog validates");

    // Terrain generator for newly discovered chunks.
    let generator = TerrainGenerator::new(TerrainConfig::default())
        .expect("default terrain configuration is valid");

    // Chunk manager drives streaming with per-frame budgets.
    let mut manager = ChunkManager::new(generator, catalog);

    // Try to restore a previous save.
    let save = load_save().await;
    let mut archive = restore_archive(save);
    if !archive.chunks().count().eq(&0) {
        load_archive_into_manager(&mut manager, &archive);
    }

    // Initial focus around the preview centre.
    let mut cursor = GridPoint {
        x: f64::from(PREVIEW_CENTRE.x) + 0.5,
        y: f64::from(PREVIEW_CENTRE.y) + 0.5,
    };

    let mut show_terrain = true;
    let mut last_save = get_time();

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
        let speed = 2.0 * f64::from(get_frame_time());
        let horizontal = i32::from(is_key_down(KeyCode::Right) || is_key_down(KeyCode::D))
            - i32::from(is_key_down(KeyCode::Left) || is_key_down(KeyCode::A));
        let vertical = i32::from(is_key_down(KeyCode::Down) || is_key_down(KeyCode::S))
            - i32::from(is_key_down(KeyCode::Up) || is_key_down(KeyCode::W));
        let movement = movement_delta(horizontal, vertical, speed, projection);
        cursor.x += movement.x;
        cursor.y += movement.y;
        if is_mouse_button_down(MouseButton::Left) {
            let (x, y) = mouse_position();
            cursor = unproject_screen_delta(
                ScreenPoint {
                    x: f64::from(x) - projection.origin_x,
                    y: f64::from(y) - projection.origin_y,
                },
                projection,
            );
        }

        // Update streaming focus around the cursor.
        let focus = to_chunk_coord(WorldCoord {
            x: cursor.x.floor() as i32,
            y: cursor.y.floor() as i32,
        });
        manager.set_focus(vec![focus]);
        manager.tick();

        // Periodically sync and save (every 10 seconds).
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
        let elevation = manager
            .terrain_chunk(focus)
            .and_then(|chunk| {
                chunk
                    .iter()
                    .find(|c| c.coord.x == cursor.x.floor() as i32 && c.coord.y == cursor.y.floor() as i32)
                    .map(|c| c.elevation)
            })
            .unwrap_or(0);
        let marker = project_block(cursor, f64::from(elevation), projection);
        let marker = vec2(marker.screen_x as f32, marker.screen_y as f32);
        draw_circle(marker.x, marker.y, 12.0, GOLD);
        draw_rectangle(20.0, 20.0, 510.0, 80.0, Color::from_rgba(21, 29, 42, 205));
        draw_text("Armada Engine / Macroquad", 32.0, 58.0, 32.0, WHITE);
        draw_text(
            "Flechas/WASD | raton | T: terreno/rejilla | S: guardar",
            32.0,
            89.0,
            22.0,
            LIGHTGRAY,
        );
        draw_rectangle(
            20.0,
            height - 70.0,
            width - 40.0,
            48.0,
            Color::from_rgba(21, 29, 42, 205),
        );
        draw_text(
            format!(
                "Mundo: ({:.2}, {:.2}, {elevation}) | Ventana: {width:.0} x {height:.0} | chunks: {}",
                cursor.x,
                cursor.y,
                manager.discovered_count(),
            ),
            32.0,
            height - 42.0,
            22.0,
            LIGHTGRAY,
        );
        next_frame().await;
    }
}

fn movement_delta(
    horizontal: i32,
    vertical: i32,
    speed: f64,
    projection: ProjectionConfig,
) -> GridPoint {
    unproject_screen_delta(
        ScreenPoint {
            x: f64::from(horizontal) * speed * projection.tile_width,
            y: f64::from(vertical) * speed * projection.tile_height,
        },
        projection,
    )
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
#[path = "main.test.rs"]
mod tests;