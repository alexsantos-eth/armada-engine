//! Concrete implementations of the armada-core service traits for the Macroquad client.

use armada_core::grid::ChunkCoord;
use armada_core::projection::GridPoint;
use armada_core::services::{AudioService, ChunkLoader, InputService, NormalizedInput, SoundEvent, UiEvent, UiService};
use armada_core::terrain::TerrainColumn;
use armada_core::world::ChunkManager;
use macroquad::prelude::*;

/// Input service backed by Macroquad's keyboard state.
pub struct MacroquadInput;

impl InputService for MacroquadInput {
    fn poll(&mut self) -> NormalizedInput {
        let left = is_key_down(KeyCode::Left) || is_key_down(KeyCode::A);
        let right = is_key_down(KeyCode::Right) || is_key_down(KeyCode::D);
        let up = is_key_down(KeyCode::Up) || is_key_down(KeyCode::W);
        let down = is_key_down(KeyCode::Down) || is_key_down(KeyCode::S);
        let across: f64 = if right { 1.0 } else { 0.0 } - if left { 1.0 } else { 0.0 };
        let vertical: f64 = if up { 1.0 } else { 0.0 } - if down { 1.0 } else { 0.0 };
        let len: f64 = (across * across + vertical * vertical).sqrt();
        let walk = if len > 0.0 {
            GridPoint { x: across / len, y: vertical / len }
        } else {
            GridPoint { x: 0.0, y: 0.0 }
        };
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
        Self { volume: 1.0, events: Vec::new() }
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
            UiEvent::HudUpdate { x, y, elevation, motion, chunks } => {
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
        // Trigger discovery by setting focus and ticking.
        self.manager.set_focus(vec![coord]);
        self.manager.tick();
        self.manager.terrain_chunk(coord).map(|c| c.to_vec())
    }
}