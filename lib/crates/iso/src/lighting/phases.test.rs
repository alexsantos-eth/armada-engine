use super::*;

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
