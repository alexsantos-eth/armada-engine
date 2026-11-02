mod game;
mod terrain_view;

use armada_core::grid::WorldCoord;
use armada_core::projection::{
    GridPoint, ProjectionConfig, ScreenPoint, project_block, project_grid_point,
    unproject_screen_delta,
};
use game::preview::{PREVIEW_CENTRE, PreviewWorld};
use macroquad::prelude::*;
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
    let mut cursor = GridPoint {
        x: f64::from(PREVIEW_CENTRE.x) + 0.5,
        y: f64::from(PREVIEW_CENTRE.y) + 0.5,
    };
    let preview = PreviewWorld::new();
    let mut show_terrain = true;

    loop {
        if is_key_pressed(KeyCode::T) {
            show_terrain = !show_terrain;
        }
        let width = screen_width();
        let height = screen_height();
        let projection = ProjectionConfig {
            tile_width: 80.0,
            tile_height: 40.0,
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

        clear_background(Color::from_rgba(21, 29, 42, 255));
        draw_rectangle_lines(16.0, 16.0, width - 32.0, height - 32.0, 2.0, SKYBLUE);
        if show_terrain {
            draw_terrain_preview(preview.columns(), projection, |point| {
                preview.elevation_at(point)
            });
        } else {
            draw_grid(projection, PREVIEW_CENTRE);
        }
        let elevation = if show_terrain {
            preview
                .elevation_at(WorldCoord {
                    x: cursor.x.floor() as i32,
                    y: cursor.y.floor() as i32,
                })
                .unwrap_or(0)
        } else {
            0
        };
        let marker = project_block(cursor, f64::from(elevation), projection);
        let marker = vec2(marker.screen_x as f32, marker.screen_y as f32);
        draw_circle(marker.x, marker.y, 12.0, GOLD);
        draw_rectangle(20.0, 20.0, 510.0, 80.0, Color::from_rgba(21, 29, 42, 205));
        draw_text("Armada Engine / Macroquad", 32.0, 58.0, 32.0, WHITE);
        draw_text(
            "Flechas/WASD | raton | T: terreno/rejilla",
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
                "Mundo: ({:.2}, {:.2}, {elevation}) | Ventana: {width:.0} x {height:.0}",
                cursor.x, cursor.y,
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
