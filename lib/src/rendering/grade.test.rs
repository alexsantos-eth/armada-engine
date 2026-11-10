use super::*;
use crate::game::config::PHASE_TRANSITION_SECONDS;
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

#[test]
fn lerp_grade_endpoints_return_the_sources() {
    let dawn = grade_for(BakePhase::Dawn);
    let night = grade_for(BakePhase::Night);
    assert_eq!(lerp_grade(dawn, night, 0.0), dawn);
    assert_eq!(lerp_grade(dawn, night, 1.0), night);
}

#[test]
fn lerp_grade_midpoint_blends_every_channel() {
    let from = PhaseGrade {
        tint: Color::new(1.0, 0.0, 0.0, 1.0),
        saturation: 1.0,
        lift: Color::new(0.0, 0.2, 0.4, 1.0),
    };
    let to = PhaseGrade {
        tint: Color::new(0.0, 1.0, 0.5, 1.0),
        saturation: 0.5,
        lift: Color::new(0.2, 0.0, 0.0, 1.0),
    };
    let mid = lerp_grade(from, to, 0.5);
    assert!((mid.tint.r - 0.5).abs() < 1e-6);
    assert!((mid.tint.g - 0.5).abs() < 1e-6);
    assert!((mid.tint.b - 0.25).abs() < 1e-6);
    assert!((mid.saturation - 0.75).abs() < 1e-6);
    assert!((mid.lift.r - 0.1).abs() < 1e-6);
    assert!((mid.lift.g - 0.1).abs() < 1e-6);
    assert!((mid.lift.b - 0.2).abs() < 1e-6);
}

#[test]
fn a_settled_transition_keeps_showing_its_grade() {
    let mut transition = GradeTransition::new(SUNSET_GRADE);
    assert_eq!(transition.advance(0.016), SUNSET_GRADE);
    assert_eq!(transition.advance(0.016), SUNSET_GRADE);
}

#[test]
fn a_retargeted_transition_eases_into_the_new_grade() {
    let mut transition = GradeTransition::new(DAY_GRADE);
    transition.set_target(NIGHT_GRADE);

    let quarter = transition.advance(PHASE_TRANSITION_SECONDS * 0.25);
    assert_ne!(quarter, DAY_GRADE, "the first quarter already moved");
    assert_ne!(quarter, NIGHT_GRADE, "but has not landed yet");

    let settled = transition.advance(PHASE_TRANSITION_SECONDS);
    assert_eq!(settled, NIGHT_GRADE);
    assert_eq!(transition.advance(0.016), NIGHT_GRADE, "it stays landed");
}

#[test]
fn a_blend_stays_between_its_endpoints() {
    for amount in [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0] {
        let blended = lerp_grade(DAY_GRADE, NIGHT_GRADE, amount);
        for (from, to, channel) in [
            (DAY_GRADE.tint.r, NIGHT_GRADE.tint.r, blended.tint.r),
            (DAY_GRADE.tint.g, NIGHT_GRADE.tint.g, blended.tint.g),
            (DAY_GRADE.tint.b, NIGHT_GRADE.tint.b, blended.tint.b),
            (DAY_GRADE.lift.r, NIGHT_GRADE.lift.r, blended.lift.r),
            (DAY_GRADE.lift.g, NIGHT_GRADE.lift.g, blended.lift.g),
            (DAY_GRADE.lift.b, NIGHT_GRADE.lift.b, blended.lift.b),
            (
                DAY_GRADE.saturation,
                NIGHT_GRADE.saturation,
                blended.saturation,
            ),
        ] {
            let low = from.min(to) - 1e-6;
            let high = from.max(to) + 1e-6;
            assert!(
                (low..=high).contains(&channel),
                "channel {channel} out of [{low}, {high}]"
            );
        }
    }
}

#[test]
fn retargeting_mid_transition_continues_from_what_is_shown() {
    let mut transition = GradeTransition::new(DAY_GRADE);
    transition.set_target(NIGHT_GRADE);
    let mid = transition.advance(0.2);
    transition.set_target(DAWN_GRADE);
    assert_eq!(
        transition.advance(0.0),
        mid,
        "the crossfade resumes from the grade on screen"
    );
}

#[test]
fn the_same_target_does_not_restart_the_crossfade() {
    let mut transition = GradeTransition::new(DAY_GRADE);
    transition.set_target(NIGHT_GRADE);
    transition.advance(0.3);
    transition.set_target(NIGHT_GRADE);
    let resumed = transition.advance(PHASE_TRANSITION_SECONDS);
    assert_eq!(resumed, NIGHT_GRADE, "the clock is not rewound");
}

#[test]
fn a_negative_step_does_not_move_backwards() {
    let mut transition = GradeTransition::new(DAY_GRADE);
    transition.set_target(NIGHT_GRADE);
    let before = transition.advance(0.2);
    let after = transition.advance(-1.0);
    assert_eq!(after, before);
}

#[test]
fn tilt_shift_keeps_the_subject_band_sharp_and_softens_the_edges() {
    assert_eq!(tilt_shift_radius(TILT_SHIFT_FOCUS_Y), 0.0);
    assert_eq!(
        tilt_shift_radius(TILT_SHIFT_FOCUS_Y - TILT_SHIFT_SHARP_HALF_HEIGHT),
        0.0
    );
    assert_eq!(
        tilt_shift_radius(TILT_SHIFT_FOCUS_Y + TILT_SHIFT_SHARP_HALF_HEIGHT),
        0.0
    );
    assert!(tilt_shift_radius(0.0) > 0.0);
    assert!(tilt_shift_radius(1.0) > 0.0);
    assert_eq!(
        tilt_shift_radius(-1.0),
        TILT_SHIFT_MAX_RADIUS_PX,
        "the effect remains bounded outside texture coordinates"
    );
}
