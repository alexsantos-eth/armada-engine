//! One frame of update: input, fixed-step simulation, chunk streaming and saving.
//!
//! This is the rule half of the frame: it mutates the world, the player and the save. Anything
//! that only draws lives in `game::scene`; the order of the halves is the loop's to decide.

use iso::camera::{
    CAMERA_FOLLOW_HALF_LIFE_MS, CAMERA_LEVEL_SMOOTH_MS, Camera, ScreenSize, follow_camera,
    visible_chunks,
};
use iso::grid::{WorldCoord, to_chunk_coord};
use iso::lighting::phase_at;
use iso::player::physics::{
    get_player_render_position, jump_player, set_player_jetpack, set_player_jump_held,
    set_player_run, step_player,
};
use iso::player::{PLAYER_JUMP_SPEED, PlayerMotionType};
use iso::projection::{GridPoint, ProjectionConfig};
use iso::services::{
    AudioService, InputService, NormalizedInput, SoundEvent, SoundLoop, UiEvent, UiService,
};
use macroquad::prelude::*;

use crate::game::config::{CHUNK_CULL_MARGIN, LAND_SOUND_MIN_IMPACT, UNBOUNDED_CAMERA_LIMITS};
use crate::game::ground::ChunkGround;
use crate::game::scene::frame_projection;
use crate::game::state::Game;
use crate::rendering::depth_of_field::DepthFrame;
use crate::save::{restore_discovered_from_archive, save_archive, sync_manager_to_archive};
use crate::services::MacroquadInput;

/// Ticks to simulate this frame, saturating rather than wrapping at the top of `u32`.
fn frame_ticks(consumed: u64) -> u32 {
    u32::try_from(consumed).unwrap_or(u32::MAX)
}

/// The translation of `camera` a frame after `elapsed_ms`, chasing `target` with the follow
/// half-life. The world bounds never bind; the filter exists so the 50 ms corners of the
/// movement do not reach the screen.
fn camera_after_follow(camera: Camera, target: GridPoint, elapsed_ms: f64) -> Camera {
    follow_camera(
        camera,
        target,
        elapsed_ms,
        UNBOUNDED_CAMERA_LIMITS,
        CAMERA_FOLLOW_HALF_LIFE_MS,
    )
}

/// The loop the motion state wants playing, if any.
fn loop_for_motion(motion: PlayerMotionType) -> Option<SoundLoop> {
    match motion {
        PlayerMotionType::Walking => Some(SoundLoop::Walk),
        PlayerMotionType::Running => Some(SoundLoop::Run),
        PlayerMotionType::Flying => Some(SoundLoop::Jetpack),
        _ => None,
    }
}

/// The one-shot the motion wants when the player enters it, if any.
fn shot_for_entering(motion: PlayerMotionType) -> Option<SoundEvent> {
    match motion {
        PlayerMotionType::Skidding => Some(SoundEvent::Skid),
        PlayerMotionType::Climbing => Some(SoundEvent::Climb),
        _ => None,
    }
}

/// Fires the skid and climb shots and swaps the loop bound to the player's motion state.
/// One call per frame; `last_motion` on `Game` is all the memory it needs.
fn update_motion_audio(game: &mut Game) {
    let motion = game.player.motion;
    if game.last_motion == Some(motion) {
        return;
    }
    game.last_motion = Some(motion);
    if let Some(shot) = shot_for_entering(motion) {
        game.audio.play(shot);
    }
    game.audio.play_loop(loop_for_motion(motion));
}

/// Whether the save should fire now: only with unsaved changes, and only on quit. Players save
/// manually with F5 or Ctrl+S; nothing saves on a timer.
fn should_save_on_quit(unsaved_changes: bool, quitting: bool) -> bool {
    unsaved_changes && quitting
}

/// What a frame spent editing hands to its view: the same measurements an ordinary frame
/// takes, gathered where the editor's own path has them.
struct EditedFrame {
    rp: iso::player::physics::PlayerRenderPosition,
    projection: ProjectionConfig,
    depth: DepthFrame,
    width: f32,
    height: f32,
    frame_ms: f64,
    /// When the frame's world work started, for the performance accounting.
    stream_start: f64,
    /// The shots a scripted frame asks for once this frame is on screen.
    shots: Vec<String>,
}

/// What the view half of the frame needs after the update half ran.
pub(crate) struct FrameView {
    pub(crate) rp: iso::player::physics::PlayerRenderPosition,
    pub(crate) projection: ProjectionConfig,
    /// Where this frame's depths sit on screen, for the depth of field.
    pub(crate) depth: DepthFrame,
    pub(crate) culled: Vec<iso::grid::ChunkCoord>,
    pub(crate) frame_ms: f64,
    /// When the simulation landed, for the frame's performance accounting.
    pub(crate) after_simulation: f64,
    /// Chunk lifecycle work this frame: generation, placement, roads, archive and unload.
    pub(crate) stream_ms: f64,
    /// Shadow bake work this frame: selection, rebake and atlas upload.
    pub(crate) bake_ms: f64,
    /// The shots a scripted frame asks for once this frame is on screen.
    pub(crate) shots: Vec<String>,
}

impl Game {
    /// Straps the jetpack on, or takes it off, on every route. Returns whether it is worn now.
    pub(crate) fn toggle_jetpack(&mut self) -> bool {
        self.jetpack = !self.jetpack;
        self.jetpack
    }

    /// The characters' share of the fixed step: whoever the catalog's NPC entities give birth to in a
    /// chunk on show with its entities placed is alive, and everybody alive wanders `ticks` ticks.
    fn step_npcs(&mut self, ticks: u32) {
        // A chunk on show gives birth to its characters this tick, not whenever its placement
        // thread finishes: the crowd is a function of the seed and the tick, never of timing.
        for coord in self.manager.visible_chunks() {
            self.manager.ensure_entities(coord);
        }
        let manager = &self.manager;
        let live: Vec<iso::grid::ChunkCoord> = manager
            .visible_chunks()
            .into_iter()
            .filter(|coord| manager.entities_chunk(*coord).is_some())
            .collect();
        let ground = ChunkGround { manager };
        let seed = self.world_seed;
        self.npcs.sync(&live, |chunk| {
            iso::npc::spawn_npcs(seed, chunk, &ground, manager.catalog())
        });
        let player = iso::player::physics::get_player_column(GridPoint {
            x: self.player.x,
            y: self.player.y,
        });
        self.npcs.step(&ground, player, ticks);
    }

    /// What the player is striking: the harvest's target while the player is in the gathering
    /// state, for the blow's facing, the swing and the shake.
    pub(crate) fn struck_target(&self) -> Option<iso::harvest::HarvestTarget> {
        (self.player.motion == iso::player::PlayerMotionType::Gathering)
            .then(|| self.harvest_status.target().cloned())
            .flatten()
    }

    /// The harvest's share of the fixed step: picks what is in reach from the chunks around the
    /// player, works on it `ticks` ticks while `held`, and when it is gathered takes it out of the
    /// world and puts its yields away.
    fn step_harvest(&mut self, held: bool, ticks: u32) {
        let at = GridPoint {
            x: self.player.x,
            y: self.player.y,
        };
        let centre = to_chunk_coord(iso::player::physics::get_player_column(at));
        let manager = &self.manager;
        let nearby = (-1..=1)
            .flat_map(|dx| {
                (-1..=1).map(move |dy| iso::grid::ChunkCoord {
                    cx: centre.cx + dx,
                    cy: centre.cy + dy,
                })
            })
            .filter_map(|coord| manager.entities_chunk(coord))
            .flatten();
        let feet = iso::harvest::Feet {
            at,
            elevation: self.player.elevation,
        };
        let target = iso::harvest::pick_harvest_target(feet, nearby, &self.items);
        let status = self.harvester.step(
            iso::harvest::HarvestInput {
                held,
                target: target.as_ref(),
                ticks,
            },
            &self.carried,
            &self.items,
        );
        let color = status
            .target()
            .and_then(|target| self.items.harvest_rule(&target.blueprint))
            .and_then(|rule| rule.yields.first())
            .and_then(|first| self.items.item(&first.item))
            .and_then(iso::items::ItemDef::color);
        let mut felled = None;
        if let iso::harvest::HarvestStatus::Done { target, yields } = &status
            && let Some(taken) = self
                .manager
                .remove_entity_at(target.anchor.x, target.anchor.y)
        {
            if taken.id() == target.id {
                felled = Some(target.clone());
                if let Some(shadows) = self.shadows.as_mut() {
                    shadows.erase(&self.manager, iso::harvest::shadow_area(target.anchor));
                }
                self.drops.spawn(
                    iso::drops::Felled {
                        id: &target.id,
                        anchor: target.anchor,
                        elevation: target.elevation,
                    },
                    yields,
                );
                self.unsaved_changes = true;
            } else {
                self.manager.put_entity(taken);
            }
        }
        let struck = held.then(|| status.target()).flatten();
        let blow = self
            .impacts
            .notice(self.harvester.strikes(), struck, felled.as_ref(), color);
        match blow {
            Some(crate::harvest::impact::Blow::Strike) => self.audio.play(SoundEvent::HarvestHit),
            Some(crate::harvest::impact::Blow::Felled) => self.audio.play(SoundEvent::HarvestFell),
            None => {}
        }
        self.harvest_status = status;
        self.pick_up_drops(ticks);
    }

    /// Picks up the heaps the player stands on: what fits goes to the inventory with a note of
    /// it, and what does not stays on the ground with a note that the inventory is full.
    fn pick_up_drops(&mut self, ticks: u32) {
        let feet = iso::harvest::Feet {
            at: GridPoint {
                x: self.player.x,
                y: self.player.y,
            },
            elevation: self.player.elevation,
        };
        let collected = self
            .drops
            .collect(feet, &mut self.carried.inventory, &self.items, ticks);
        if !collected.gained.is_empty() {
            self.audio.play(SoundEvent::ItemCollect);
            self.gain_note = Some((
                crate::harvest::hotbar::gain_text(&collected.gained, &self.items),
                crate::harvest::hotbar::GAIN_NOTE_MS,
            ));
            self.unsaved_changes = true;
        } else if collected.refused && self.gain_note.is_none() {
            self.gain_note = Some((
                crate::harvest::hotbar::FULL_NOTE.to_owned(),
                crate::harvest::hotbar::GAIN_NOTE_MS,
            ));
        }
    }

    /// Input, ticks and streaming for one frame. Returns `None` when the player asked to quit
    /// (flushing the save first if there is anything unsaved).
    pub(crate) fn update(&mut self, frame_ms: f64) -> Option<FrameView> {
        if is_key_pressed(KeyCode::T) {
            self.show_terrain = !self.show_terrain;
        }
        let save_requested = self.persists
            && (is_key_pressed(KeyCode::F5)
                || (is_key_pressed(KeyCode::S)
                    && (is_key_down(KeyCode::LeftControl) || is_key_down(KeyCode::RightControl))));
        if save_requested {
            sync_manager_to_archive(&mut self.manager, &mut self.archive);
            save_archive(
                &self.archive,
                self.world_seed,
                crate::save::SavedSystems {
                    carried: &self.carried,
                    drops: &self.drops,
                },
            );
            self.unsaved_changes = false;
            self.last_save = get_time();
        }

        let width = screen_width();
        let height = screen_height();

        let (input, shots): (NormalizedInput, Vec<String>) = if self.script.is_some() {
            let (frame, shots) = crate::testbed::advance(self)?;
            let mut input_service = crate::testbed::ScriptInput { frame };
            (input_service.poll(), shots)
        } else {
            let mut input_service = MacroquadInput {
                touch: &mut self.touch,
            };
            (input_service.poll(), Vec::new())
        };
        self.player.walk = input.walk;
        set_player_run(&mut self.player, input.run);
        if input.jetpack_pressed {
            self.toggle_jetpack();
        }
        set_player_jetpack(&mut self.player, self.jetpack);
        let sought = match &self.harvest_status {
            iso::harvest::HarvestStatus::Ready { target }
            | iso::harvest::HarvestStatus::Approaching { target }
            | iso::harvest::HarvestStatus::Working { target, .. }
                if self.streams
                    && input.gather_held
                    && self.player.vertical_speed.is_none()
                    && self.player.swim.is_none() =>
            {
                Some(target.clone())
            }
            _ => None,
        };
        if let Some(target) = sought.as_ref().filter(|target| !target.in_reach) {
            self.player.walk = iso::harvest::approach_walk(
                target,
                GridPoint {
                    x: self.player.x,
                    y: self.player.y,
                },
            );
        }
        let engaged = sought.as_ref().is_some_and(|target| target.in_reach);
        iso::player::physics::set_player_gathering(&mut self.player, engaged);

        if input.jump_pressed {
            jump_player(&mut self.player);
        }
        set_player_jump_held(&mut self.player, input.jump_held);

        if self.streams {
            let focus = to_chunk_coord(WorldCoord {
                x: self.player.x.floor() as i32,
                y: self.player.y.floor() as i32,
            });
            self.manager.set_single_focus(focus);
        }

        let ticks = frame_ticks(self.stepper.consume_frame(frame_ms));
        if ticks > 0 {
            let _ = self.clock.advance(u64::from(ticks));
            let jumps_before = self.player.feedback.jumps;
            let landings_before = self.player.feedback.landings;
            let mut ground = iso::npc::NpcGround {
                ground: ChunkGround {
                    manager: &self.manager,
                },
                npcs: &self.npcs,
            };
            step_player(&mut self.player, &mut ground, ticks);
            if self.streams {
                self.step_npcs(ticks);
                self.step_harvest(input.gather_held, ticks);
            }
            if self.player.feedback.jumps > jumps_before {
                let air = self.player.feedback.air_jump;
                self.audio.play(if air {
                    SoundEvent::AirJump
                } else {
                    SoundEvent::Jump
                });
            }
            if self.player.feedback.landings > landings_before {
                let impact = self.player.feedback.impact;
                if impact >= LAND_SOUND_MIN_IMPACT {
                    self.audio.play_with_volume(
                        SoundEvent::Land,
                        (impact / PLAYER_JUMP_SPEED).clamp(0.0, 1.0),
                    );
                }
            }
        }
        update_motion_audio(self);
        if let Some((_, left)) = self.gain_note.as_mut() {
            *left -= frame_ms;
        }
        if self
            .gain_note
            .as_ref()
            .is_some_and(|(_, left)| *left <= 0.0)
        {
            self.gain_note = None;
        }

        let rp = get_player_render_position(&self.player, self.stepper.interpolation_alpha());

        self.camera = camera_after_follow(self.camera, GridPoint { x: rp.x, y: rp.y }, frame_ms);
        let level =
            self.camera_focus
                .advance(&rp, self.player.motion, frame_ms, CAMERA_LEVEL_SMOOTH_MS);
        let projection = frame_projection(self.camera, level, width, height, self.tile_metrics);
        let feet = GridPoint {
            x: rp.x + 0.5,
            y: rp.y + 0.5,
        };
        let depth = DepthFrame::new(projection, level, height, feet);

        let stream_start = get_time();
        if let Some(mut session) = self.maker.take() {
            let edited = session.update(crate::maker::MakerFrame {
                manager: &mut self.manager,
                look: &mut self.terrain_look,
                projection,
            });
            self.maker = Some(session);
            if let Some(chunk) = edited
                && let Some(shadows) = self.shadows.as_mut()
            {
                shadows.forget(chunk);
            }
        }
        if !self.streams {
            if is_quit_requested() {
                return None;
            }
            return Some(self.editing_view(EditedFrame {
                rp,
                projection,
                depth,
                width,
                height,
                frame_ms,
                stream_start,
                shots,
            }));
        }
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
        if self.persists && should_save_on_quit(self.unsaved_changes, quitting) {
            sync_manager_to_archive(&mut self.manager, &mut self.archive);
            save_archive(
                &self.archive,
                self.world_seed,
                crate::save::SavedSystems {
                    carried: &self.carried,
                    drops: &self.drops,
                },
            );
            self.unsaved_changes = false;
            self.last_save = get_time();
        }
        if quitting {
            return None;
        }
        let stream_ms = (get_time() - stream_start) * 1000.0;

        let after_simulation = get_time();

        let viewport = ScreenSize {
            width: f64::from(width),
            height: f64::from(height),
        };
        let culled = visible_chunks(self.camera, viewport, projection, CHUNK_CULL_MARGIN);
        let fade_dt = (frame_ms / 1000.0) as f32;
        let target_phase = self
            .phase_override
            .unwrap_or_else(|| phase_at(self.clock.tick));
        let bake_start = get_time();
        if let Some(shadows) = self.shadows.as_mut() {
            shadows.set_phase(target_phase);
            shadows.update(&self.manager, &culled, fade_dt);
        }
        let bake_ms = (get_time() - bake_start) * 1000.0;
        self.lit = self.settled(&culled);
        self.shown.clone_from(&culled);

        Some(FrameView {
            rp,
            projection,
            depth,
            culled,
            frame_ms,
            after_simulation,
            stream_ms,
            bake_ms,
            shots,
        })
    }

    /// The view of a frame spent editing: the one chunk in hand, its light baked again when a
    /// stroke changed it, and no streaming, saving or unloading at all.
    fn editing_view(&mut self, frame: EditedFrame) -> FrameView {
        let EditedFrame {
            rp,
            projection,
            depth,
            width,
            height,
            frame_ms,
            stream_start,
            shots,
        } = frame;
        let stream_ms = (get_time() - stream_start) * 1000.0;
        let after_simulation = get_time();
        let viewport = ScreenSize {
            width: f64::from(width),
            height: f64::from(height),
        };
        let culled = visible_chunks(self.camera, viewport, projection, CHUNK_CULL_MARGIN);
        let target_phase = self
            .phase_override
            .unwrap_or_else(|| phase_at(self.clock.tick));
        let bake_start = get_time();
        if let Some(shadows) = self.shadows.as_mut() {
            shadows.set_phase(target_phase);
            shadows.update(&self.manager, &culled, (frame_ms / 1000.0) as f32);
        }
        let bake_ms = (get_time() - bake_start) * 1000.0;
        self.lit = self.settled(&culled);
        self.shown.clone_from(&culled);
        FrameView {
            rp,
            projection,
            depth,
            culled,
            frame_ms,
            after_simulation,
            stream_ms,
            bake_ms,
            shots,
        }
    }

    /// Whether what is on screen is ready to be looked at: every chunk shown generated, and its
    /// shadows baked for the phase in hand and faded all the way in. With no baked shadows at
    /// all there is nothing to wait for, so it answers yes.
    fn settled(&self, culled: &[iso::grid::ChunkCoord]) -> bool {
        if !culled.iter().all(|coord| self.manager.is_visible(*coord)) {
            return false;
        }
        self.shadows
            .as_ref()
            .is_none_or(|shadows| shadows.settled(&self.manager, culled))
    }
}

#[cfg(test)]
#[path = "frame.test.rs"]
mod tests;
