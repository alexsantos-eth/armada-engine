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
    audio.play_loop(Some(SoundLoop::Walk(Footing::Grass)));
    assert_eq!(audio.current_loop, Some(SoundLoop::Walk(Footing::Grass)));

    audio.play_loop(Some(SoundLoop::Walk(Footing::Grass))); // re-asking is a no-op
    assert_eq!(audio.current_loop, Some(SoundLoop::Walk(Footing::Grass)));

    audio.play_loop(Some(SoundLoop::Run(Footing::Stone))); // switching replaces the loop
    assert_eq!(audio.current_loop, Some(SoundLoop::Run(Footing::Stone)));

    audio.set_volume(0.25); // a master-volume change keeps the loop running
    assert_eq!(audio.current_loop, Some(SoundLoop::Run(Footing::Stone)));

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

#[test]
fn every_bundled_sound_is_rendered_from_a_strudel_source() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let files = SOUND_FILES
        .iter()
        .map(|(_, file)| *file)
        .chain(LOOP_FILES.iter().map(|(_, file)| *file))
        .chain(AMBIENT_FILES.iter().map(|(_, file)| *file));
    for file in files {
        assert!(
            root.join("content/sounds").join(file).is_file(),
            "{file} is not in content/sounds/"
        );
        let source = file.replace(".wav", ".strudel");
        assert!(
            root.join("music").join(&source).is_file(),
            "{source} is not in music/"
        );
    }
}

#[test]
fn a_bed_plays_at_its_level_and_stops_when_silent() {
    let mut audio = MacroquadAudio::default();
    assert_eq!(audio.ambient_level(AmbientLoop::Fire), 0.0);
    audio.set_ambient(AmbientLoop::Fire, 0.4);
    assert_eq!(audio.ambient_level(AmbientLoop::Fire), 0.4);
    audio.set_ambient(AmbientLoop::Fire, 3.0);
    assert_eq!(audio.ambient_level(AmbientLoop::Fire), 1.0, "levels clamp");
    audio.set_ambient(AmbientLoop::Fire, AMBIENT_SILENCE / 2.0);
    assert_eq!(audio.ambient_level(AmbientLoop::Fire), 0.0);
    assert_eq!(
        audio.ambient_level(AmbientLoop::Wind),
        0.0,
        "beds are independent"
    );
}

#[test]
fn the_record_of_one_shots_stays_bounded() {
    let mut audio = MacroquadAudio::default();
    for _ in 0..EVENTS_KEPT * 3 {
        audio.play(SoundEvent::CrabStep);
    }
    assert!(audio.events.len() <= EVENTS_KEPT);
}

#[test]
fn every_bird_phrase_has_its_file() {
    for phrase in 0..iso::services::BIRD_CALLS {
        assert!(
            SOUND_FILES
                .iter()
                .any(|(event, _)| *event == SoundEvent::BirdCall(phrase)),
            "phrase {phrase} has no file"
        );
    }
}
