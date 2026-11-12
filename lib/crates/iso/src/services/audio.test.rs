//! Tests for the `AudioService` default implementations, against the smallest possible client.

use super::*;

/// A client that implements only the required methods, recording what it is asked to do.
/// It compiles precisely because the default methods exist.
#[derive(Default)]
struct RecordingAudio {
    events: Vec<SoundEvent>,
    volume: Option<f64>,
}

impl AudioService for RecordingAudio {
    fn play(&mut self, event: SoundEvent) {
        self.events.push(event);
    }

    fn set_volume(&mut self, volume: f64) {
        self.volume = Some(volume);
    }
}

#[test]
fn the_default_play_with_volume_delegates_to_play() {
    let mut audio = RecordingAudio::default();
    audio.play_with_volume(SoundEvent::Land, 0.25);
    // The default drops `volume` on the floor; a client that wants it must override the method.
    assert_eq!(audio.events, vec![SoundEvent::Land]);
}

#[test]
fn the_default_play_loop_is_a_silent_no_op() {
    let mut audio = RecordingAudio::default();
    audio.play_loop(Some(SoundLoop::Run));
    audio.play_loop(None);
    assert_eq!(audio.events, Vec::<SoundEvent>::new());
    assert_eq!(audio.volume, None);
}
