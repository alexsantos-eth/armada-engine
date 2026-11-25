//! Tests for the icon floating over a market.

use super::*;
use macroquad::math::vec2;

#[test]
fn the_icon_scales_with_the_tiles_within_limits() {
    assert_eq!(mark_side(10.0), SIDE_LIMITS.0);
    assert_eq!(mark_side(1000.0), SIDE_LIMITS.1);
    assert!(mark_side(100.0) > mark_side(80.0));
}

#[test]
fn the_icon_bobs_around_its_place_and_repeats() {
    let lifts: Vec<f32> = (0..30)
        .map(|step| mark_pose(f64::from(step) * 50.0, 0.0, false).lift)
        .collect();
    assert!(lifts.iter().all(|lift| lift.abs() <= BOB_PX + 0.001));
    assert!(lifts.iter().any(|lift| *lift > 3.0) && lifts.iter().any(|lift| *lift < -3.0));
    let (a, b) = (
        mark_pose(120.0, 0.0, false),
        mark_pose(120.0 + BOB_MS, 0.0, false),
    );
    assert!((a.lift - b.lift).abs() < 0.01);
}

#[test]
fn two_markets_do_not_bob_together() {
    let a = mark_pose(300.0, 0.0, false).lift;
    let b = mark_pose(300.0, 2.0, false).lift;
    assert!((a - b).abs() > 0.5);
}

#[test]
fn only_the_market_in_reach_pulses() {
    assert_eq!(mark_pose(400.0, 0.0, false).scale, 1.0);
    let scales: Vec<f32> = (0..40)
        .map(|step| mark_pose(f64::from(step) * 30.0, 0.0, true).scale)
        .collect();
    assert!(
        scales
            .iter()
            .all(|s| (1.0..=1.0 + NEAR_PULSE + 0.001).contains(s))
    );
    assert!(scales.iter().any(|s| *s > 1.05));
}

#[test]
fn the_press_rect_is_centred_on_the_icon() {
    let mark = MarketMark {
        at: (200.0, 100.0),
        side: 50.0,
        near: true,
    };
    let rect = mark_rect(&mark);
    assert!(rect.contains(vec2(200.0, 100.0)));
    assert!(!rect.contains(vec2(230.0, 100.0)));
}
