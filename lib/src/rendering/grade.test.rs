use super::*;
use iso::lighting::BakePhase;

fn assert_colour(colour: Color, expected: (f32, f32, f32)) {
    assert!((colour.r - expected.0).abs() < 1e-6, "r: {}", colour.r);
    assert!((colour.g - expected.1).abs() < 1e-6, "g: {}", colour.g);
    assert!((colour.b - expected.2).abs() < 1e-6, "b: {}", colour.b);
    assert!((colour.a - 1.0).abs() < 1e-6, "a: {}", colour.a);
}

#[test]
fn every_phase_maps_to_its_authored_grade() {
    assert_eq!(grade_for(BakePhase::Dawn), DAWN_GRADE);
    assert_eq!(grade_for(BakePhase::Day), DAY_GRADE);
    assert_eq!(grade_for(BakePhase::Sunset), SUNSET_GRADE);
    assert_eq!(grade_for(BakePhase::Night), NIGHT_GRADE);
}

#[test]
fn day_leaves_the_scene_untouched() {
    assert_colour(DAY_GRADE.tint, (1.0, 1.0, 1.0));
    assert_eq!(DAY_GRADE.saturation, 1.0);
    assert_colour(DAY_GRADE.lift, (0.0, 0.0, 0.0));
}

#[test]
fn the_propuesta_b_tints_are_the_ones_authored() {
    assert_colour(DAWN_GRADE.tint, (1.0, 0.86, 0.70));
    assert_colour(SUNSET_GRADE.tint, (1.0, 0.70, 0.45));
    assert_colour(NIGHT_GRADE.tint, (0.38, 0.48, 0.78));
}

#[test]
fn night_desaturates_and_lifts_its_blacks() {
    const { assert!(NIGHT_GRADE.saturation < 1.0) };
    const { assert!(NIGHT_GRADE.lift.b > NIGHT_GRADE.lift.r) };
}

#[test]
fn every_grade_keeps_sane_ranges() {
    for grade in [DAWN_GRADE, DAY_GRADE, SUNSET_GRADE, NIGHT_GRADE] {
        for channel in [grade.tint.r, grade.tint.g, grade.tint.b] {
            assert!(
                channel > 0.0 && channel <= 1.0,
                "tint {channel} out of range"
            );
        }
        assert!(grade.saturation > 0.0 && grade.saturation <= 1.5);
        for channel in [grade.lift.r, grade.lift.g, grade.lift.b] {
            assert!(
                (0.0..0.25).contains(&channel),
                "lift {channel} out of range"
            );
        }
    }
}
