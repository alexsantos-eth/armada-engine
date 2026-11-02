use armada_core::projection::{
    GridPoint, ProjectionConfig, ScreenPoint, project_grid_point, unproject_screen_delta,
};
use macroquad::prelude::*;

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
    let mut cursor = GridPoint { x: 0.0, y: 0.0 };

    loop {
        let width = screen_width();
        let height = screen_height();
        let projection = ProjectionConfig {
            tile_width: 80.0,
            tile_height: 40.0,
            elevation_step: None,
            origin_x: f64::from(width / 2.0),
            origin_y: f64::from(height / 2.0 + 50.0),
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
        draw_grid(projection);
        let marker = screen_point(cursor, projection);
        draw_circle(marker.x, marker.y, 12.0, GOLD);
        draw_text("Armada Engine / Macroquad", 32.0, 58.0, 32.0, WHITE);
        draw_text(
            "Flechas/WASD | arrastra con raton",
            32.0,
            89.0,
            22.0,
            LIGHTGRAY,
        );
        draw_text(
            format!(
                "Rejilla: ({:.2}, {:.2}) | Ventana: {width:.0} x {height:.0}",
                cursor.x, cursor.y
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

fn draw_grid(projection: ProjectionConfig) {
    let color = Color::from_rgba(96, 142, 161, 130);
    for x in -3..=2 {
        for y in -3..=2 {
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
