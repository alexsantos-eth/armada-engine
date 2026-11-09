//! One frame of update: input, fixed-step simulation, chunk streaming and saving.
//!
//! This is the rule half of the frame: it mutates the world, the player and the save. Anything
//! that only draws lives in `game::scene`; the order of the halves is the loop's to decide.

use iso::camera::{CAMERA_LEVEL_SMOOTH_MS, ScreenSize, visible_chunks};
use iso::grid::{WorldCoord, to_chunk_coord};
use iso::player::physics::{
    get_player_render_position, jump_player, set_player_jump_held, set_player_run, step_player,
};
use iso::projection::ProjectionConfig;
use iso::services::{AudioService, InputService, NormalizedInput, SoundEvent, UiEvent, UiService};
use macroquad::prelude::*;

use crate::game::config::{AUTOSAVE_SECONDS, CHUNK_CULL_MARGIN};
use crate::game::ground::ChunkGround;
use crate::game::scene::frame_projection;
use crate::game::state::Game;
use crate::save::{restore_discovered_from_archive, save_archive, sync_manager_to_archive};
use crate::services::MacroquadInput;

/// Ticks to simulate this frame, saturating rather than wrapping at the top of `u32`.
fn frame_ticks(consumed: u64) -> u32 {
    u32::try_from(consumed).unwrap_or(u32::MAX)
}

/// Whether the periodic save should fire now: only with unsaved changes, and only on quit or
/// once the safety-net interval elapsed.
fn should_autosave(unsaved_changes: bool, quitting: bool, since_last_save_seconds: f64) -> bool {
    unsaved_changes && (quitting || since_last_save_seconds > AUTOSAVE_SECONDS)
}

/// What the view half of the frame needs after the update half ran.
pub(crate) struct FrameView {
    pub(crate) rp: iso::player::physics::PlayerRenderPosition,
    pub(crate) projection: ProjectionConfig,
    pub(crate) culled: Vec<iso::grid::ChunkCoord>,
    pub(crate) frame_ms: f64,
    /// When the simulation landed, for the frame's performance accounting.
    pub(crate) after_simulation: f64,
}

impl Game {
    /// Input, ticks and streaming for one frame. Returns `None` when the player asked to quit
    /// (flushing the save first if there is anything unsaved).
    pub(crate) fn update(&mut self, frame_ms: f64) -> Option<FrameView> {
        if is_key_pressed(KeyCode::T) {
            self.show_terrain = !self.show_terrain;
        }
        let save_requested = is_key_pressed(KeyCode::F5)
            || (is_key_pressed(KeyCode::S)
                && (is_key_down(KeyCode::LeftControl) || is_key_down(KeyCode::RightControl)));
        if save_requested {
            sync_manager_to_archive(&self.manager, &mut self.archive);
            save_archive(&self.archive);
            self.unsaved_changes = false;
            self.last_save = get_time();
        }

        let width = screen_width();
        let height = screen_height();

        let mut input_service = MacroquadInput {
            touch: &mut self.touch,
        };
        let input: NormalizedInput = input_service.poll();
        self.player.walk = input.walk;
        set_player_run(&mut self.player, input.run);

        if input.jump_pressed {
            jump_player(&mut self.player);
        }
        set_player_jump_held(&mut self.player, input.jump_held);

        let focus = to_chunk_coord(WorldCoord {
            x: self.player.x.floor() as i32,
            y: self.player.y.floor() as i32,
        });
        self.manager.set_single_focus(focus);

        let ticks = frame_ticks(self.stepper.consume_frame(frame_ms));
        if ticks > 0 {
            let jumps_before = self.player.feedback.jumps;
            let landings_before = self.player.feedback.landings;
            let mut ground = ChunkGround {
                manager: &self.manager,
            };
            step_player(&mut self.player, &mut ground, ticks);
            if self.player.feedback.jumps > jumps_before {
                self.audio.play(SoundEvent::Jump);
            }
            if self.player.feedback.landings > landings_before {
                self.audio.play(SoundEvent::Land);
            }
        }

        let rp = get_player_render_position(&self.player, self.stepper.interpolation_alpha());

        self.camera.x = rp.x;
        self.camera.y = rp.y;
        let level =
            self.camera_focus
                .advance(&rp, self.player.motion, frame_ms, CAMERA_LEVEL_SMOOTH_MS);
        let projection = frame_projection(self.camera, level, width, height);

        let discovered = self.manager.tick();
        if !discovered.is_empty() {
            self.unsaved_changes = true;
            for id in restore_discovered_from_archive(&mut self.manager, &self.archive, &discovered)
            {
                self.ui.push(UiEvent::Message {
                    text: format!("partida guardada con una entidad desconocida: {id}"),
                });
            }
        }

        if let Some(stale) = self.manager.next_unload_candidate()
            && let Some(saved) = self.manager.unload_chunk(stale)
        {
            self.archive.put(saved);
            self.unsaved_changes = true;
        }

        let quitting = is_quit_requested();
        if should_autosave(self.unsaved_changes, quitting, get_time() - self.last_save) {
            sync_manager_to_archive(&self.manager, &mut self.archive);
            save_archive(&self.archive);
            self.unsaved_changes = false;
            self.last_save = get_time();
        }
        if quitting {
            return None;
        }

        let after_simulation = get_time();

        let viewport = ScreenSize {
            width: f64::from(width),
            height: f64::from(height),
        };
        let culled = visible_chunks(self.camera, viewport, projection, CHUNK_CULL_MARGIN);
        if let Some(shadows) = self.shadows.as_mut() {
            shadows.update(&self.manager, &culled);
        }

        Some(FrameView {
            rp,
            projection,
            culled,
            frame_ms,
            after_simulation,
        })
    }
}

#[cfg(test)]
#[path = "frame.test.rs"]
mod tests;
