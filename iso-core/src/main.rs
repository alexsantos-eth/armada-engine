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
    let mut cursor = vec2(0.5, 0.5);

    loop {
        let width = screen_width();
        let height = screen_height();
        let speed = 0.8 * get_frame_time();
        if is_key_down(KeyCode::Left) || is_key_down(KeyCode::A) {
            cursor.x -= speed;
        }
        if is_key_down(KeyCode::Right) || is_key_down(KeyCode::D) {
            cursor.x += speed;
        }
        if is_key_down(KeyCode::Up) || is_key_down(KeyCode::W) {
            cursor.y -= speed;
        }
        if is_key_down(KeyCode::Down) || is_key_down(KeyCode::S) {
            cursor.y += speed;
        }
        if is_mouse_button_down(MouseButton::Left) {
            let (x, y) = mouse_position();
            cursor = vec2(x / width, y / height);
        }
        cursor.x = cursor.x.clamp(0.0, 1.0);
        cursor.y = cursor.y.clamp(0.0, 1.0);

        clear_background(Color::from_rgba(21, 29, 42, 255));
        draw_rectangle_lines(16.0, 16.0, width - 32.0, height - 32.0, 2.0, SKYBLUE);
        draw_circle(cursor.x * width, cursor.y * height, 22.0, GOLD);
        draw_text("Armada Engine / Macroquad", 32.0, 58.0, 32.0, WHITE);
        draw_text(
            "Mover: flechas o WASD | raton: arrastrar",
            32.0,
            89.0,
            22.0,
            LIGHTGRAY,
        );
        draw_text(
            format!("Ventana: {width:.0} x {height:.0}"),
            32.0,
            height - 42.0,
            22.0,
            LIGHTGRAY,
        );
        next_frame().await;
    }
}
