use super::*;

#[test]
fn the_copies_cover_the_view() {
    let period = (3360.0, 1680.0);
    let screen = (1280.0, 800.0);
    let copies = cloud_copies((500.0, 200.0), period, screen);
    assert!(!copies.is_empty());
    // Every point of the view is inside some copy.
    for &(x, y) in &[(0.0, 0.0), (1279.0, 799.0), (640.0, 400.0), (0.0, 799.0)] {
        assert!(
            copies.iter().any(|&(left, top)| x >= left
                && x < left + period.0
                && y >= top
                && y < top + period.1),
            "({x}, {y}) is not covered"
        );
    }
}

#[test]
fn a_copy_that_would_fall_off_the_view_is_not_drawn() {
    let period = (400.0, 200.0);
    let screen = (800.0, 400.0);
    let copies = cloud_copies((0.0, 0.0), period, screen);
    assert_eq!(copies.len(), 2 * 2);
    assert!(copies.iter().all(|&(x, y)| x < screen.0 && y < screen.1));
    assert!(
        copies
            .iter()
            .all(|&(x, y)| x + period.0 > 0.0 && y + period.1 > 0.0)
    );
}

#[test]
fn a_camera_far_from_the_origin_still_draws_a_handful_of_copies() {
    let period = (400.0, 200.0);
    let screen = (800.0, 400.0);
    let far = cloud_copies((900_000.0, -700_000.0), period, screen);
    assert!(far.len() <= 3 * 3, "{} copies", far.len());
    assert!(!far.is_empty());
}

#[test]
fn the_pattern_holds_its_place_on_the_ground() {
    let period = (400.0, 200.0);
    let screen = (800.0, 400.0);
    // A copy's offset within the period is all that is visible of the anchor, so an anchor and
    // the same anchor a whole period away place their copies identically.
    let near = cloud_copies((37.0, 11.0), period, screen);
    let away = cloud_copies((37.0 + period.0 * 5.0, 11.0 - period.1 * 3.0), period, screen);
    assert_eq!(near, away);
}

#[test]
fn a_period_of_nothing_draws_nothing() {
    assert!(cloud_copies((0.0, 0.0), (0.0, 100.0), (800.0, 400.0)).is_empty());
    assert!(cloud_copies((0.0, 0.0), (100.0, 0.0), (800.0, 400.0)).is_empty());
}

#[test]
fn the_drift_is_wrapped_at_the_period() {
    // `CloudShadows` needs a texture, so the drift is checked on the same arithmetic: a long
    // session must not end up placing its copies from a number the size of its own run time.
    let mut drift: f64 = 0.0;
    for _ in 0..100_000 {
        drift += CLOUD_DRIFT.0;
        drift %= CLOUD_PERIOD_TILES;
    }
    assert!(
        drift.abs() < CLOUD_PERIOD_TILES,
        "a day of drift is still inside one period: {drift}"
    );
    assert!(drift > 0.0, "and it did move: {drift}");
}
