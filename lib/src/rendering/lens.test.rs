use super::*;

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
fn the_shader_carries_the_authored_vignette_and_gain() {
    let glsl = lens_glsl();
    assert!(glsl.contains("float vignette("));
    assert!(glsl.contains(&format!(
        "smoothstep({}, 1.0, reach)",
        glsl_float(VIGNETTE_START)
    )));
    assert!(glsl.contains(&glsl_float(VIGNETTE_STRENGTH)));
    assert!(glsl.contains(&format!(
        "1.0 + {} + {} * focus",
        glsl_float(SCENE_SATURATION),
        glsl_float(FOCUS_SATURATION)
    )));
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
