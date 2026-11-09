use super::*;
use iso::projection::GridPoint;

const RADIUS: f64 = 60.0;

fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-9,
        "expected {expected}, got {actual}"
    );
}

#[test]
fn the_centred_stick_is_idle() {
    let reading = stick_reading(0.0, 0.0, RADIUS);

    assert_eq!(reading.walk, GridPoint { x: 0.0, y: 0.0 });
    assert_eq!(reading.magnitude, 0.0);
    assert!(!reading.run);
}

#[test]
fn a_push_inside_the_deadzone_is_idle_too() {
    let reading = stick_reading(RADIUS * DEADZONE * 0.5, 0.0, RADIUS);

    assert_eq!(reading.walk, GridPoint { x: 0.0, y: 0.0 });
    assert_eq!(reading.magnitude, 0.0);
    assert!(!reading.run);
}

#[test]
fn full_deflection_right_matches_the_keyboard() {
    let reading = stick_reading(RADIUS, 0.0, RADIUS);

    assert_close(reading.walk.x, std::f64::consts::FRAC_1_SQRT_2);
    assert_close(reading.walk.y, -std::f64::consts::FRAC_1_SQRT_2);
    assert_eq!(reading.magnitude, 1.0);
    assert!(reading.run);
}

#[test]
fn full_deflection_up_matches_the_keyboard() {
    let reading = stick_reading(0.0, -RADIUS, RADIUS);

    assert_close(reading.walk.x, std::f64::consts::FRAC_1_SQRT_2);
    assert_close(reading.walk.y, std::f64::consts::FRAC_1_SQRT_2);
    assert_eq!(reading.magnitude, 1.0);
    assert!(reading.run);
}

#[test]
fn full_deflection_down_and_left_match_the_keyboard() {
    let down = stick_reading(0.0, RADIUS, RADIUS);
    let left = stick_reading(-RADIUS, 0.0, RADIUS);

    assert_close(down.walk.x, -std::f64::consts::FRAC_1_SQRT_2);
    assert_close(down.walk.y, -std::f64::consts::FRAC_1_SQRT_2);
    assert_close(left.walk.x, -std::f64::consts::FRAC_1_SQRT_2);
    assert_close(left.walk.y, std::f64::consts::FRAC_1_SQRT_2);
}

#[test]
fn half_a_deflection_is_analog() {
    let reading = stick_reading(RADIUS * 0.5, 0.0, RADIUS);

    assert_eq!(reading.magnitude, 0.5);
    assert!(!reading.run);
    assert_close(reading.walk.x.hypot(reading.walk.y), 0.5);
}

#[test]
fn the_deadzone_edge_walks_but_deep_inside_does_not() {
    let below = stick_reading(RADIUS * (DEADZONE - 0.01), 0.0, RADIUS);
    let above = stick_reading(RADIUS * (DEADZONE + 0.01), 0.0, RADIUS);

    assert_eq!(below.magnitude, 0.0);
    assert!(above.magnitude > 0.0);
}

#[test]
fn pushing_past_the_edge_clamps_to_full_speed() {
    let reading = stick_reading(RADIUS * 3.0, 0.0, RADIUS);

    assert_eq!(reading.magnitude, 1.0);
    assert!(reading.run);
}

#[test]
fn run_kicks_in_at_the_threshold() {
    let below = stick_reading(RADIUS * (RUN_THRESHOLD - 0.01), 0.0, RADIUS);
    let at = stick_reading(RADIUS * RUN_THRESHOLD, 0.0, RADIUS);

    assert!(!below.run);
    assert!(at.run);
}

#[test]
fn a_screen_diagonal_maps_to_a_world_axis() {
    let reading = stick_reading(
        RADIUS * std::f64::consts::FRAC_1_SQRT_2,
        -RADIUS * std::f64::consts::FRAC_1_SQRT_2,
        RADIUS,
    );

    assert_close(reading.walk.x, 1.0);
    assert_close(reading.walk.y, 0.0);
}

#[test]
fn the_walk_vector_never_exceeds_unit_length() {
    for dx in [-1.0, -0.5, 0.0, 0.5, 1.0] {
        for dy in [-1.0, -0.5, 0.0, 0.5, 1.0] {
            let reading = stick_reading(dx * RADIUS, dy * RADIUS, RADIUS);
            assert!(reading.walk.x.hypot(reading.walk.y) <= 1.0 + 1e-9);
        }
    }
}

#[test]
fn the_knob_is_clamped_to_the_base() {
    assert_eq!(clamp_offset(10.0, 0.0, RADIUS), (10.0, 0.0));

    let (x, y) = clamp_offset(RADIUS * 3.0, 0.0, RADIUS);
    assert_close(x, RADIUS);
    assert_eq!(y, 0.0);

    let (x, y) = clamp_offset(RADIUS, RADIUS, RADIUS);
    assert_close(x.hypot(y), RADIUS);
}
