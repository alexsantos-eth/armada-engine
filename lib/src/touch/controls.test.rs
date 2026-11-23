use super::*;
use crate::touch::layout::TouchLayout;
use iso::projection::GridPoint;

const WIDTH: f32 = 960.0;
const HEIGHT: f32 = 600.0;
const DOWN: (f32, f32) = (300.0, 400.0);

fn radius() -> f32 {
    TouchLayout::new(WIDTH, HEIGHT).radius
}

fn finger(id: u64, phase: RawTouchPhase, dx: f32, dy: f32) -> RawTouch {
    RawTouch {
        id,
        phase,
        x: DOWN.0 + dx,
        y: DOWN.1 + dy,
    }
}

fn step(controls: &mut TouchControls, touches: &[RawTouch], now_ms: f64) -> TouchFrame {
    controls.update(WIDTH, HEIGHT, touches, now_ms)
}

/// A quick tap of finger `id` that starts at `at_ms`; returns the frame of its touch-down.
fn tap(controls: &mut TouchControls, id: u64, at_ms: f64) -> TouchFrame {
    let down = step(
        controls,
        &[finger(id, RawTouchPhase::Started, 0.0, 0.0)],
        at_ms,
    );
    step(
        controls,
        &[finger(id, RawTouchPhase::Ended, 0.0, 0.0)],
        at_ms + 80.0,
    );
    down
}

#[test]
fn controls_start_hidden_on_the_desktop_and_visible_on_a_coarse_pointer() {
    assert!(!TouchControls::new(false).visible());
    assert!(TouchControls::new(true).visible());
}

#[test]
fn the_first_touch_reveals_the_controls() {
    let mut controls = TouchControls::new(false);

    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );

    assert!(controls.visible());
}

#[test]
fn idle_input_reports_an_idle_frame() {
    let mut controls = TouchControls::new(false);

    assert_eq!(step(&mut controls, &[], 0.0), TouchFrame::default());
}

#[test]
fn the_first_touch_puts_the_base_under_the_finger() {
    let mut controls = TouchControls::new(false);

    let frame = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );
    let view = controls.view(WIDTH, HEIGHT);

    assert_eq!(frame.magnitude, 0.0);
    assert!(view.active);
    assert_eq!(view.center, DOWN);
    assert_eq!(view.knob, DOWN);
}

#[test]
fn without_a_finger_the_stick_rests_in_the_corner() {
    let controls = TouchControls::new(true);
    let view = controls.view(WIDTH, HEIGHT);

    assert!(!view.active);
    assert_eq!(view.center, TouchLayout::new(WIDTH, HEIGHT).rest);
}

#[test]
fn dragging_walks_and_releasing_stops() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );

    let half = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, radius() * 0.5, 0.0)],
        16.0,
    );
    let full = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, radius(), 0.0)],
        32.0,
    );
    let released = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, radius(), 0.0)],
        48.0,
    );

    assert!((half.magnitude - 0.5).abs() < 1e-6);
    assert!(!half.run);
    assert_eq!(full.magnitude, 1.0);
    assert!(full.run);
    assert_eq!(released.walk, GridPoint { x: 0.0, y: 0.0 });
    assert!(!controls.view(WIDTH, HEIGHT).active);
}

#[test]
fn dragging_past_the_rim_pulls_the_base_along() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );

    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, radius() * 3.0, 0.0)],
        16.0,
    );
    let view = controls.view(WIDTH, HEIGHT);
    let back = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, radius() * 2.0, 0.0)],
        32.0,
    );

    assert!((view.center.0 - (DOWN.0 + radius() * 2.0)).abs() < 1e-3);
    assert!((view.knob.0 - (DOWN.0 + radius() * 3.0)).abs() < 1e-3);
    assert_eq!(back.magnitude, 0.0);
}

#[test]
fn holding_the_stick_still_gathers() {
    let mut controls = TouchControls::new(false);
    let still = |phase| [finger(1, phase, 0.0, 0.0)];

    step(&mut controls, &still(RawTouchPhase::Started), 0.0);
    let early = step(
        &mut controls,
        &still(RawTouchPhase::Stationary),
        HOLD_MS - 1.0,
    );
    let held = step(&mut controls, &still(RawTouchPhase::Stationary), HOLD_MS);
    let released = step(&mut controls, &still(RawTouchPhase::Ended), HOLD_MS + 16.0);

    assert!(!early.gather_held);
    assert!(held.gather_held);
    assert!(!released.gather_held);
}

#[test]
fn walking_does_not_gather_until_the_stick_rests_again() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );

    let walking = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, radius(), 0.0)],
        400.0,
    );
    let back = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, 0.0, 0.0)],
        500.0,
    );
    let rested = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Stationary, 0.0, 0.0)],
        500.0 + HOLD_MS,
    );

    assert!(!walking.gather_held);
    assert!(!back.gather_held);
    assert!(rested.gather_held);
}

#[test]
fn a_single_tap_does_nothing() {
    let mut controls = TouchControls::new(false);

    let down = tap(&mut controls, 1, 0.0);

    assert!(!down.jump_pressed);
    assert!(!down.gather_held);
}

#[test]
fn a_double_tap_jumps_and_holds_the_jump() {
    let mut controls = TouchControls::new(false);
    tap(&mut controls, 1, 0.0);

    let second = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, 0.0, 0.0)],
        200.0,
    );
    let held = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Stationary, 0.0, 0.0)],
        200.0 + HOLD_MS,
    );

    assert!(second.jump_pressed);
    assert!(second.jump_held);
    assert!(!held.jump_pressed);
    assert!(held.jump_held);
    assert!(!held.gather_held);
}

#[test]
fn a_triple_tap_jumps_twice() {
    let mut controls = TouchControls::new(false);

    let first = tap(&mut controls, 1, 0.0);
    let second = tap(&mut controls, 2, 200.0);
    let third = tap(&mut controls, 3, 400.0);

    assert!(!first.jump_pressed);
    assert!(second.jump_pressed);
    assert!(third.jump_pressed);
}

#[test]
fn taps_too_far_apart_do_not_chain() {
    let mut controls = TouchControls::new(false);
    tap(&mut controls, 1, 0.0);

    let late = tap(&mut controls, 2, 80.0 + TAP_GAP_MS + 1.0);

    assert!(!late.jump_pressed);
}

#[test]
fn a_long_press_breaks_the_chain() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, 0.0, 0.0)],
        TAP_MS + 1.0,
    );

    let next = tap(&mut controls, 2, TAP_MS + 100.0);

    assert!(!next.jump_pressed);
}

#[test]
fn a_tap_that_drags_is_not_a_tap() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, radius(), 0.0)],
        40.0,
    );
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, radius(), 0.0)],
        80.0,
    );

    let next = tap(&mut controls, 2, 150.0);

    assert!(!next.jump_pressed);
}

#[test]
fn the_second_tap_can_drag_while_it_jumps() {
    let mut controls = TouchControls::new(false);
    tap(&mut controls, 1, 0.0);
    step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, 0.0, 0.0)],
        200.0,
    );

    let frame = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Moved, radius(), 0.0)],
        216.0,
    );

    assert!(frame.jump_held);
    assert_eq!(frame.magnitude, 1.0);
}

#[test]
fn a_second_finger_does_not_steal_the_stick() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );

    let frame = step(
        &mut controls,
        &[
            finger(1, RawTouchPhase::Moved, radius(), 0.0),
            RawTouch {
                id: 2,
                phase: RawTouchPhase::Started,
                x: 50.0,
                y: 50.0,
            },
        ],
        16.0,
    );

    assert_eq!(frame.magnitude, 1.0);
    assert_eq!(controls.view(WIDTH, HEIGHT).center, DOWN);
}

#[test]
fn a_cancelled_or_missing_touch_releases_the_stick() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, radius(), 0.0)],
        0.0,
    );
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Cancelled, radius(), 0.0)],
        16.0,
    );
    assert!(!controls.view(WIDTH, HEIGHT).active);

    step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, 0.0, 0.0)],
        1000.0,
    );
    let gone = step(&mut controls, &[], 1016.0);
    assert_eq!(gone, TouchFrame::default());
    assert!(!controls.view(WIDTH, HEIGHT).active);
}
