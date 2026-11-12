//! Audio playback contract. The core describes what to play; the client renders it.

/// A sound event the core wants played.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum SoundEvent {
    Jump,
    /// Double jump from the air: the same chirp, an octave up.
    AirJump,
    Land,
    Footstep,
    Climb,
    /// The player entered the skid.
    Skid,
}

/// A looping sound the client keeps playing until asked to stop.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SoundLoop {
    Walk,
    Run,
    Jetpack,
}

/// Audio playback contract.
pub trait AudioService {
    /// Plays a one-shot sound.
    fn play(&mut self, event: SoundEvent);
    /// Plays a one-shot sound scaled to `volume` (0.0..=1.0) of its loudness.
    fn play_with_volume(&mut self, event: SoundEvent, volume: f64) {
        let _ = volume;
        self.play(event);
    }
    /// Plays `sound` in a loop instead of the current one, or stops looping when `None`.
    fn play_loop(&mut self, sound: Option<SoundLoop>) {
        let _ = sound;
    }
    /// Sets the master volume (0.0..=1.0).
    fn set_volume(&mut self, volume: f64);
}
