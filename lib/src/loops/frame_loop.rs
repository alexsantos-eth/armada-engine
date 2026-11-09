//! The order of one frame: update the world, assemble the scene, draw it, paint the overlay.
//!
//! Nothing here decides anything; every step delegates to its domain. The loop exists so the
//! frame's shape stays declarative and readable in one place. The overlay (HUD, border and
//! messages) is route-gated through `gui::overlay_enabled` — `/` paints none of it on the
//! web build — and the one decision it owns itself, the perf sample's arithmetic, is
//! extracted and tested in `frame_loop.test.rs`; the rest is window/GPU sequencing whose
//! steps all live in tested modules (`game::frame`, `game::scene`, `gui`), checked manually
//! with `scripts/run-native.sh`.

use macroquad::prelude::*;

use crate::assets::sprites::draw_sorted;
use crate::game::Game;
use crate::game::config::DEFAULT_PHASE;
use crate::gui::{draw_hud, overlay_enabled, push_hud_update};
use crate::perf::FrameSample;

/// The instants the loop takes through a frame, in macroquad's seconds.
struct FrameMarks {
    frame_start: f64,
    after_simulation: f64,
    after_collect: f64,
    after_draw: f64,
}

/// The frame's measurements for the perf log: each section's cost is the gap between two of
/// the marks the loop took, in milliseconds.
fn frame_sample(
    frame_ms: f64,
    marks: FrameMarks,
    sprites: usize,
    chunks: usize,
    chunks_alive: usize,
) -> FrameSample {
    FrameSample {
        frame_ms,
        simulation_ms: (marks.after_simulation - marks.frame_start) * 1000.0,
        scene_ms: (marks.after_collect - marks.after_simulation) * 1000.0,
        draw_ms: (marks.after_draw - marks.after_collect) * 1000.0,
        sprites,
        chunks,
        chunks_alive,
    }
}

/// Runs the game until the player quits.
pub(crate) async fn run(mut game: Game) {
    let show_overlay = overlay_enabled();
    loop {
        let frame_start = get_time();
        let frame_ms = f64::from(get_frame_time()) * 1000.0;

        let Some(view) = game.update(frame_ms) else {
            return;
        };
        let after_simulation = view.after_simulation;

        let phase = game
            .shadows
            .as_ref()
            .map(crate::lighting::shadow_view::ShadowScene::phase);
        let grade = crate::rendering::grade::grade_for(phase.unwrap_or(DEFAULT_PHASE));

        let width = screen_width();
        let height = screen_height();

        game.scene_target.resize(width, height);
        game.scene_target.begin();
        clear_background(Color::from_rgba(21, 29, 42, 255));
        let stats = game.collect_scene(&view);

        let after_collect = get_time();
        draw_sorted(&game.atlas, game.material.as_ref(), &mut game.draws);
        game.draw_clouds(frame_ms, &view.projection);
        game.scene_target.present(game.grade.as_ref(), &grade);
        if show_overlay {
            draw_rectangle_lines(16.0, 16.0, width - 32.0, height - 32.0, 2.0, SKYBLUE);
        }
        let after_draw = get_time();

        game.perf.push(frame_sample(
            frame_ms,
            FrameMarks {
                frame_start,
                after_simulation,
                after_collect,
                after_draw,
            },
            stats.sprites,
            stats.chunks_drawn,
            game.manager.discovered_count(),
        ));
        if is_key_pressed(KeyCode::P) {
            info!("{}", game.perf.summary());
        }

        if show_overlay {
            let elevation = game.player.elevation.floor() as i32;
            let chunks_alive = game.manager.discovered_count();
            push_hud_update(
                &mut game.ui,
                &game.player,
                &game.animation,
                elevation,
                chunks_alive,
            );
            let touch_visible = game.touch.visible();
            if let Some(clicked) = draw_hud(
                &mut game.ui,
                &game.perf,
                game.dust.live(),
                frame_ms,
                touch_visible,
                phase,
            ) && let Some(shadows) = game.shadows.as_mut()
            {
                shadows.set_phase(clicked);
            }
        } else {
            game.ui.messages.clear();
        }

        game.touch.draw();

        next_frame().await;
    }
}

#[cfg(test)]
#[path = "frame_loop.test.rs"]
mod tests;
