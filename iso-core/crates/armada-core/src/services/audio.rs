//! Audio playback contract. The core describes what to play; the client renders it.

/// A sound event the core wants played.
#[derive(Clone, Debug, PartialEq)]
pub enum SoundEvent {
    Jump,
    Land,
    Footstep,
    Climb,
    Rejection,
}

/// Audio playback contract.
pub trait AudioService {
    /// Plays a one-shot sound.
    fn play(&mut self, event: SoundEvent);
    /// Sets the master volume (0.0..=1.0).
    fn set_volume(&mut self, volume: f64);
}