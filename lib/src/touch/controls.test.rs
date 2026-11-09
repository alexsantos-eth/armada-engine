use super::*;
use crate::touch::layout::TouchLayout;
use iso::projection::GridPoint;

const WIDTH: f32 = 960.0;
const HEIGHT: f32 = 600.0;

fn layout() -> TouchLayout {
    TouchLayout::new(WIDTH, HEIGHT)
}

fn joystick_touch(id: u64, phase: RawTouchPhase, dx: f32, dy: f32) -> RawTouch {
    let layout = layout();
    RawTouch {
        id,
        phase,
        x: layout.joystick_center.0 + dx,
        y: layout.joystick_center.1 + dy,
    }
}

fn jump_touch(id: u64, phase: RawTouchPhase) -> RawTouch {
    let layout = layout();
    RawTouch {
        id,
        phase,
        x: layout.jump_center.0,
        y: layout.jump_center.1,
    }
}

fn far_away(id: u64, phase: RawTouchPhase) -> RawTouch {
    RawTouch {
        id,
        phase,
        x: WIDTH * 0.5,
        y: HEIGHT * 0.2,
    }
}

#[test]
fn controls_start_hidden_on_the_desktop_and_visible_on_a_coarse_pointer() {
    assert!(!TouchControls::new(false).visible());
    assert!(TouchControls::new(true).visible());
}

#[test]
fn the_first_touch_reveals_the_controls() {
    let mut controls = TouchControls::new(false);

    controls.update(WIDTH, HEIGHT, &[far_away(1, RawTouchPhase::Started)]);

    assert!(controls.visible());
}

#[test]
fn idle_input_reports_an_idle_frame() {
    let mut controls = TouchControls::new(false);

    let frame = controls.update(WIDTH, HEIGHT, &[]);

    assert_eq!(frame.walk, GridPoint { x: 0.0, y: 0.0 });
    assert_eq!(frame.magnitude, 0.0);
    assert!(!frame.run);
    assert!(!frame.jump_pressed);
    assert!(!frame.jump_held);
}

#[test]
fn dragging_the_stick_walks_and_releasing_stops() {
    let mut controls = TouchControls::new(false);
    let grab = TouchLayout::new(WIDTH, HEIGHT);

    let started = controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(
            1,
            RawTouchPhase::Started,
            grab.joystick_radius,
            0.0,
        )],
    );
    assert!(started.magnitude > 0.0);

    let held = controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(
            1,
            RawTouchPhase::Stationary,
            grab.joystick_radius,
            0.0,
        )],
    );
    assert_eq!(held.magnitude, 1.0);

    let released = controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(
            1,
            RawTouchPhase::Ended,
            grab.joystick_radius,
            0.0,
        )],
    );
    assert_eq!(released.walk, GridPoint { x: 0.0, y: 0.0 });
    assert_eq!(released.magnitude, 0.0);
}

#[test]
fn a_stick_touch_outside_the_grab_radius_does_not_grab() {
    let mut controls = TouchControls::new(false);

    let frame = controls.update(WIDTH, HEIGHT, &[far_away(1, RawTouchPhase::Started)]);

    assert_eq!(frame.magnitude, 0.0);
}

#[test]
fn pushing_the_stick_fully_runs() {
    let mut controls = TouchControls::new(false);
    let layout = layout();

    let frame = controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(
            1,
            RawTouchPhase::Started,
            layout.joystick_radius,
            0.0,
        )],
    );

    assert!(frame.run);
}

#[test]
fn a_half_push_does_not_run() {
    let mut controls = TouchControls::new(false);
    let layout = layout();

    let frame = controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(
            1,
            RawTouchPhase::Started,
            layout.joystick_radius * 0.5,
            0.0,
        )],
    );

    assert!(!frame.run);
    assert!(frame.magnitude > 0.0);
}

#[test]
fn the_jump_button_fires_pressed_once_and_stays_held() {
    let mut controls = TouchControls::new(false);

    let first = controls.update(WIDTH, HEIGHT, &[jump_touch(7, RawTouchPhase::Started)]);
    assert!(first.jump_pressed);
    assert!(first.jump_held);

    let second = controls.update(WIDTH, HEIGHT, &[jump_touch(7, RawTouchPhase::Stationary)]);
    assert!(!second.jump_pressed);
    assert!(second.jump_held);

    let released = controls.update(WIDTH, HEIGHT, &[jump_touch(7, RawTouchPhase::Ended)]);
    assert!(!released.jump_pressed);
    assert!(!released.jump_held);
}

#[test]
fn the_jump_button_and_the_stick_work_at_the_same_time() {
    let mut controls = TouchControls::new(false);

    let frame = controls.update(
        WIDTH,
        HEIGHT,
        &[
            joystick_touch(1, RawTouchPhase::Started, layout().joystick_radius, 0.0),
            jump_touch(2, RawTouchPhase::Started),
        ],
    );

    assert!(frame.jump_pressed);
    assert!(frame.magnitude > 0.0);
}

#[test]
fn a_cancelled_stick_touch_releases_the_stick() {
    let mut controls = TouchControls::new(false);

    controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(
            1,
            RawTouchPhase::Started,
            layout().joystick_radius,
            0.0,
        )],
    );
    let frame = controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(1, RawTouchPhase::Cancelled, 0.0, 0.0)],
    );

    assert_eq!(frame.magnitude, 0.0);
}

#[test]
fn a_missing_stick_touch_releases_the_stick() {
    let mut controls = TouchControls::new(false);

    controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(
            1,
            RawTouchPhase::Started,
            layout().joystick_radius,
            0.0,
        )],
    );
    let frame = controls.update(WIDTH, HEIGHT, &[]);

    assert_eq!(frame.magnitude, 0.0);
}

#[test]
fn a_touch_on_the_jump_button_never_grabs_the_stick() {
    let mut controls = TouchControls::new(false);

    controls.update(WIDTH, HEIGHT, &[jump_touch(3, RawTouchPhase::Started)]);
    let frame = controls.update(WIDTH, HEIGHT, &[jump_touch(3, RawTouchPhase::Moved)]);

    assert_eq!(frame.magnitude, 0.0);
}

#[test]
fn a_different_touch_does_not_steal_the_stick() {
    let mut controls = TouchControls::new(false);

    controls.update(
        WIDTH,
        HEIGHT,
        &[joystick_touch(
            1,
            RawTouchPhase::Started,
            layout().joystick_radius * 0.5,
            0.0,
        )],
    );
    let frame = controls.update(
        WIDTH,
        HEIGHT,
        &[
            joystick_touch(
                1,
                RawTouchPhase::Stationary,
                layout().joystick_radius * 0.5,
                0.0,
            ),
            joystick_touch(9, RawTouchPhase::Started, 0.0, 0.0),
        ],
    );

    assert_eq!(frame.magnitude, 0.5);
}
