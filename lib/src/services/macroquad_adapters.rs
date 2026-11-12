//! Concrete implementations of the iso service traits for the Macroquad client.

use std::collections::HashMap;

use iso::player::physics::{ScreenDirections, get_walk_direction};
use iso::projection::GridPoint;
use iso::services::{
    AudioService, InputService, NormalizedInput, SoundEvent, SoundLoop, UiEvent, UiService,
};
use macroquad::audio::Sound;
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

/// Sounds the client bundles, as one statically-generated WAV per semantic name. The files are
/// rendered from the `.strudel` sources with the superdough engine (see `tools/sound-export/`).
const SOUND_FILES: [(SoundEvent, &str); 6] = [
    (SoundEvent::Jump, "jump.wav"),
    (SoundEvent::AirJump, "air-jump.wav"),
    (SoundEvent::Land, "land.wav"),
    (SoundEvent::Rejection, "reject.wav"),
    (SoundEvent::Skid, "skid.wav"),
    (SoundEvent::Climb, "climb.wav"),
];

/// Looping sounds the client bundles; see [`SOUND_FILES`].
const LOOP_FILES: [(SoundLoop, &str); 4] = [
    (SoundLoop::Walk, "walk.wav"),
    (SoundLoop::Run, "run.wav"),
    (SoundLoop::Jetpack, "jetpack.wav"),
    (SoundLoop::Dance, "dance.wav"),
];

/// Where a bundled sound is fetched from, as the world content does.
#[cfg(target_arch = "wasm32")]
fn sound_path(path: &str) -> String {
    format!("./{path}")
}

/// Where a bundled sound is fetched from, as the world content does.
#[cfg(not(target_arch = "wasm32"))]
fn sound_path(path: &str) -> String {
    crate::app::asset_path(path)
}

/// Audio service. Plays the bundled WAVs through macroquad's audio; events are recorded so
/// tests (and the silent adapter, which is what `Default` gives) can observe them.
pub struct MacroquadAudio {
    pub volume: f64,
    pub events: Vec<SoundEvent>,
    sounds: HashMap<SoundEvent, Sound>,
    loops: HashMap<SoundLoop, Sound>,
    current_loop: Option<SoundLoop>,
}

impl MacroquadAudio {
    /// Loads every bundled sound. A file that cannot be loaded logs a warning and its event
    /// stays silent, like the previous silent adapter.
    pub async fn load() -> Self {
        let mut sounds = HashMap::new();
        for (event, file) in SOUND_FILES {
            let path = sound_path(&format!("content/sounds/{file}"));
            match macroquad::audio::load_sound(&path).await {
                Ok(sound) => {
                    sounds.insert(event, sound);
                }
                Err(error) => eprintln!("[audio] {file} not loaded: {error}"),
            }
        }
        let mut loops = HashMap::new();
        for (loop_, file) in LOOP_FILES {
            let path = sound_path(&format!("content/sounds/{file}"));
            match macroquad::audio::load_sound(&path).await {
                Ok(sound) => {
                    loops.insert(loop_, sound);
                }
                Err(error) => eprintln!("[audio] {file} not loaded: {error}"),
            }
        }
        Self {
            volume: 1.0,
            events: Vec::new(),
            sounds,
            loops,
            current_loop: None,
        }
    }

    /// The effective loudness of a one-shot played at `gain` (0.0..=1.0), scaled by the master volume.
    fn effective_volume(&self, gain: f64) -> f32 {
        (self.volume.clamp(0.0, 1.0) * gain.clamp(0.0, 1.0)) as f32
    }

    fn stop_current_loop(&mut self) {
        if let Some(current) = self.current_loop.take()
            && let Some(sound) = self.loops.get(&current)
        {
            macroquad::audio::stop_sound(sound);
        }
    }
}

impl Default for MacroquadAudio {
    fn default() -> Self {
        Self {
            volume: 1.0,
            events: Vec::new(),
            sounds: HashMap::new(),
            loops: HashMap::new(),
            current_loop: None,
        }
    }
}

impl AudioService for MacroquadAudio {
    fn play(&mut self, event: SoundEvent) {
        self.events.push(event.clone());
        if let Some(sound) = self.sounds.get(&event) {
            macroquad::audio::play_sound(
                sound,
                macroquad::audio::PlaySoundParams {
                    looped: false,
                    volume: self.effective_volume(1.0),
                },
            );
        }
    }

    fn play_with_volume(&mut self, event: SoundEvent, volume: f64) {
        self.events.push(event.clone());
        if let Some(sound) = self.sounds.get(&event) {
            macroquad::audio::play_sound(
                sound,
                macroquad::audio::PlaySoundParams {
                    looped: false,
                    volume: self.effective_volume(volume),
                },
            );
        }
    }

    fn play_loop(&mut self, sound: Option<SoundLoop>) {
        if self.current_loop == sound {
            return;
        }
        self.stop_current_loop();
        if let Some(next) = sound {
            if let Some(loop_sound) = self.loops.get(&next) {
                macroquad::audio::play_sound(
                    loop_sound,
                    macroquad::audio::PlaySoundParams {
                        looped: true,
                        volume: self.effective_volume(1.0),
                    },
                );
            }
            // Track the wanted loop even when its file failed to load: switching away
            // simply finds nothing to stop, and no retry happens on repeat requests.
            self.current_loop = Some(next);
        }
    }

    fn set_volume(&mut self, volume: f64) {
        self.volume = volume.clamp(0.0, 1.0);
        if let Some(current) = self.current_loop
            && let Some(sound) = self.loops.get(&current)
        {
            macroquad::audio::set_sound_volume(sound, self.effective_volume(1.0));
        }
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

#[cfg(test)]
#[path = "macroquad_adapters.test.rs"]
mod tests;
