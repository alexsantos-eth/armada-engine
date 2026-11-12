use super::*;
use crate::player::physics::{PLAYER_MAX_CLIMB, PLAYER_RUN_SPEED, PLAYER_SPEED};

/// The water holds the swimmer back: every pace in it is under the matching one on land, and a
/// fast swim is still a swim.
#[test]
fn swimming_is_slower_than_walking_and_running() {
    let speeds = [
        (PLAYER_SWIM_SPEED, PLAYER_SPEED),
        (PLAYER_SWIM_FAST_SPEED, PLAYER_RUN_SPEED),
        (PLAYER_SWIM_SPEED, PLAYER_SWIM_FAST_SPEED),
    ];
    for (water, land) in speeds {
        assert!(water < land, "{water} should be under {land}");
    }
}

#[test]
fn every_water_column_is_swum_in() {
    assert!(is_swimmable(crate::terrain::TerrainMaterial::Water));
    for dry in [
        crate::terrain::TerrainMaterial::Sand,
        crate::terrain::TerrainMaterial::Grass,
        crate::terrain::TerrainMaterial::Ground,
        crate::terrain::TerrainMaterial::Path,
        crate::terrain::TerrainMaterial::Stairs,
    ] {
        assert!(!is_swimmable(dry), "{dry:?} is dry land");
    }
}

#[test]
fn a_body_at_rest_stays_at_the_float_depth() {
    let (sink, depth) = next_float(0.0, PLAYER_FLOAT_DEPTH);
    assert_eq!(sink, 0.0);
    assert_eq!(depth, PLAYER_FLOAT_DEPTH);
}

#[test]
fn a_body_held_under_is_pushed_back_up() {
    let (sink, depth) = next_float(0.0, 1.0);
    assert!(sink < 0.0, "it rises: {sink}");
    assert!(depth < 1.0, "and it is less deep: {depth}");
}

#[test]
fn a_body_at_the_surface_is_pulled_down_to_the_float_depth() {
    let (sink, depth) = next_float(0.0, 0.0);
    assert!(sink > 0.0, "it settles into the water: {sink}");
    assert!(depth > 0.0 && depth < PLAYER_FLOAT_DEPTH, "{depth}");
}

#[test]
fn a_plunge_settles_back_at_the_float_depth() {
    let (mut sink, mut depth) = (0.5, 0.0);
    let mut deepest = 0.0f64;
    for _ in 0..200 {
        (sink, depth) = next_float(sink, depth);
        deepest = deepest.max(depth);
    }
    assert!(deepest > PLAYER_FLOAT_DEPTH, "it went under: {deepest}");
    assert!(
        (depth - PLAYER_FLOAT_DEPTH).abs() < 1e-3,
        "settled: {depth}"
    );
}

#[test]
fn a_plunge_never_passes_the_deepest_it_may_go() {
    let (mut sink, mut depth) = (10.0, 0.0);
    for _ in 0..50 {
        (sink, depth) = next_float(sink, depth);
        assert!(depth <= PLAYER_PLUNGE_MAX + 1e-9, "{depth}");
    }
}

#[test]
fn the_surface_stops_a_body_rising_out_of_the_water() {
    let (sink, depth) = next_float(-1.0, 0.1);
    assert_eq!(depth, PLAYER_SURFACE_DEPTH);
    assert_eq!(sink, 0.0);
}

#[test]
fn only_a_head_under_the_surface_counts_as_submerged() {
    assert!(!is_under(PLAYER_FLOAT_DEPTH));
    assert!(!is_under(PLAYER_FLOAT_DEPTH + PLAYER_UNDER_DEPTH));
    assert!(is_under(PLAYER_FLOAT_DEPTH + PLAYER_UNDER_DEPTH + 0.01));
}

#[test]
fn a_submerged_swimmer_is_slowed_down() {
    assert_eq!(swim_step(false, PLAYER_FLOAT_DEPTH), PLAYER_SWIM_STEP);
    assert_eq!(swim_step(true, PLAYER_FLOAT_DEPTH), PLAYER_SWIM_FAST_STEP);
    assert_eq!(
        swim_step(false, PLAYER_PLUNGE_MAX),
        PLAYER_SWIM_STEP * PLAYER_UNDER_SPEED
    );
}

#[test]
fn sliding_in_off_the_sand_raises_no_splash() {
    assert!(!splashes(0.0));
    assert!(!splashes(PLAYER_SPLASH_MIN_SPEED / 2.0));
    assert!(splashes(PLAYER_SPLASH_MIN_SPEED));
    assert!(splashes(0.5));
}

#[test]
fn a_swim_starts_at_the_depth_and_speed_it_went_in_with() {
    let swim = PlayerSwim::entering(-2.0, 0.4, 0.3);
    assert_eq!(swim.level, -2.0);
    assert_eq!(swim.depth, 0.4);
    assert_eq!(swim.sink, 0.3);
    assert_eq!(swim.ticks, 0);
}

#[test]
fn a_swim_never_starts_deeper_than_a_plunge_or_rising() {
    let deep = PlayerSwim::entering(0.0, 99.0, -5.0);
    assert_eq!(deep.depth, PLAYER_PLUNGE_MAX);
    assert_eq!(deep.sink, 0.0);
}

#[test]
fn leaving_the_water_reaches_further_than_a_step_up_on_land() {
    let (out_of_water, on_land) = (PLAYER_SWIM_EXIT_CLIMB, PLAYER_MAX_CLIMB);
    assert!(out_of_water > on_land, "{out_of_water} over {on_land}");
}

/// The swell carries a floating body up and down over its period and comes back to where it
/// started.
#[test]
fn the_swell_lifts_and_drops_a_floating_body() {
    let period = PLAYER_BOB_TICKS as i32;
    let bobs: Vec<f64> = (0..period)
        .map(|tick| float_bob(tick, 1.0, false))
        .collect();
    let high = bobs.iter().cloned().fold(f64::MIN, f64::max);
    let low = bobs.iter().cloned().fold(f64::MAX, f64::min);
    assert!((high - PLAYER_BOB_DEPTH).abs() < 0.01, "it rises: {high}");
    assert!((low + PLAYER_BOB_DEPTH).abs() < 0.01, "and it drops: {low}");
    assert!(float_bob(0, 1.0, false).abs() < 1e-9, "it starts level");
    assert!(
        float_bob(period, 1.0, false).abs() < 1e-9,
        "and comes back round"
    );
}

#[test]
fn a_swimmer_on_the_move_feels_less_of_the_swell() {
    let tick = (PLAYER_BOB_TICKS / 4.0) as i32;
    let still = float_bob(tick, 1.0, false);
    let moving = float_bob(tick, 1.0, true);
    assert!(moving.abs() < still.abs(), "{moving} under {still}");
    assert!(moving.abs() > 0.0);
}

#[test]
fn a_body_still_plunging_does_not_bob() {
    assert_eq!(float_settle(PLAYER_FLOAT_DEPTH), 1.0);
    assert_eq!(float_settle(PLAYER_PLUNGE_MAX), 0.0);
    assert_eq!(
        float_bob(
            (PLAYER_BOB_TICKS / 4.0) as i32,
            float_settle(PLAYER_PLUNGE_MAX),
            false
        ),
        0.0
    );
}
