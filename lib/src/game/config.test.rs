use super::*;
use iso::assets::{SVG_BLOCK_HEIGHT, SVG_TILE_WIDTH};

#[test]
fn a_fine_pointer_draws_the_reference_metrics() {
    let metrics = SceneMetrics::for_pointer(false);
    assert_eq!(metrics.tile_width, PREVIEW_TILE_WIDTH);
    assert_eq!(metrics.tile_height, PREVIEW_TILE_HEIGHT);
    assert_eq!(metrics.elevation_step, PREVIEW_ELEVATION_STEP);
}

#[test]
fn a_coarse_pointer_draws_the_scene_zoomed_out_a_little() {
    let metrics = SceneMetrics::for_pointer(true);
    assert!((metrics.tile_width - PREVIEW_TILE_WIDTH * MOBILE_ZOOM).abs() < 1e-9);
    assert!(
        metrics.tile_width < PREVIEW_TILE_WIDTH,
        "the touch-first view is pulled back, not zoomed in"
    );
    assert_eq!(metrics.tile_height, metrics.tile_width / 2.0);
    assert!(
        (metrics.elevation_step - metrics.tile_width * SVG_BLOCK_HEIGHT / SVG_TILE_WIDTH).abs()
            < 1e-9,
        "one level of elevation keeps the block ratio of the artwork"
    );
}

#[test]
fn the_mobile_zoom_is_only_a_little_pull_back() {
    const {
        assert!(MOBILE_ZOOM > 0.5 && MOBILE_ZOOM < 1.0);
    }
}

#[test]
fn the_phase_transition_is_positive() {
    const { assert!(PHASE_TRANSITION_SECONDS > 0.0) };
}

#[test]
fn the_client_cap_lets_a_hitch_consume_at_most_one_tick() {
    let mut stepper = iso::simulation::FixedStepper::new(iso::simulation::StepperOptions {
        max_frame_ms: MAX_FRAME_MS,
        ..iso::simulation::StepperOptions::default()
    })
    .expect("the client's stepper options are valid");
    assert_eq!(stepper.consume_frame(1000.0), 1);
    assert_eq!(stepper.consume_frame(250.0), 1);
    assert_eq!(stepper.consume_frame(50.0), 1);
    let mut stepper = iso::simulation::FixedStepper::default();
    assert_eq!(stepper.consume_frame(250.0), 5);
}

#[test]
fn the_client_cap_keeps_a_steady_thirty_frames_at_real_time() {
    let mut stepper = iso::simulation::FixedStepper::new(iso::simulation::StepperOptions {
        max_frame_ms: MAX_FRAME_MS,
        ..iso::simulation::StepperOptions::default()
    })
    .expect("the client's stepper options are valid");
    let mut ticks = 0;
    for _ in 0..30 {
        ticks += stepper.consume_frame(33.4);
    }
    assert_eq!(ticks, 20);
}
