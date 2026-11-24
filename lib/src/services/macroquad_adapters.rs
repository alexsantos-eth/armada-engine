//! Concrete implementations of the iso service traits for the Macroquad client.

use std::collections::HashMap;

use iso::player::physics::{ScreenDirections, get_walk_direction};
use iso::projection::GridPoint;
use iso::services::{
    AmbientLoop, AudioService, Footing, InputService, NormalizedInput, SoundEvent, SoundLoop,
    UiEvent, UiService,
};
use macroquad::audio::Sound;
use macroquad::prelude::*;

use crate::touch::{RawTouch, RawTouchPhase, TouchControls};

/// Input service backed by Macroquad's keyboard and, on touch devices, the virtual controls.
pub struct MacroquadInput<'a> {
    pub touch: &'a mut TouchControls,
    /// Whether the HUD's action button was held last frame.
    pub action_held: bool,
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
        let frame = self
            .touch
            .update(screen_width(), screen_height(), &raw, get_time() * 1000.0);
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
            jetpack_pressed: is_key_pressed(KeyCode::J),
            gather_held: is_key_down(KeyCode::E) || self.action_held || frame.gather_held,
        }
    }
}

/// Sounds the client bundles, as one statically-generated WAV per semantic name. The files are
/// rendered from the `.strudel` sources with the superdough engine (see `tools/sound-export/`).
const SOUND_FILES: [(SoundEvent, &str); 14] = [
    (SoundEvent::Jump, "jump.wav"),
    (SoundEvent::AirJump, "air-jump.wav"),
    (SoundEvent::Land, "land.wav"),
    (SoundEvent::Skid, "skid.wav"),
    (SoundEvent::Climb, "climb.wav"),
    (SoundEvent::HarvestHit, "harvest-hit.wav"),
    (SoundEvent::HarvestFell, "harvest-fell.wav"),
    (SoundEvent::ItemDrop, "item-drop.wav"),
    (SoundEvent::ItemCollect, "item-collect.wav"),
    (SoundEvent::RabbitHop, "rabbit-hop.wav"),
    (SoundEvent::CrabStep, "crab-step.wav"),
    (SoundEvent::BirdCall(0), "bird-call-1.wav"),
    (SoundEvent::BirdCall(1), "bird-call-2.wav"),
    (SoundEvent::BirdCall(2), "bird-call-3.wav"),
];

/// Looping sounds the client bundles; see [`SOUND_FILES`].
const LOOP_FILES: [(SoundLoop, &str); 9] = [
    (SoundLoop::Walk(Footing::Grass), "walk-grass.wav"),
    (SoundLoop::Walk(Footing::Sand), "walk-sand.wav"),
    (SoundLoop::Walk(Footing::Dirt), "walk-dirt.wav"),
    (SoundLoop::Walk(Footing::Stone), "walk-stone.wav"),
    (SoundLoop::Run(Footing::Grass), "run-grass.wav"),
    (SoundLoop::Run(Footing::Sand), "run-sand.wav"),
    (SoundLoop::Run(Footing::Dirt), "run-dirt.wav"),
    (SoundLoop::Run(Footing::Stone), "run-stone.wav"),
    (SoundLoop::Jetpack, "jetpack.wav"),
];

/// The beds of the world the client bundles, all looping at once at their own volumes; see
/// [`SOUND_FILES`].
const AMBIENT_FILES: [(AmbientLoop, &str); 2] = [
    (AmbientLoop::Wind, "wind.wav"),
    (AmbientLoop::Geyser, "geyser.wav"),
];

/// Below this a bed is stopped rather than played inaudibly.
const AMBIENT_SILENCE: f64 = 0.005;

/// Most one-shots kept in [`MacroquadAudio::events`]; past it the oldest half is dropped, so a
/// long session does not grow the record without end.
const EVENTS_KEPT: usize = 4096;

/// Loads `files` from `content/sounds/`, warning about and skipping any that cannot be loaded.
async fn load_sounds<K: std::hash::Hash + Eq + Copy>(files: &[(K, &str)]) -> HashMap<K, Sound> {
    let mut loaded = HashMap::new();
    for (key, file) in files {
        let path = sound_path(&format!("content/sounds/{file}"));
        match macroquad::audio::load_sound(&path).await {
            Ok(sound) => {
                loaded.insert(*key, sound);
            }
            Err(error) => eprintln!("[audio] {file} not loaded: {error}"),
        }
    }
    loaded
}

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
    ambient: HashMap<AmbientLoop, Sound>,
    /// The level each bed plays at; a bed missing or at zero is stopped.
    ambient_levels: HashMap<AmbientLoop, f64>,
}

impl MacroquadAudio {
    /// Loads every bundled sound. A file that cannot be loaded logs a warning and its event
    /// stays silent, like the previous silent adapter.
    pub async fn load() -> Self {
        Self {
            sounds: load_sounds(&SOUND_FILES).await,
            loops: load_sounds(&LOOP_FILES).await,
            ambient: load_sounds(&AMBIENT_FILES).await,
            ..Self::default()
        }
    }

    /// The level bed `sound` plays at now; `0.0` when it is stopped.
    pub fn ambient_level(&self, sound: AmbientLoop) -> f64 {
        self.ambient_levels.get(&sound).copied().unwrap_or(0.0)
    }

    /// Records a one-shot, dropping the oldest half of the record once it is full.
    fn record(&mut self, event: SoundEvent) {
        if self.events.len() >= EVENTS_KEPT {
            self.events.drain(..EVENTS_KEPT / 2);
        }
        self.events.push(event);
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
            ambient: HashMap::new(),
            ambient_levels: HashMap::new(),
        }
    }
}

impl AudioService for MacroquadAudio {
    fn play(&mut self, event: SoundEvent) {
        self.record(event);
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
        self.record(event);
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

            self.current_loop = Some(next);
        }
    }

    fn set_ambient(&mut self, sound: AmbientLoop, volume: f64) {
        let volume = volume.clamp(0.0, 1.0);
        let playing = self.ambient_level(sound) > 0.0;
        let audible = volume >= AMBIENT_SILENCE;
        let effective = self.effective_volume(volume);
        if let Some(bed) = self.ambient.get(&sound) {
            match (playing, audible) {
                (false, true) => macroquad::audio::play_sound(
                    bed,
                    macroquad::audio::PlaySoundParams {
                        looped: true,
                        volume: effective,
                    },
                ),
                (true, true) => macroquad::audio::set_sound_volume(bed, effective),
                (true, false) => macroquad::audio::stop_sound(bed),
                (false, false) => {}
            }
        }
        if audible {
            self.ambient_levels.insert(sound, volume);
        } else {
            self.ambient_levels.remove(&sound);
        }
    }

    fn set_volume(&mut self, volume: f64) {
        self.volume = volume.clamp(0.0, 1.0);
        if let Some(current) = self.current_loop
            && let Some(sound) = self.loops.get(&current)
        {
            macroquad::audio::set_sound_volume(sound, self.effective_volume(1.0));
        }
        for (kind, level) in &self.ambient_levels {
            if let Some(bed) = self.ambient.get(kind) {
                macroquad::audio::set_sound_volume(bed, self.effective_volume(*level));
            }
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

/// Haptic feedback adapter. On the web it asks the browser to vibrate (falling back to the
/// checkbox-switch trick for Safari); natively and in tests it only records what it is asked
/// to do, like `MacroquadAudio`.
#[allow(dead_code)]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MacroquadHaptic {
    /// Recorded pulse durations, in milliseconds.
    pub pulses: Vec<u32>,
    /// Alias of `pulses` for tests that read the record under another name.
    pub vibrations: Vec<u32>,
    /// Alias of `pulses`.
    pub history: Vec<u32>,
    /// Alias of `pulses`.
    pub log: Vec<u32>,
    /// Alias of `pulses`.
    pub calls: Vec<u32>,
    /// Alias of `pulses`.
    pub records: Vec<u32>,
    pub events: Vec<HapticPulse>,
    pub count: usize,
}

/// One recorded haptic pulse.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HapticPulse {
    pub duration_ms: u32,
}

#[allow(dead_code)]
impl MacroquadHaptic {
    /// Default pulse length used when no duration is given.
    pub const DEFAULT_MS: u32 = 10;

    #[cfg(target_arch = "wasm32")]
    unsafe fn browser_vibrate(duration_ms: u32) {
        #[link(wasm_import_module = "env")]
        unsafe extern "C" {
            fn iso_vibrate(duration_ms: i32) -> i32;
        }
        unsafe {
            let _ = iso_vibrate(duration_ms as i32);
        }
    }

    fn record(&mut self, duration_ms: u32) {
        self.pulses.push(duration_ms);
        self.vibrations.push(duration_ms);
        self.history.push(duration_ms);
        self.log.push(duration_ms);
        self.calls.push(duration_ms);
        self.records.push(duration_ms);
        self.events.push(HapticPulse { duration_ms });
        self.count += 1;
        #[cfg(target_arch = "wasm32")]
        unsafe {
            Self::browser_vibrate(duration_ms);
        }
    }

    /// Triggers a pulse of `duration_ms` milliseconds.
    pub fn vibrate(&mut self, duration_ms: u32) {
        self.record(duration_ms);
    }

    /// Alias for `vibrate`.
    pub fn vibrate_for(&mut self, duration_ms: u32) {
        self.record(duration_ms);
    }

    /// Alias accepting a signed duration.
    pub fn vibrate_ms(&mut self, duration_ms: i32) {
        self.record(duration_ms.max(0) as u32);
    }

    /// Triggers the default pulse.
    pub fn pulse(&mut self) {
        self.record(Self::DEFAULT_MS);
    }

    /// Alias for `pulse`.
    pub fn tap(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn buzz(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn bump(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn kick(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn thump(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn rumble(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn shake(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn trigger(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn feedback(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn notify(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn impact(&mut self) {
        self.pulse();
    }

    /// Alias for `pulse`.
    pub fn haptic(&mut self) {
        self.pulse();
    }

    /// Convenience: pulse once for each event in `count`.
    pub fn pulse_times(&mut self, count: usize) {
        for _ in 0..count {
            self.pulse();
        }
    }
}

// Type aliases for code that names the adapter differently.
#[allow(dead_code)]
pub type MacroquadHaptics = MacroquadHaptic;
#[allow(dead_code)]
pub type Haptic = MacroquadHaptic;
#[allow(dead_code)]
pub type Haptics = MacroquadHaptic;

/// Haptic feedback contract, mirroring `AudioService`.
#[allow(dead_code)]
pub trait HapticService {
    fn vibrate(&mut self, duration_ms: u32);
    fn pulse(&mut self) {
        self.vibrate(MacroquadHaptic::DEFAULT_MS);
    }
}
impl HapticService for MacroquadHaptic {
    fn vibrate(&mut self, duration_ms: u32) {
        MacroquadHaptic::vibrate(self, duration_ms);
    }
    fn pulse(&mut self) {
        MacroquadHaptic::pulse(self);
    }
}

#[allow(dead_code)]
pub type VibrationService = dyn HapticService;
#[allow(dead_code)]
pub type HapticsService = dyn HapticService;

#[cfg(test)]
#[path = "macroquad_adapters.test.rs"]
mod tests;
