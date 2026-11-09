//! The heads-up display: title, world readout, performance panel and transient messages.
//!
//! Everything here is read-only over the game state plus the macroquad overlay pass: it draws
//! panels and text, it never touches the world. The loop pushes a `HudUpdate` first; `draw_hud`
//! then renders whatever the UI service holds.

use iso::player::physics::PlayerState;
use iso::services::{UiEvent, UiService};
use macroquad::prelude::*;

use crate::perf::PerfLog;
use crate::player::player_view::PlayerAnimation;
use crate::services::MacroquadUi;

/// The world readout line: position, elevation, motion, chunks and the frame cost.
fn world_readout_line(
    x: f64,
    y: f64,
    elevation: i32,
    motion: &str,
    chunks: usize,
    fps: i32,
    frame_ms: f64,
) -> String {
    format!(
        "Mundo: ({x:.2}, {y:.2}, {elevation}) | {motion} | chunks: {chunks} | {fps} fps ({frame_ms:.1} ms)",
    )
}

/// Colour of the frame readout, escalating past the 60 Hz frame budget and past two refreshes.
fn readout_colour(frame_max: f64) -> Color {
    if frame_max > 33.4 {
        RED
    } else if frame_max > 20.0 {
        ORANGE
    } else {
        LIME
    }
}

/// Queues this frame's HUD readout from the player's state.
pub(crate) fn push_hud_update(
    ui: &mut MacroquadUi,
    player: &PlayerState,
    animation: &PlayerAnimation,
    elevation: i32,
    chunks: usize,
) {
    ui.push(UiEvent::HudUpdate {
        x: player.x,
        y: player.y,
        elevation,
        motion: format!("{:?} {}", player.motion, animation.facing_name()),
        chunks,
    });
}

/// The overlay: title and help, world readout, performance readout and messages.
pub(crate) fn draw_hud(ui: &mut MacroquadUi, perf: &PerfLog, dust_live: usize, frame_ms: f64) {
    let width = screen_width();
    let height = screen_height();

    draw_rectangle(20.0, 20.0, 510.0, 80.0, Color::from_rgba(21, 29, 42, 205));
    draw_text("iso-core / Macroquad", 32.0, 58.0, 32.0, WHITE);
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
        let text = world_readout_line(*x, *y, *elev, motion, *chunks, get_fps(), frame_ms);
        draw_text(&text, 32.0, height - 42.0, 22.0, LIGHTGRAY);
    }

    let (_, frame_p95, frame_max) = perf.frame_ms();
    let (_, cpu_p95, _) = perf.cpu_ms();
    let colour = readout_colour(frame_max);
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
        colour,
    );
    draw_text(
        format!("frame p95 {frame_p95:.1} max {frame_max:.1}"),
        width - 218.0,
        66.0,
        15.0,
        colour,
    );
    draw_text(
        format!(
            "cpu p95 {cpu_p95:.1} ms · {} caidos · polvo {dust_live}",
            perf.dropped(),
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
}

#[cfg(test)]
#[path = "hud.test.rs"]
mod tests;
