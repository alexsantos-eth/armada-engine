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
