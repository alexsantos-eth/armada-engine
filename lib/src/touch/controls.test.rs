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
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, radius(), 0.0)],
        48.0,
    );
    let released = step(&mut controls, &[], 48.0 + COAST_MS + 1.0);

    assert!((half.magnitude - 0.5).abs() < 1e-6);
    assert!(!half.run);
    assert_eq!(full.magnitude, 1.0);
    assert!(full.run);
    assert_eq!(released.walk, GridPoint { x: 0.0, y: 0.0 });
    assert!(!controls.view(WIDTH, HEIGHT).active);
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

    let next = tap(&mut controls, 2, 80.0 + COAST_MS + 1.0);

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

fn walk_then_let_go(controls: &mut TouchControls) -> TouchFrame {
    step(
        controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );
    let walking = step(
        controls,
        &[finger(1, RawTouchPhase::Moved, radius(), 0.0)],
        400.0,
    );
    step(
        controls,
        &[finger(1, RawTouchPhase::Ended, radius(), 0.0)],
        416.0,
    );
    walking
}

#[test]
fn letting_go_of_a_walking_stick_coasts_for_a_moment() {
    let mut controls = TouchControls::new(false);
    let walking = walk_then_let_go(&mut controls);

    let coasting = step(&mut controls, &[], 416.0 + COAST_MS - 1.0);
    let stopped = step(&mut controls, &[], 416.0 + COAST_MS + 1.0);

    assert_eq!(coasting.walk, walking.walk);
    assert!(!coasting.jump_pressed);
    assert_eq!(stopped, TouchFrame::default());
}

#[test]
fn a_touch_while_coasting_jumps_the_same_way() {
    let mut controls = TouchControls::new(false);
    let walking = walk_then_let_go(&mut controls);

    let jump = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, 0.0, 0.0)],
        500.0,
    );
    let held = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Stationary, 0.0, 0.0)],
        900.0,
    );

    assert!(jump.jump_pressed);
    assert!(jump.jump_held);
    assert_eq!(jump.walk, walking.walk);
    assert_eq!(held.walk, walking.walk);
    assert!(!held.gather_held);
}

#[test]
fn moving_after_a_coast_jump_steers_again() {
    let mut controls = TouchControls::new(false);
    let walking = walk_then_let_go(&mut controls);
    step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, 0.0, 0.0)],
        500.0,
    );

    let steered = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Moved, 0.0, radius())],
        516.0,
    );

    assert_eq!(steered.magnitude, 1.0);
    assert_ne!(steered.walk, walking.walk);
    assert!(steered.jump_held);
}

#[test]
fn a_tap_after_a_coast_jump_jumps_again_and_keeps_the_way() {
    let mut controls = TouchControls::new(false);
    let walking = walk_then_let_go(&mut controls);

    let first = tap(&mut controls, 2, 500.0);
    let between = step(&mut controls, &[], 600.0);
    let second = tap(&mut controls, 3, 700.0);

    assert!(first.jump_pressed);
    assert_eq!(between.walk, walking.walk);
    assert!(second.jump_pressed);
    assert_eq!(second.walk, walking.walk);
}

#[test]
fn a_touch_after_the_coast_does_not_jump() {
    let mut controls = TouchControls::new(false);
    walk_then_let_go(&mut controls);

    let late = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, 0.0, 0.0)],
        416.0 + COAST_MS + 1.0,
    );

    assert!(!late.jump_pressed);
    assert_eq!(late.magnitude, 0.0);
}

fn lock_reach() -> f32 {
    LOCK_REACH * radius()
}

/// Drags finger 1 from `DOWN` past the lock reach to the right, locking the run.
fn lock_right(controls: &mut TouchControls) -> TouchFrame {
    step(
        controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );
    step(
        controls,
        &[finger(1, RawTouchPhase::Moved, radius(), 0.0)],
        16.0,
    );
    step(
        controls,
        &[finger(1, RawTouchPhase::Moved, lock_reach() + 1.0, 0.0)],
        32.0,
    )
}

#[test]
fn the_base_stays_put_when_the_finger_passes_the_rim() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );

    let frame = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, radius() * 1.3, 0.0)],
        16.0,
    );
    let view = controls.view(WIDTH, HEIGHT);

    assert_eq!(view.center, DOWN);
    assert!((view.knob.0 - (DOWN.0 + radius())).abs() < 1e-3);
    assert_eq!(frame.magnitude, 1.0);
    assert!(!view.locked);
    let hint = view
        .lock_at
        .expect("past the rim the lock shows where to slide");
    assert!((hint.0 - (DOWN.0 + lock_reach())).abs() < 1e-3);
}

#[test]
fn within_the_rim_there_is_no_lock_hint() {
    let mut controls = TouchControls::new(false);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Started, 0.0, 0.0)],
        0.0,
    );
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, radius() * 0.5, 0.0)],
        16.0,
    );

    assert!(controls.view(WIDTH, HEIGHT).lock_at.is_none());
}

#[test]
fn sliding_past_the_lock_reach_locks_the_run() {
    let mut controls = TouchControls::new(false);

    let locked = lock_right(&mut controls);
    let view = controls.view(WIDTH, HEIGHT);

    assert!(locked.run);
    assert_eq!(locked.magnitude, 1.0);
    assert!(!locked.jump_pressed);
    assert!(view.locked);
    assert!((view.knob.0 - (DOWN.0 + radius())).abs() < 1e-3);
}

#[test]
fn the_locked_run_keeps_going_without_a_finger() {
    let mut controls = TouchControls::new(false);
    let locked = lock_right(&mut controls);
    let lifted = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, lock_reach(), 0.0)],
        48.0,
    );

    let later = step(&mut controls, &[], 5000.0);

    assert!(!lifted.jump_pressed);
    assert_eq!(later.walk, locked.walk);
    assert!(later.run);
    assert!(controls.view(WIDTH, HEIGHT).locked);
}

#[test]
fn a_tap_while_locked_jumps_and_a_second_tap_jumps_again() {
    let mut controls = TouchControls::new(false);
    lock_right(&mut controls);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, lock_reach(), 0.0)],
        48.0,
    );

    let first = tap(&mut controls, 2, 500.0);
    let first_up = step(&mut controls, &[], 580.0);
    tap(&mut controls, 3, 700.0);
    let second_up = step(&mut controls, &[], 780.0);

    assert!(!first.jump_pressed);
    assert!(first.run);
    assert!(first_up.jump_pressed || first_up.run);
    assert!(first_up.run);
    assert!(second_up.run);
    assert!(controls.view(WIDTH, HEIGHT).locked);
}

#[test]
fn a_locked_tap_jumps_when_the_finger_lifts() {
    let mut controls = TouchControls::new(false);
    lock_right(&mut controls);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, lock_reach(), 0.0)],
        48.0,
    );

    step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, radius() * 0.6, 0.0)],
        500.0,
    );
    let up = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Ended, radius() * 0.6, 0.0)],
        580.0,
    );
    step(
        &mut controls,
        &[finger(3, RawTouchPhase::Started, radius() * 0.6, 0.0)],
        650.0,
    );
    let again = step(
        &mut controls,
        &[finger(3, RawTouchPhase::Ended, radius() * 0.6, 0.0)],
        700.0,
    );

    assert!(up.jump_pressed);
    assert!(again.jump_pressed);
    assert!(up.run && again.run);
}

#[test]
fn a_long_press_while_locked_does_not_jump() {
    let mut controls = TouchControls::new(false);
    lock_right(&mut controls);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, lock_reach(), 0.0)],
        48.0,
    );

    step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, radius() * 0.6, 0.0)],
        500.0,
    );
    let up = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Ended, radius() * 0.6, 0.0)],
        500.0 + TAP_MS + 1.0,
    );

    assert!(!up.jump_pressed);
}

#[test]
fn sliding_past_the_rim_while_locked_steers_the_run() {
    let mut controls = TouchControls::new(false);
    let right = lock_right(&mut controls);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, lock_reach(), 0.0)],
        48.0,
    );

    step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, radius(), 0.0)],
        500.0,
    );
    let down = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Moved, 0.0, radius() * 1.2)],
        516.0,
    );
    let up = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Ended, 0.0, radius() * 1.2)],
        560.0,
    );

    assert_ne!(down.walk, right.walk);
    assert!(down.run);
    assert!(!up.jump_pressed);
    assert!(controls.view(WIDTH, HEIGHT).locked);
}

#[test]
fn sliding_back_to_the_centre_unlocks_and_the_finger_drives_again() {
    let mut controls = TouchControls::new(false);
    lock_right(&mut controls);
    step(
        &mut controls,
        &[finger(1, RawTouchPhase::Ended, lock_reach(), 0.0)],
        48.0,
    );

    step(
        &mut controls,
        &[finger(2, RawTouchPhase::Started, radius(), 0.0)],
        500.0,
    );
    let unlocked = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Moved, 0.0, 0.0)],
        540.0,
    );
    let view = controls.view(WIDTH, HEIGHT);
    let walking = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Moved, -radius(), 0.0)],
        560.0,
    );
    let released = step(
        &mut controls,
        &[finger(2, RawTouchPhase::Ended, -radius(), 0.0)],
        580.0,
    );
    let stopped = step(&mut controls, &[], 580.0 + COAST_MS + 1.0);

    assert_eq!(unlocked.magnitude, 0.0);
    assert!(!view.locked);
    assert_eq!(view.center, DOWN);
    assert_eq!(walking.magnitude, 1.0);
    assert!(!released.jump_pressed);
    assert_eq!(stopped, TouchFrame::default());
}

#[test]
fn the_locking_finger_can_unlock_without_lifting() {
    let mut controls = TouchControls::new(false);
    lock_right(&mut controls);

    let unlocked = step(
        &mut controls,
        &[finger(1, RawTouchPhase::Moved, 0.0, 0.0)],
        64.0,
    );

    assert_eq!(unlocked.magnitude, 0.0);
    assert!(!controls.view(WIDTH, HEIGHT).locked);
}
