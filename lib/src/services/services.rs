//! Concrete implementations of the iso service traits for the Macroquad client.

use iso::grid::ChunkCoord;
use iso::player::physics::{ScreenDirections, get_walk_direction};
use iso::services::{
    AudioService, ChunkLoader, InputService, NormalizedInput, SoundEvent, UiEvent, UiService,
};
use iso::terrain::TerrainColumn;
use iso::world::ChunkManager;
use macroquad::prelude::*;

/// Input service backed by Macroquad's keyboard state.
pub struct MacroquadInput;

impl InputService for MacroquadInput {
    fn poll(&mut self) -> NormalizedInput {
        let directions = ScreenDirections {
            up: is_key_down(KeyCode::Up) || is_key_down(KeyCode::W),
            down: is_key_down(KeyCode::Down) || is_key_down(KeyCode::S),
            left: is_key_down(KeyCode::Left) || is_key_down(KeyCode::A),
            right: is_key_down(KeyCode::Right) || is_key_down(KeyCode::D),
        };
        let walk = get_walk_direction(&directions);
        NormalizedInput {
            walk,
            jump_pressed: is_key_pressed(KeyCode::Space),
            jump_held: is_key_down(KeyCode::Space),
            run: is_key_down(KeyCode::LeftShift) || is_key_down(KeyCode::RightShift),
            jetpack: is_key_down(KeyCode::J),
        }
    }
}

/// Audio service. Macroquad has no bundled sound files yet, so events are recorded
/// and (when sounds are available) played back. Volume is clamped to [0, 1].
pub struct MacroquadAudio {
    pub volume: f64,
    pub events: Vec<SoundEvent>,
}

impl Default for MacroquadAudio {
    fn default() -> Self {
        Self {
            volume: 1.0,
            events: Vec::new(),
        }
    }
}

impl AudioService for MacroquadAudio {
    fn play(&mut self, event: SoundEvent) {
        self.events.push(event);
        // TODO: play the corresponding macroquad::audio::Sound once assets exist.
    }
    fn set_volume(&mut self, volume: f64) {
        self.volume = volume.clamp(0.0, 1.0);
    }
}

/// UI service that collects messages for the current frame.
#[derive(Default)]
pub struct MacroquadUi {
    pub messages: Vec<String>,
    pub hud: Option<(f64, f64, i32, String, usize)>,
}

impl UiService for MacroquadUi {
    fn push(&mut self, event: UiEvent) {
        match event {
            UiEvent::Message { text } => self.messages.push(text),
            UiEvent::HudUpdate {
                x,
                y,
                elevation,
                motion,
                chunks,
            } => {
                self.hud = Some((x, y, elevation, motion, chunks));
            }
            UiEvent::ChunkDiscovered { .. } => {}
        }
    }
}

/// Chunk loader backed by a `ChunkManager`.
#[allow(dead_code)]
pub struct MacroquadChunkLoader<'a> {
    pub manager: &'a mut ChunkManager,
}

impl ChunkLoader for MacroquadChunkLoader<'_> {
    fn chunk(&self, coord: ChunkCoord) -> Option<&[TerrainColumn]> {
        self.manager.terrain_chunk(coord)
    }
    fn discover(&mut self, coord: ChunkCoord) -> Option<Vec<TerrainColumn>> {
        if self.manager.is_discovered(coord) {
            return self.manager.terrain_chunk(coord).map(|c| c.to_vec());
        }
        // Discovery goes through the focus list, so the caller's focus has to be put back:
        // leaving `coord` as the only focus would move streaming away from the player and
        // unload the ground under them on the next tick.
        let previous: Vec<ChunkCoord> = self.manager.focus().to_vec();
        self.manager.set_focus(vec![coord]);
        self.manager.tick();
        self.manager.set_focus(previous);
        self.manager.terrain_chunk(coord).map(|c| c.to_vec())
    }
}
