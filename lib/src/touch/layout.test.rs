use super::*;

#[test]
fn the_controls_sit_in_opposite_bottom_corners() {
    let layout = TouchLayout::new(960.0, 600.0);

    assert!(layout.joystick_center.0 < 960.0 * 0.5);
    assert!(layout.jump_center.0 > 960.0 * 0.5);
    assert_eq!(layout.joystick_center.1, layout.jump_center.1);
    assert!(layout.joystick_center.1 > 600.0 * 0.5);
}

#[test]
fn both_controls_stay_inside_the_screen() {
    for (width, height) in [(960.0, 600.0), (800.0, 360.0), (400.0, 800.0)] {
        let layout = TouchLayout::new(width, height);

        assert!(layout.joystick_center.0 - layout.joystick_radius >= 0.0);
        assert!(layout.jump_center.0 + layout.jump_radius <= width);
        assert!(layout.joystick_center.1 + layout.joystick_radius <= height);
        assert!(layout.jump_center.1 - layout.jump_radius >= 0.0);
    }
}

#[test]
fn the_grab_area_is_generous_but_larger_than_the_knob() {
    let layout = TouchLayout::new(960.0, 600.0);

    assert!(layout.joystick_grab_radius > layout.joystick_radius);
    assert_eq!(
        layout.joystick_grab_radius,
        layout.joystick_radius * GRAB_FACTOR
    );
}

#[test]
fn hit_tests_accept_the_control_and_reject_the_rest() {
    let layout = TouchLayout::new(960.0, 600.0);

    assert!(layout.grab_hit(layout.joystick_center.0, layout.joystick_center.1));
    assert!(layout.grab_hit(
        layout.joystick_center.0 + layout.joystick_grab_radius * 0.9,
        layout.joystick_center.1
    ));
    assert!(!layout.grab_hit(layout.jump_center.0, layout.jump_center.1));
    assert!(!layout.grab_hit(10.0, 10.0));

    assert!(layout.jump_hit(layout.jump_center.0, layout.jump_center.1));
    assert!(layout.jump_hit(
        layout.jump_center.0,
        layout.jump_center.1 - layout.jump_radius * 0.9
    ));
    assert!(!layout.jump_hit(layout.joystick_center.0, layout.joystick_center.1));
    assert!(!layout.jump_hit(10.0, 10.0));
}

#[test]
fn the_layout_scales_with_the_screen_height() {
    let small = TouchLayout::new(960.0, 480.0);
    let large = TouchLayout::new(960.0, 840.0);

    assert!(large.joystick_radius > small.joystick_radius);
    assert!(large.jump_radius > small.jump_radius);
}
