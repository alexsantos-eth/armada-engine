//! Tests for how loud the world sounds from where the player stands.

use super::*;
use crate::grid::WorldCoord;

fn at(x: f64, y: f64) -> GridPoint {
    GridPoint { x, y }
}

#[test]
fn a_source_is_full_near_falls_off_and_goes_silent_far() {
    assert_eq!(distance_gain(0.0), 1.0);
    assert_eq!(distance_gain(HEARING_NEAR), 1.0);
    assert_eq!(distance_gain(HEARING_FAR), 0.0);
    assert_eq!(distance_gain(HEARING_FAR * 3.0), 0.0);
    assert_eq!(distance_gain(f64::NAN), 0.0);
    let mut last = 1.0;
    for step in 1..=20 {
        let gain =
            distance_gain(HEARING_NEAR + (HEARING_FAR - HEARING_NEAR) * f64::from(step) / 20.0);
        assert!(gain <= last, "the gain never rises with distance");
        last = gain;
    }
    assert!(
        distance_gain(6.0) < 0.5,
        "halfway out it is already well down"
    );
}

#[test]
fn sources_add_up_without_passing_full() {
    assert_eq!(combined([]), 0.0);
    assert!((combined([0.5]) - 0.5).abs() < 1e-12);
    assert!((combined([0.5, 0.5]) - 0.75).abs() < 1e-12);
    assert!(combined([0.9; 10]) <= 1.0);
    assert_eq!(combined([1.0, 0.2]), 1.0);
    assert_eq!(combined([-1.0, 2.0]), 1.0, "gains are clamped");
}

#[test]
fn a_bed_eases_towards_its_target() {
    assert_eq!(ease_volume(0.0, 1.0, 0.0), 0.0);
    assert!((ease_volume(0.0, 1.0, AMBIENT_EASE_HALF_LIFE_MS) - 0.5).abs() < 1e-12);
    assert!(ease_volume(1.0, 0.0, AMBIENT_EASE_HALF_LIFE_MS * 20.0) < 1e-5);
    assert_eq!(ease_volume(0.4, 0.4, 16.0), 0.4);
    assert!(
        (ease_volume(0.2, 0.8, -5.0) - 0.2).abs() < 1e-12,
        "time never runs backwards"
    );
}

#[test]
fn the_wind_is_louder_in_windier_biomes_and_gusts() {
    let calm = (0..200)
        .map(|t| wind_level(1.5, f64::from(t) * 100.0))
        .fold(0.0, f64::max);
    let windy = (0..200)
        .map(|t| wind_level(4.8, f64::from(t) * 100.0))
        .fold(0.0, f64::max);
    assert!(windy > calm);
    let levels: Vec<f64> = (0..200)
        .map(|t| wind_level(4.0, f64::from(t) * 100.0))
        .collect();
    let low = levels.iter().copied().fold(1.0, f64::min);
    let high = levels.iter().copied().fold(0.0, f64::max);
    assert!(high - low > 0.1, "gusts move the level");
    assert!(levels.iter().all(|level| (0.0..=1.0).contains(level)));
}

#[test]
fn birds_sing_by_day_and_are_quiet_at_night() {
    assert!(bird_level(BakePhase::Dawn) > bird_level(BakePhase::Day));
    assert!(bird_level(BakePhase::Day) > bird_level(BakePhase::Sunset));
    assert_eq!(bird_level(BakePhase::Night), 0.0);
}

#[test]
fn a_geyser_steams_quietly_and_swells_with_its_burst() {
    assert!((geyser_level(1.0, 0.0) - GEYSER_QUIET).abs() < 1e-12);
    assert_eq!(geyser_level(1.0, 1.0), 1.0);
    assert_eq!(geyser_level(0.0, 1.0), 0.0);
    assert!(
        (geyser_level(0.5, 2.0) - 0.5).abs() < 1e-12,
        "the blow is clamped"
    );
}

#[test]
fn each_animal_has_its_footfall() {
    assert_eq!(footfall_of(NpcKind::Rabbit), SoundEvent::RabbitHop);
    assert_eq!(footfall_of(NpcKind::Crab), SoundEvent::CrabStep);
}

#[test]
fn footfalls_sound_once_per_kind_at_the_nearest() {
    let home = |x| WorldCoord { x, y: 0 };
    let mut near = Npc::new(NpcKind::Rabbit, 1, home(1), 0);
    let mut far = Npc::new(NpcKind::Rabbit, 2, home(8), 0);
    let mut crab = Npc::new(NpcKind::Crab, 3, home(4), 0);
    let still = Npc::new(NpcKind::Crab, 4, home(0), 0);
    let gone = Npc::new(NpcKind::Crab, 5, home(40), 0);
    let before = [
        (1, near.footfalls),
        (2, far.footfalls),
        (3, crab.footfalls),
        (4, still.footfalls),
        (5, gone.footfalls),
    ];
    near.footfalls += 1;
    far.footfalls += 1;
    crab.footfalls += 1;
    let mut gone = gone;
    gone.footfalls += 1;
    let listener = at(0.5, 0.5);

    let sounds = footfall_sounds(&before, [&near, &far, &crab, &still, &gone], listener);

    assert_eq!(sounds.len(), 2, "{sounds:?}");
    let rabbit = sounds
        .iter()
        .find(|(event, _)| *event == SoundEvent::RabbitHop)
        .expect("the rabbits are heard");
    assert_eq!(rabbit.1, distance_gain(distance(near.position(), listener)));
    let crabs = sounds
        .iter()
        .find(|(event, _)| *event == SoundEvent::CrabStep)
        .expect("the crab is heard");
    assert!(crabs.1 > 0.0 && crabs.1 < 1.0, "the crab is further off");
}

#[test]
fn an_animal_born_since_is_not_a_footfall() {
    let mut npc = Npc::new(NpcKind::Rabbit, 9, WorldCoord { x: 0, y: 0 }, 0);
    npc.footfalls = 3;
    assert!(footfall_sounds(&[], [&npc], at(0.0, 0.0)).is_empty());
}

#[test]
fn birds_call_rarely_and_never_back_to_back() {
    assert!(
        !bird_call_due(1.0, 16.0, BIRD_CALL_GAP_MS / 2.0, 0.0),
        "too soon"
    );
    assert!(
        !bird_call_due(0.0, 16.0, BIRD_CALL_GAP_MS * 2.0, 0.0),
        "no birds"
    );
    assert!(bird_call_due(1.0, 16.0, BIRD_CALL_GAP_MS, 0.0));
    assert!(
        !bird_call_due(1.0, 16.0, BIRD_CALL_GAP_MS, 0.5),
        "a call is a rare roll"
    );
    // Over a long stretch at full song, with a uniform stream of rolls, a call comes every
    // gap plus about a minute: one every two to four minutes.
    let mut random = crate::player::DustRandom::new(11);
    let frame = 16.0;
    let minutes = 600.0;
    let mut since = BIRD_CALL_GAP_MS;
    let mut calls = 0;
    for _ in 0..(minutes * 60_000.0 / frame) as u32 {
        since += frame;
        if bird_call_due(1.0, frame, since, random.roll()) {
            calls += 1;
            since = 0.0;
        }
    }
    let minutes_apart = minutes / f64::from(calls);
    assert!(
        (2.5..=4.0).contains(&minutes_apart),
        "a call every {minutes_apart} minutes"
    );
}
