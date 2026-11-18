use super::*;

/// The CPU mirror of the shader's `vignette`: what a pixel `d` from the centre is multiplied by,
/// with `d` 0 at the centre and 1 in a corner.
fn vignette(d: f32) -> f32 {
    let t = ((d - VIGNETTE_START) / (1.0 - VIGNETTE_START)).clamp(0.0, 1.0);
    1.0 - VIGNETTE_STRENGTH * t * t * (3.0 - 2.0 * t)
}

/// The CPU mirror of the shader's saturation gain for a pixel `focus` in focus.
fn saturation_gain(focus: f32) -> f32 {
    1.0 + SCENE_SATURATION + FOCUS_SATURATION * focus
}

#[test]
fn the_vogel_taps_fill_the_unit_disc_evenly() {
    let taps = vogel_offsets(BOKEH_TAPS);
    assert_eq!(taps.len(), BOKEH_TAPS);
    for (x, y) in &taps {
        assert!(x.hypot(*y) <= 1.0 + 1e-6);
    }
    let inner = taps
        .iter()
        .filter(|(x, y)| x.hypot(*y) < 0.5_f32.sqrt())
        .count();
    assert_eq!(inner, BOKEH_TAPS / 2, "half the taps in half the area");
    let (sx, sy) = taps
        .iter()
        .fold((0.0, 0.0), |(sx, sy), (x, y)| (sx + x, sy + y));
    assert!(sx.abs() / (BOKEH_TAPS as f32) < 0.1 && sy.abs() / (BOKEH_TAPS as f32) < 0.1);
}

#[test]
fn consecutive_taps_turn_by_the_golden_angle() {
    let taps = vogel_offsets(4);
    let angle = |(x, y): (f32, f32)| y.atan2(x);
    let turn = (angle(taps[2]) - angle(taps[1])).rem_euclid(std::f32::consts::TAU);
    assert!((turn - GOLDEN_ANGLE).abs() < 1e-4, "turn {turn}");
}

#[test]
fn the_vignette_leaves_the_middle_alone_and_only_dims_the_corners_a_little() {
    assert_eq!(vignette(0.0), 1.0);
    assert_eq!(vignette(VIGNETTE_START), 1.0);
    let corner = vignette(1.0);
    assert!((0.8..1.0).contains(&corner), "corner {corner}");
    assert!(vignette(0.8) > corner);
}

#[test]
fn the_focus_is_never_duller_than_the_rest_and_stays_subtle() {
    assert!(saturation_gain(0.0) >= 1.0);
    assert!(saturation_gain(1.0) >= saturation_gain(0.0));
    assert!(saturation_gain(1.0) <= 1.15);
}

#[test]
fn the_shader_unrolls_every_tap_and_names_its_functions() {
    let glsl = lens_glsl();
    assert_eq!(glsl.matches("bokehTap(").count(), BOKEH_TAPS + 1);
    for name in ["vec3 bokeh(", "vec3 lensTone(", "float vignette("] {
        assert!(glsl.contains(name), "{name} missing");
    }
    assert!(
        !glsl.contains("microContrast"),
        "the unsharp mask was taken out"
    );
    for reserved in [
        "packed",
        "float distance",
        "float sample",
        "input",
        "output",
    ] {
        assert!(!glsl.contains(reserved), "{reserved} is reserved");
    }
}

#[test]
fn every_number_the_shader_gets_is_a_glsl_float() {
    for value in [0.0f32, 1.0, -0.25, 2.399_963, 1e-7] {
        let literal = glsl_float(value);
        assert!(literal.contains('.') || literal.contains('e'), "{literal}");
        assert!((literal.parse::<f32>().unwrap() - value).abs() < 1e-6);
    }
}
