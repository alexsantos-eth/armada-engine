use super::*;

#[test]
fn the_stick_rests_in_the_bottom_right_corner() {
    let layout = TouchLayout::new(960.0, 600.0);

    assert!(layout.rest.0 > 960.0 * 0.5);
    assert!(layout.rest.1 > 600.0 * 0.5);
}

#[test]
fn the_resting_stick_stays_inside_the_screen() {
    for (width, height) in [(960.0, 600.0), (800.0, 360.0), (400.0, 800.0)] {
        let layout = TouchLayout::new(width, height);

        assert!(layout.rest.0 + layout.radius <= width);
        assert!(layout.rest.1 + layout.radius <= height);
        assert!(layout.rest.0 - layout.radius >= 0.0);
    }
}

#[test]
fn the_knob_is_smaller_than_the_base() {
    let layout = TouchLayout::new(960.0, 600.0);

    assert!(layout.knob_radius < layout.radius);
}

#[test]
fn sizes_scale_with_the_screen_height_within_limits() {
    let small = TouchLayout::new(640.0, 300.0);
    let base = TouchLayout::new(960.0, 600.0);
    let large = TouchLayout::new(2000.0, 1600.0);

    assert_eq!(base.radius, 60.0);
    assert_eq!(small.radius, 60.0 * 0.75);
    assert_eq!(large.radius, 60.0 * 1.4);
}
