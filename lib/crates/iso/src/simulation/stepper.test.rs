use super::*;
use serde_json::Value;

#[test]
fn matches_typescript_frame_fixture() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../../../web/src/isometric/core/engine/flow-check/contracts.v1.json"
    ))
    .unwrap();
    let sample = &fixture["stepper"];
    let mut stepper = FixedStepper::default();
    assert_eq!(stepper.step_ms, sample["stepMs"].as_f64().unwrap());
    for (frame, expected) in sample["framesMs"]
        .as_array()
        .unwrap()
        .iter()
        .zip(sample["steps"].as_array().unwrap())
    {
        assert_eq!(
            stepper.consume_frame(frame.as_f64().unwrap()),
            expected.as_u64().unwrap()
        );
    }
    assert!((stepper.interpolation_alpha() - sample["alpha"][3].as_f64().unwrap()).abs() < 1e-12);
}

#[test]
fn caps_real_frame_before_scaling_and_preserves_pause_remainder() {
    let mut stepper = FixedStepper::default();
    assert_eq!(stepper.consume_frame(30.0), 0);
    stepper.paused = true;
    assert_eq!(stepper.consume_frame(500.0), 0);
    assert_eq!(stepper.interpolation_alpha(), 0.6);
    stepper.paused = false;
    assert_eq!(stepper.consume_frame(20.0), 1);
    assert_eq!(stepper.consume_frame(60_000.0), 5);
    stepper.set_time_scale(60.0).unwrap();
    assert_eq!(stepper.consume_frame(1000.0), 300);
}

#[test]
fn rejects_invalid_options_and_ignores_invalid_frames() {
    assert!(
        FixedStepper::new(StepperOptions {
            step_ms: 0.0,
            ..StepperOptions::default()
        })
        .is_err()
    );
    let mut stepper = FixedStepper::default();
    assert!(stepper.set_time_scale(f64::NAN).is_err());
    assert_eq!(stepper.consume_frame(f64::INFINITY), 0);
    assert_eq!(stepper.consume_frame(-1.0), 0);
    assert_eq!(stepper.time_scale, 1.0);
}
