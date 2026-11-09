//! Concrete implementations of the iso service traits for the Macroquad client.

use iso::grid::ChunkCoord;
use iso::player::physics::{ScreenDirections, get_walk_direction};
use iso::projection::GridPoint;
use iso::services::{
    AudioService, ChunkLoader, InputService, NormalizedInput, SoundEvent, UiEvent, UiService,
};
use iso::terrain::TerrainColumn;
use iso::world::ChunkManager;
use macroquad::prelude::*;

use crate::touch::{RawTouch, RawTouchPhase, TouchControls};

/// Input service backed by Macroquad's keyboard and, on touch devices, the virtual controls.
pub struct MacroquadInput<'a> {
    pub touch: &'a mut TouchControls,
}

const fn touch_phase(phase: TouchPhase) -> RawTouchPhase {
    match phase {
        TouchPhase::Started => RawTouchPhase::Started,
        TouchPhase::Stationary => RawTouchPhase::Stationary,
        TouchPhase::Moved => RawTouchPhase::Moved,
        TouchPhase::Ended => RawTouchPhase::Ended,
        TouchPhase::Cancelled => RawTouchPhase::Cancelled,
    }
}

impl InputService for MacroquadInput<'_> {
    fn poll(&mut self) -> NormalizedInput {
        let directions = ScreenDirections {
            up: is_key_down(KeyCode::Up) || is_key_down(KeyCode::W),
            down: is_key_down(KeyCode::Down) || is_key_down(KeyCode::S),
            left: is_key_down(KeyCode::Left) || is_key_down(KeyCode::A),
            right: is_key_down(KeyCode::Right) || is_key_down(KeyCode::D),
        };
        let raw: Vec<RawTouch> = touches()
            .iter()
            .map(|touch| RawTouch {
                id: touch.id,
                phase: touch_phase(touch.phase),
                x: touch.position.x,
                y: touch.position.y,
            })
            .collect();
        let frame = self.touch.update(screen_width(), screen_height(), &raw);
        let keyboard = get_walk_direction(&directions);
        let mut x = keyboard.x + frame.walk.x;
        let mut y = keyboard.y + frame.walk.y;
        let len = x.hypot(y);
        if len > 1.0 {
            x /= len;
            y /= len;
        }
        NormalizedInput {
            walk: GridPoint { x, y },
            jump_pressed: is_key_pressed(KeyCode::Space) || frame.jump_pressed,
            jump_held: is_key_down(KeyCode::Space) || frame.jump_held,
            run: is_key_down(KeyCode::LeftShift) || is_key_down(KeyCode::RightShift) || frame.run,
            jetpack: is_key_down(KeyCode::J),
        }
    }
}

/// Audio service. Macroquad has no bundled sound files yet, so events are recorded
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
        let previous: Vec<ChunkCoord> = self.manager.focus().to_vec();
        self.manager.set_focus(vec![coord]);
        self.manager.tick();
        self.manager.set_focus(previous);
        self.manager.terrain_chunk(coord).map(|c| c.to_vec())
    }
}

#[cfg(test)]
#[path = "macroquad_adapters.test.rs"]
mod tests;
