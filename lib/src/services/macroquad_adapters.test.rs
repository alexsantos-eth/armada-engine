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
