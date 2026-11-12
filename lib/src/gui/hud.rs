//! The heads-up display: title, world readout, performance panel and transient messages.
//!
//! Everything here is read-only over the game state plus the macroquad overlay pass: it draws
//! panels and text, it never touches the world. The loop pushes a `HudUpdate` first; `draw_hud`
//! then renders whatever the UI service holds.

use iso::lighting::BakePhase;
use iso::player::physics::PlayerState;
use iso::services::{UiEvent, UiService};
use macroquad::prelude::*;

use crate::perf::PerfLog;
use crate::player::player_view::PlayerAnimation;
use crate::services::MacroquadUi;

const PHASE_BUTTON_X: f32 = 32.0;
const PHASE_BUTTON_Y: f32 = 108.0;
const PHASE_BUTTON_WIDTH: f32 = 112.0;
const PHASE_BUTTON_HEIGHT: f32 = 28.0;
const PHASE_BUTTON_GAP: f32 = 8.0;

const BAKE_PHASES: [BakePhase; 4] = [
    BakePhase::Dawn,
    BakePhase::Day,
    BakePhase::Sunset,
    BakePhase::Night,
];

/// The jetpack toggle sits in the phase buttons' row, just past the last of them.
const JETPACK_BUTTON_X: f32 =
    PHASE_BUTTON_X + BAKE_PHASES.len() as f32 * (PHASE_BUTTON_WIDTH + PHASE_BUTTON_GAP);

/// Whether a point is inside the button at `left` of the buttons' row.
fn button_hit(left: f32, x: f32, y: f32) -> bool {
    (left..=left + PHASE_BUTTON_WIDTH).contains(&x)
        && (PHASE_BUTTON_Y..=PHASE_BUTTON_Y + PHASE_BUTTON_HEIGHT).contains(&y)
}

fn phase_button_hit(x: f32, y: f32) -> Option<BakePhase> {
    BAKE_PHASES
        .into_iter()
        .enumerate()
        .find_map(|(index, phase)| {
            let left = PHASE_BUTTON_X + index as f32 * (PHASE_BUTTON_WIDTH + PHASE_BUTTON_GAP);
            button_hit(left, x, y).then_some(phase)
        })
}

fn draw_phase_buttons(selected: BakePhase) -> Option<BakePhase> {
    let (mouse_x, mouse_y) = mouse_position();
    for (index, phase) in BAKE_PHASES.into_iter().enumerate() {
        let x = PHASE_BUTTON_X + index as f32 * (PHASE_BUTTON_WIDTH + PHASE_BUTTON_GAP);
        draw_row_button(x, phase.label(), phase == selected, (mouse_x, mouse_y));
    }
    is_mouse_button_pressed(MouseButton::Left)
        .then(|| phase_button_hit(mouse_x, mouse_y))
        .flatten()
}

/// Paints one button of the row at `left`: filled when `active`, lit when the pointer is over
/// it, and labelled `label`.
fn draw_row_button(left: f32, label: &str, active: bool, mouse: (f32, f32)) {
    let fill = if active {
        Color::from_rgba(63, 116, 153, 235)
    } else if button_hit(left, mouse.0, mouse.1) {
        Color::from_rgba(52, 72, 98, 235)
    } else {
        Color::from_rgba(21, 29, 42, 205)
    };
    draw_rectangle(
        left,
        PHASE_BUTTON_Y,
        PHASE_BUTTON_WIDTH,
        PHASE_BUTTON_HEIGHT,
        fill,
    );
    draw_rectangle_lines(
        left,
        PHASE_BUTTON_Y,
        PHASE_BUTTON_WIDTH,
        PHASE_BUTTON_HEIGHT,
        1.0,
        SKYBLUE,
    );
    draw_text(label, left + 8.0, PHASE_BUTTON_Y + 19.0, 14.0, WHITE);
}

/// The jetpack toggle, next to the phase buttons: returns whether it was clicked this frame.
fn draw_jetpack_button(worn: bool) -> bool {
    let mouse = mouse_position();
    let label = if worn { "Jetpack: si" } else { "Jetpack: no" };
    draw_row_button(JETPACK_BUTTON_X, label, worn, mouse);
    is_mouse_button_pressed(MouseButton::Left) && button_hit(JETPACK_BUTTON_X, mouse.0, mouse.1)
}

/// What the overlay says about the world this frame: `touch_visible` swaps the help line to
/// the touch controls when they are on screen; `phase` is `None` when no shadow scene exists,
/// so the phase buttons stay out; `jetpack` is whether the player wears one, which the toggle
/// beside those buttons shows and flips; `clock` is the world clock as `HH:MM`, read-only.
#[derive(Clone, Copy, Debug)]
pub(crate) struct HudWorld<'a> {
    pub touch_visible: bool,
    pub phase: Option<BakePhase>,
    pub jetpack: bool,
    pub clock: &'a str,
}

/// What the overlay's buttons were asked for this frame.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct HudClicks {
    /// The phase picked by hand, if one was clicked.
    pub phase: Option<BakePhase>,
    /// Whether the jetpack toggle was clicked.
    pub jetpack: bool,
}

/// The world readout line: position, elevation, motion, chunks, clock and the frame cost.
struct Readout<'a> {
    x: f64,
    y: f64,
    elevation: i32,
    motion: &'a str,
    chunks: usize,
    clock: &'a str,
    fps: f64,
    frame_ms: f64,
}

fn world_readout_line(readout: &Readout<'_>) -> String {
    format!(
        "Mundo: ({:.2}, {:.2}, {}) | {} | chunks: {} | {} | {:.0} fps ({:.1} ms)",
        readout.x,
        readout.y,
        readout.elevation,
        readout.motion,
        readout.chunks,
        readout.clock,
        readout.fps,
        readout.frame_ms
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

/// The controls line in the title panel: keyboard hints, or the touch hints
/// once the touch controls are on screen.
fn help_line(touch_visible: bool) -> &'static str {
    if touch_visible {
        "Joystick: mover, a tope correr | SALTAR"
    } else {
        "WASD/Flechas | Espacio: saltar (mantener: volar con jetpack) | Shift: correr | J: jetpack | T: terreno | P: perf | F5: guardar"
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
        motion: match player.swim {
            // In the water: how far under the surface the body is (plunge vs floating).
            Some(swim) => format!(
                "{:?} {} · {:.2} bajo el agua",
                player.motion,
                animation.facing_name(),
                swim.depth
            ),
            None => format!("{:?} {}", player.motion, animation.facing_name()),
        } + if player.jetpack { " · jetpack" } else { "" },
        chunks,
    });
}

/// What the player has kicked up and what the air is carrying, for the readout line.
#[derive(Clone, Copy)]
pub(crate) struct PerfCounts {
    /// Live puffs of dust around the player's feet.
    pub dust: usize,
    /// Ambient particles adrift over the world.
    pub air: usize,
}

/// The overlay: title, help, world readout, performance readout and messages.
/// Returns what was clicked.
pub(crate) fn draw_hud(
    ui: &mut MacroquadUi,
    perf: &PerfLog,
    counts: PerfCounts,
    frame_ms: f64,
    world: HudWorld<'_>,
) -> HudClicks {
    let HudWorld {
        touch_visible,
        phase,
        jetpack,
        clock,
    } = world;
    let width = screen_width();
    let height = screen_height();

    draw_rectangle(20.0, 20.0, 510.0, 124.0, Color::from_rgba(21, 29, 42, 205));
    draw_text("iso-core / Macroquad", 32.0, 58.0, 32.0, WHITE);
    draw_text(help_line(touch_visible), 32.0, 89.0, 18.0, LIGHTGRAY);
    let clicks = HudClicks {
        phase: phase.and_then(draw_phase_buttons),
        jetpack: draw_jetpack_button(jetpack),
    };
    draw_rectangle(
        20.0,
        height - 70.0,
        width - 40.0,
        48.0,
        Color::from_rgba(21, 29, 42, 205),
    );
    let smoothed_fps = perf.fps();
    if let Some((x, y, elev, motion, chunks)) = &ui.hud {
        let readout = Readout {
            x: *x,
            y: *y,
            elevation: *elev,
            motion,
            chunks: *chunks,
            clock,
            fps: smoothed_fps,
            frame_ms,
        };
        let text = world_readout_line(&readout);
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
        format!("{smoothed_fps:.0} fps"),
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
            "cpu p95 {cpu_p95:.1} ms · {} caidos · {} por cpu · polvo {} · aire {}",
            perf.dropped(),
            perf.cpu_dropped(),
            counts.dust,
            counts.air,
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
        draw_text(msg, 32.0, 160.0 + i as f32 * 20.0, 18.0, YELLOW);
    }
    ui.messages.clear();
    clicks
}

#[cfg(test)]
#[path = "hud.test.rs"]
mod tests;
