use super::*;

#[test]
fn render_target_size_rounds_up_and_never_allocates_a_zero_sized_texture() {
    assert_eq!(render_target_size(0.0, 0.0), (1, 1));
    assert_eq!(render_target_size(640.2, 359.1), (641, 360));
    assert_eq!(render_target_size(960.0, 600.0), (960, 600));
}

#[test]
fn render_target_size_rejects_invalid_dimensions() {
    assert_eq!(render_target_size(f32::NAN, 12.0), (1, 12));
    assert_eq!(render_target_size(-4.0, f32::INFINITY), (1, 1));
}

#[test]
fn scene_camera_keeps_the_framebuffers_pixel_coordinate_system() {
    let camera = scene_camera(960.0, 600.0);

    assert_eq!(camera.target, vec2(480.0, 300.0));
    assert_eq!(camera.zoom, vec2(2.0 / 960.0, -2.0 / 600.0));
}

#[test]
fn presentation_flips_the_render_texture_back_to_screen_orientation() {
    let params = present_params(960.0, 600.0);

    assert_eq!(params.dest_size, Some(vec2(960.0, 600.0)));
    assert!(params.flip_y);
}
