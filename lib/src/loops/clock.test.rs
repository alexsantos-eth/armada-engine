use super::*;

const SIXTY_HZ_MS: f64 = 1000.0 / 60.0;
const SIXTY_HZ_S: f64 = 1.0 / 60.0;

fn settled_at(cadence_seconds: f64) -> (FrameClock, f64) {
    let mut clock = FrameClock::new();
    let mut now = 10.0;
    clock.tick(Some(now), 0.0);
    for _ in 0..HISTORY_LEN {
        now += cadence_seconds;
        clock.tick(Some(now), 0.0);
    }
    (clock, now)
}

#[test]
fn without_a_timestamp_the_clock_reports_what_the_window_measured() {
    let mut clock = FrameClock::new();

    assert!((clock.tick(None, 12.5) - 12.5).abs() < 1e-9);
    assert!((clock.tick(None, 20.0) - 20.0).abs() < 1e-9);
}

#[test]
fn a_fallback_that_is_not_a_duration_becomes_one_frame_at_sixty() {
    let mut clock = FrameClock::new();

    assert!((clock.tick(None, 0.0) - DEFAULT_FRAME_MS).abs() < 1e-9);
    assert!((clock.tick(None, f64::NAN) - DEFAULT_FRAME_MS).abs() < 1e-9);
    assert!((clock.tick(None, -5.0) - DEFAULT_FRAME_MS).abs() < 1e-9);
}

#[test]
fn a_fallback_longer_than_a_quarter_second_is_clamped() {
    let mut clock = FrameClock::new();

    assert!((clock.tick(None, 5000.0) - MAX_FRAME_MS).abs() < 1e-9);
}

#[test]
fn the_first_timestamped_frame_falls_back_because_there_is_no_previous_instant() {
    let mut clock = FrameClock::new();

    assert!((clock.tick(Some(1234.5), 9.0) - 9.0).abs() < 1e-9);
}

#[test]
fn a_timestamp_that_does_not_move_forward_falls_back() {
    let mut clock = FrameClock::new();
    clock.tick(Some(100.0), 16.0);

    assert!((clock.tick(Some(100.0), 16.0) - 16.0).abs() < 1e-9);
    assert!((clock.tick(Some(99.0), 16.0) - 16.0).abs() < 1e-9);
}

#[test]
fn a_timestamp_that_is_not_a_number_falls_back() {
    let mut clock = FrameClock::new();

    assert!((clock.tick(Some(f64::NAN), 16.0) - 16.0).abs() < 1e-9);
    assert!((clock.tick(Some(f64::INFINITY), 16.0) - 16.0).abs() < 1e-9);
    assert!((clock.tick(Some(0.0), 16.0) - 16.0).abs() < 1e-9);
}

#[test]
fn a_steady_cadence_is_reported_steady() {
    let (mut clock, mut now) = settled_at(SIXTY_HZ_S);

    for _ in 0..10 {
        now += SIXTY_HZ_S;
        assert!((clock.tick(Some(now), 0.0) - SIXTY_HZ_MS).abs() < 1e-9);
    }
}

#[test]
fn noise_around_the_cadence_is_snapped_away() {
    let (mut clock, mut now) = settled_at(SIXTY_HZ_S);

    now += SIXTY_HZ_S + 0.0012;
    let reported = clock.tick(Some(now), 0.0);

    assert!((reported - SIXTY_HZ_MS).abs() < 1e-9);
}

#[test]
fn noise_too_far_from_the_cadence_is_reported_as_measured() {
    let (mut clock, mut now) = settled_at(SIXTY_HZ_S);

    now += 0.012;
    let reported = clock.tick(Some(now), 0.0);

    assert!((reported - 12.0).abs() < 1e-9);
}

#[test]
fn a_frame_the_browser_deferred_is_spread_over_the_frames_that_follow() {
    let (mut clock, mut now) = settled_at(SIXTY_HZ_S);

    now += 2.0 * SIXTY_HZ_S;
    let deferred = clock.tick(Some(now), 0.0);

    assert!((deferred - SIXTY_HZ_MS * (1.0 + CATCH_UP_SHARE)).abs() < 1e-9);

    now += SIXTY_HZ_S;
    let next = clock.tick(Some(now), 0.0);

    assert!(next > SIXTY_HZ_MS);
    assert!(next <= SIXTY_HZ_MS * (1.0 + CATCH_UP_SHARE) + 1e-9);
}

#[test]
fn the_time_a_deferred_frame_owes_is_paid_back_and_then_the_clock_settles() {
    let (mut clock, mut now) = settled_at(SIXTY_HZ_S);

    now += 2.0 * SIXTY_HZ_S;
    let mut total = clock.tick(Some(now), 0.0);
    for _ in 0..8 {
        now += SIXTY_HZ_S;
        total += clock.tick(Some(now), 0.0);
    }

    assert!((total - 10.0 * SIXTY_HZ_MS).abs() < 1e-6);
    assert!((clock.debt_ms - 0.0).abs() < 1e-9);
}

#[test]
fn a_cadence_that_stays_slower_becomes_the_new_normal() {
    let (mut clock, mut now) = settled_at(2.0 * SIXTY_HZ_S);

    now += 2.0 * SIXTY_HZ_S;
    let reported = clock.tick(Some(now), 0.0);

    assert!((reported - 2.0 * SIXTY_HZ_MS).abs() < 1e-9);
}

#[test]
fn a_long_pause_is_clamped_and_does_not_leave_the_clock_owing_seconds() {
    let (mut clock, mut now) = settled_at(SIXTY_HZ_S);

    now += 3.0;
    clock.tick(Some(now), 0.0);

    assert!(clock.debt_ms <= SIXTY_HZ_MS * MAX_DEBT_MULTIPLE + 1e-9);

    for _ in 0..40 {
        now += SIXTY_HZ_S;
        let reported = clock.tick(Some(now), 0.0);
        assert!(reported <= SIXTY_HZ_MS * (1.0 + CATCH_UP_SHARE) + 1e-9);
    }
    assert!((clock.debt_ms - 0.0).abs() < 1e-9);
}

#[test]
fn a_gap_longer_than_the_snapping_window_is_reported_as_measured() {
    let (mut clock, mut now) = settled_at(SIXTY_HZ_S);

    now += 6.0 * SIXTY_HZ_S;
    clock.tick(Some(now), 0.0);

    assert!(clock.debt_ms > 0.0);
}

#[test]
fn a_cadence_of_zero_leaves_the_measurement_alone() {
    assert!((snap_to_cadence(16.0, 0.0) - 16.0).abs() < 1e-9);
    assert!((snap_to_cadence(16.0, -1.0) - 16.0).abs() < 1e-9);
}

#[test]
fn a_measurement_shorter_than_half_the_cadence_is_left_alone() {
    assert!((snap_to_cadence(4.0, SIXTY_HZ_MS) - 4.0).abs() < 1e-9);
}

#[test]
fn the_default_clock_is_a_new_one() {
    let mut default = FrameClock::default();
    let mut new = FrameClock::new();

    assert!((default.tick(None, 16.0) - new.tick(None, 16.0)).abs() < 1e-9);
}

#[test]
fn the_native_build_has_no_browser_timestamp() {
    assert!(frame_timestamp_seconds().is_none());
}
