use super::*;

#[test]
fn audio_records_events_and_clamps_volume() {
    let mut audio = MacroquadAudio::default();
    audio.set_volume(-1.0);
    audio.play(SoundEvent::Jump);
    audio.set_volume(2.0);

    assert_eq!(audio.events, vec![SoundEvent::Jump]);
    assert_eq!(audio.volume, 1.0);
}

#[test]
fn audio_records_gain_scaled_one_shots() {
    let mut audio = MacroquadAudio::default();
    audio.play_with_volume(SoundEvent::Land, 0.5);
    audio.play_with_volume(SoundEvent::Land, 2.0); // gain above 1 clamps

    assert_eq!(audio.events, vec![SoundEvent::Land, SoundEvent::Land]);
}

#[test]
fn audio_tracks_the_wanted_loop() {
    let mut audio = MacroquadAudio::default();
    audio.play_loop(Some(SoundLoop::Walk));
    assert_eq!(audio.current_loop, Some(SoundLoop::Walk));

    audio.play_loop(Some(SoundLoop::Walk)); // re-asking is a no-op
    assert_eq!(audio.current_loop, Some(SoundLoop::Walk));

    audio.play_loop(Some(SoundLoop::Run)); // switching replaces the loop
    assert_eq!(audio.current_loop, Some(SoundLoop::Run));

    audio.set_volume(0.25); // a master-volume change keeps the loop running
    assert_eq!(audio.current_loop, Some(SoundLoop::Run));

    audio.play_loop(None); // `None` stops looping
    assert_eq!(audio.current_loop, None);
}

#[test]
fn ui_keeps_messages_and_the_latest_hud() {
    let mut ui = MacroquadUi::default();
    ui.push(UiEvent::Message {
        text: "saved".to_owned(),
    });
    ui.push(UiEvent::HudUpdate {
        x: 4.5,
        y: -2.0,
        elevation: 3,
        motion: "walking".to_owned(),
        chunks: 9,
    });

    assert_eq!(ui.messages, ["saved"]);
    assert_eq!(ui.hud, Some((4.5, -2.0, 3, "walking".to_owned(), 9)));
}
