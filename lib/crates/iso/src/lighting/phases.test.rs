use super::*;
use crate::time::{TICKS_PER_DAY, TICKS_PER_HOUR, WORLD_START_TICK};

/// Every phase's direction is written out as two constants, so the one thing to check is that
#[test]
fn shadow_direction_is_a_unit_vector() {
    for (name, phase) in [
        ("dawn", DAWN),
        ("day", DAY),
        ("sunset", SUNSET),
        ("night", NIGHT),
    ] {
        let length = phase.shadow.dir_x.hypot(phase.shadow.dir_y);
        assert!((length - 1.0).abs() < 1e-12, "{name} points {length} long");
    }
}

#[test]
fn dawn_is_the_long_shadow_along_minus_x() {
    assert_eq!(DAWN.shadow.dir_x, -0.92);
    const { assert!(DAWN.shadow.dir_y > 0.0) };
    const { assert!(DAWN.shadow.stretch > DAY.shadow.stretch) };
}

#[test]
fn opacity_is_the_sun_and_the_phase_together() {
    assert!((DAWN.opacity() - 0.34 * 0.85).abs() < 1e-12);
    assert!((DAY.opacity() - 0.34).abs() < 1e-12);
    assert!(
        NIGHT.opacity() < DAWN.opacity(),
        "a moon reads fainter than a low sun"
    );
}

#[test]
fn bake_phases_name_and_resolve_each_authored_light() {
    assert_eq!(BakePhase::Dawn.label(), "AMANECER");
    assert_eq!(BakePhase::Day.label(), "DIA");
    assert_eq!(BakePhase::Sunset.label(), "ATARDECER");
    assert_eq!(BakePhase::Night.label(), "NOCHE");
    assert_eq!(BakePhase::Dawn.light(), DAWN);
    assert_eq!(BakePhase::Day.light(), DAY);
    assert_eq!(BakePhase::Sunset.light(), SUNSET);
    assert_eq!(BakePhase::Night.light(), NIGHT);
}

#[test]
fn the_clock_rules_dawn_from_six_to_nine() {
    assert_eq!(phase_at(6 * TICKS_PER_HOUR), BakePhase::Dawn);
    assert_eq!(phase_at(8 * TICKS_PER_HOUR), BakePhase::Dawn);
    assert_eq!(
        phase_at(9 * TICKS_PER_HOUR - 1),
        BakePhase::Dawn,
        "one tick before nine still reads as dawn"
    );
}

#[test]
fn the_clock_rules_day_from_nine_to_five() {
    assert_eq!(phase_at(9 * TICKS_PER_HOUR), BakePhase::Day);
    assert_eq!(phase_at(12 * TICKS_PER_HOUR), BakePhase::Day);
    assert_eq!(phase_at(17 * TICKS_PER_HOUR - 1), BakePhase::Day);
}

#[test]
fn the_clock_rules_sunset_from_five_to_eight() {
    assert_eq!(phase_at(17 * TICKS_PER_HOUR), BakePhase::Sunset);
    assert_eq!(phase_at(19 * TICKS_PER_HOUR), BakePhase::Sunset);
    assert_eq!(phase_at(20 * TICKS_PER_HOUR - 1), BakePhase::Sunset);
}

#[test]
fn the_clock_rules_night_the_rest_of_the_day() {
    assert_eq!(phase_at(20 * TICKS_PER_HOUR), BakePhase::Night);
    assert_eq!(phase_at(0), BakePhase::Night);
    assert_eq!(
        phase_at(5 * TICKS_PER_HOUR + TICKS_PER_HOUR - 1),
        BakePhase::Night
    );
    assert_eq!(phase_at(6 * TICKS_PER_HOUR - 1), BakePhase::Night);
    assert_eq!(
        phase_at(23 * TICKS_PER_HOUR + TICKS_PER_HOUR - 1),
        BakePhase::Night
    );
}

#[test]
fn the_cycle_wraps_with_the_day() {
    for offset in [1, 7, 365] {
        for hour in [0, 6, 9, 17, 20] {
            assert_eq!(
                phase_at(hour * TICKS_PER_HOUR + offset * TICKS_PER_DAY),
                phase_at(hour * TICKS_PER_HOUR),
                "day {offset} diverges at hour {hour}"
            );
        }
    }
}

#[test]
fn the_world_starts_at_dawn() {
    assert_eq!(phase_at(WORLD_START_TICK), BakePhase::Dawn);
}
