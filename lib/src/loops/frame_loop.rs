//! The order of one frame: update the world, assemble the scene, draw it, paint the overlay.
//!
//! Nothing here decides anything; every step delegates to its domain. The loop exists so the
//! frame's shape stays declarative and readable in one place. The overlay (HUD, border and
//! messages) is route-gated through `gui::overlay_enabled` — `/` paints none of it on the
//! web build — and the one decision it owns itself, the perf sample's arithmetic, is
//! extracted and tested in `frame_loop.test.rs`; the rest is window/GPU sequencing whose
//! steps all live in tested modules (`game::frame`, `game::scene`, `gui`), checked manually
//! with `scripts/run-native.sh`.

use iso::services::AudioService;
use macroquad::prelude::*;

use crate::assets::sprites::{draw_depth, draw_sorted};
use crate::game::Game;
use crate::gui::{draw_hud, push_hud_update};
use crate::loops::clock::{FrameClock, frame_timestamp_seconds};
use crate::perf::FrameSample;

/// Whether the mouse or a finger is down on the HUD's action button.
fn action_pressed(layout: &crate::ui::HudLayout) -> bool {
    let (mx, my) = mouse_position();
    (is_mouse_button_down(MouseButton::Left) && layout.action_hit(mx, my))
        || touches().iter().any(|touch| {
            !matches!(touch.phase, TouchPhase::Ended | TouchPhase::Cancelled)
                && layout.action_hit(touch.position.x, touch.position.y)
        })
}

/// How long a scripted frame counts as, whatever the window measured: one fixed step, so a
/// scene's shots do not depend on how fast the machine drew them.
const SCRIPTED_FRAME_MS: f64 = iso::simulation::STEP_MS;

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
    stream_ms: f64,
    bake_ms: f64,
    sprites: usize,
    chunks: usize,
    chunks_alive: usize,
) -> FrameSample {
    FrameSample {
        frame_ms,
        simulation_ms: (marks.after_simulation - marks.frame_start) * 1000.0,
        scene_ms: (marks.after_collect - marks.after_simulation) * 1000.0,
        draw_ms: (marks.after_draw - marks.after_collect) * 1000.0,
        stream_ms,
        bake_ms,
        sprites,
        chunks,
        chunks_alive,
    }
}

/// Runs the game until the player quits.
pub(crate) async fn run(mut game: Game) {
    let route = crate::gui::current();
    let mut show_overlay = route.shows_overlay();
    let scripted = game.script.is_some();
    let initial_phase = game
        .shadows
        .as_ref()
        .map(crate::lighting::shadow_view::ShadowScene::phase)
        .unwrap_or_else(|| iso::lighting::phase_at(game.clock.tick));
    let mut grade_transition = crate::rendering::grade::GradeTransition::new(
        crate::rendering::grade::grade_for(initial_phase),
    );
    let mut clock = FrameClock::new();
    loop {
        let frame_start = get_time();
        let frame_ms = if scripted {
            SCRIPTED_FRAME_MS
        } else {
            clock.tick(
                frame_timestamp_seconds(),
                f64::from(get_frame_time()) * 1000.0,
            )
        };

        let Some(view) = game.update(frame_ms) else {
            return;
        };
        let after_simulation = view.after_simulation;

        let phase = game
            .shadows
            .as_ref()
            .map(crate::lighting::shadow_view::ShadowScene::phase);
        let effective_phase = phase.unwrap_or_else(|| iso::lighting::phase_at(game.clock.tick));
        grade_transition.set_target(crate::rendering::grade::grade_for(effective_phase));
        let grade = grade_transition.advance((frame_ms / 1000.0) as f32);

        let width = screen_width();
        let height = screen_height();

        game.scene_target.resize(width, height);
        game.depth_target.resize(width, height);
        game.scene_target.begin();
        clear_background(Color::from_rgba(21, 29, 42, 255));
        let stats = game.collect_scene(&view);

        let after_collect = get_time();
        draw_sorted(&mut game.atlas, game.material.as_ref(), &mut game.draws);
        game.draw_clouds(frame_ms, &view.projection);
        // The icon over a market is part of the world: it goes into the scene (before the
        // depth pass, which switches the camera away) so the presentation pass, and the blur of
        // an open menu, treat it like everything else.
        if let Some(skin) = game.clay_skin.as_ref().filter(|_| game.streams) {
            crate::ui::draw_market_marks(skin, &game.market_marks, game.clay_hud.clock_ms);
        }
        if let Some(depth) = game.depth_material.as_ref() {
            game.depth_target.begin(depth, &view.depth);
            draw_depth(&mut game.atlas, &game.draws, &view.depth);
            game.depth_target.end();
        }
        game.menu_blur =
            crate::rendering::backdrop::fade(game.menu_blur, game.menu_open(), frame_ms);
        game.scene_target.present(
            game.grade.as_ref(),
            &grade,
            (game.depth_target.texture(), view.depth.focus()),
            game.menu_blur,
        );
        let picked = std::mem::take(&mut game.pending_gains);
        let mut stick_tool = None;
        if let Some(skin) = game.clay_skin.as_ref().filter(|_| game.streams) {
            let chest = game.player_chest(&view);
            let at = crate::harvest::hud_frame::screen_share(chest.x, chest.y, width, height);
            // The work progress appears just above the player while they harvest.
            let progress_at = game.harvest_status.target().map(|_target| {
                let chest = game.player_chest(&view);
                (chest.x as f32, chest.y as f32)
            });
            let frame = crate::harvest::hud_frame::hud_frame(
                &game.carried,
                &game.items,
                &game.harvest_status,
                game.gain_note.as_ref().map(|(text, _)| text.as_str()),
                game.touch.visible(),
                progress_at,
                game.merchant.is_some() && game.shop.is_none(),
            );
            let gains = crate::harvest::hud_frame::gains(&picked, &game.items, at);
            let layout = crate::ui::HudLayout::new(width, height, frame.slots.len(), frame.touch);
            let pack =
                crate::ui::PackLayout::new(width, height, frame.slots.len(), frame.tools.len());
            game.clay_hud.apply(&frame, &gains, (width, height));
            game.clay_hud.advance(frame_ms);
            game.clay_hud.held = frame.action.is_some() && action_pressed(&layout);
            // The backpack opens from a press on its icon or from the I key; Escape closes it.
            // While the shop is open it is the menu on screen, so the backpack waits.
            if game.shop.is_none() {
                let presses: Vec<Touch> = crate::game::shop::pointer_taps()
                    .into_iter()
                    .map(|(x, y)| Touch {
                        id: 0,
                        phase: TouchPhase::Started,
                        position: vec2(x, y),
                    })
                    .collect();
                let sound = if is_key_pressed(KeyCode::I) {
                    Some(game.clay_hud.toggle_inventory())
                } else if is_key_pressed(KeyCode::Escape) {
                    game.clay_hud.close_inventory()
                } else {
                    game.clay_hud.update_inventory(&layout, &pack, &presses)
                };
                if let Some(sound) = sound {
                    game.audio.play(sound);
                }
            }
            crate::ui::draw_clay_hud(skin, &game.clay_hud, &frame, &layout);
            game.toasts.advance(frame_ms);
            game.draw_economy(skin);
            stick_tool = frame.action.as_ref().map(|action| action.tool.clone());
        } else if game.streams {
            let prompt = crate::harvest::hotbar::prompt(&game.harvest_status);
            crate::harvest::hotbar::draw_hotbar(
                &game.carried,
                &game.items,
                prompt.as_ref(),
                game.gain_note.as_ref().map(|(text, _)| text.as_str()),
            );
        }
        crate::testbed::write_shots(&mut game, &view.shots);
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
            view.stream_ms,
            view.bake_ms,
            stats.sprites,
            stats.chunks_drawn,
            game.manager.discovered_count(),
        ));
        if route.toggles_overlay() && is_key_pressed(KeyCode::H) {
            show_overlay = !show_overlay;
        }
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
            let time_text = iso::time::format_clock_time(iso::time::clock_time(game.clock.tick));
            let clicks = draw_hud(
                &mut game.ui,
                &game.perf,
                crate::gui::PerfCounts {
                    dust: game.dust.live(),
                    air: game.particles.live() + game.fire.live() + game.emitters.live(),
                },
                frame_ms,
                crate::gui::HudWorld {
                    touch_visible,
                    phase,
                    jetpack: game.jetpack,
                    clock: &time_text,
                },
            );
            if let Some(clicked) = clicks.phase {
                game.phase_override = match game.phase_override {
                    Some(current) if current == clicked => None,
                    _ => Some(clicked),
                };
            }
            if clicks.jetpack {
                game.toggle_jetpack();
            }
        } else {
            game.ui.messages.clear();
        }

        if let Some(session) = game.maker.take() {
            session.draw(&game.manager, view.projection);
            game.maker = Some(session);
        }

        if game.touch.visible() && !game.menu_open() {
            match game.clay_skin.as_ref() {
                Some(skin) => crate::ui::draw_clay_stick(
                    skin,
                    &game.touch.view(width, height),
                    stick_tool.as_deref(),
                    game.clay_hud.clock_ms,
                ),
                None => game.touch.draw(),
            }
        }

        next_frame().await;
    }
}

#[cfg(test)]
#[path = "frame_loop.test.rs"]
mod tests;
