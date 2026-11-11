//! Tests for the wind's push on the swaying sprites: phase, offset and bounds.

use super::{DEFAULT_WIND_STRENGTH, SWAY_GUST_RATE, SWAY_GUST_WEIGHT, sway_offset, sway_phase};
use crate::entities::EntitySway;

const SWAY: EntitySway = EntitySway {
    cut: 0.6,
    amplitude: 2.0,
    period: 3000.0,
};

#[test]
fn a_phase_is_deterministic_in_range_and_varies_by_entity() {
    let phase = sway_phase("tree@4,9");
    assert_eq!(phase, sway_phase("tree@4,9"));
    assert!((0.0..std::f64::consts::TAU).contains(&phase));
    assert_ne!(sway_phase("tree@4,9"), sway_phase("tree@4,10"));
    assert_ne!(sway_phase("tree@4,9"), sway_phase("tree_2@4,9"));
}

#[test]
fn the_offset_never_exceeds_the_amplitude_times_the_strength() {
    for phase in [0.0, 1.3, 2.7, 5.9] {
        let limit = SWAY.amplitude * 2.0;
        for ms in (0..SWAY.period as i32).step_by(13) {
            let offset = sway_offset(&SWAY, phase, f64::from(ms), 2.0);
            assert!(
                offset.abs() <= limit + 1e-9,
                "offset {offset} of phase {phase} at {ms} ms escapes {limit}"
            );
        }
    }
}

#[test]
fn a_zero_strength_or_a_zero_amplitude_never_leans() {
    assert_eq!(sway_offset(&SWAY, 0.7, 1234.0, 0.0), 0.0);
    let still = EntitySway {
        amplitude: 0.0,
        ..SWAY
    };
    assert_eq!(sway_offset(&still, 0.7, 1234.0, DEFAULT_WIND_STRENGTH), 0.0);
}

#[test]
fn the_offset_is_two_waves_of_the_declared_period() {
    let phase = 0.7;
    let ms = 1234.0;
    let angle = 2.0 * std::f64::consts::PI * ms / SWAY.period + phase;
    let expected = SWAY.amplitude
        * DEFAULT_WIND_STRENGTH
        * ((1.0 - SWAY_GUST_WEIGHT) * angle.sin()
            + SWAY_GUST_WEIGHT * (SWAY_GUST_RATE * angle + phase).sin());
    assert!(
        (sway_offset(&SWAY, phase, ms, DEFAULT_WIND_STRENGTH) - expected).abs() < 1e-12,
        "the gust wave rides on top of the main one"
    );
}

#[test]
fn the_gusts_keep_the_sway_from_ticking_like_a_metronome() {
    let phase = 2.0;
    let ms = 1500.0;
    let angle = 2.0 * std::f64::consts::PI * ms / SWAY.period + phase;
    let plain = SWAY.amplitude * angle.sin();
    let with_gust = sway_offset(&SWAY, phase, ms, 1.0);
    assert!(
        (plain - with_gust).abs() > 0.1 * SWAY.amplitude,
        "without the second wave the offset would be {plain}"
    );
}
