//! Tests for the toasts' timing and queue.

use super::*;

fn note(text: &str) -> Toast {
    Toast::new(ToastIcon::Item("wood".to_owned()), text)
}

#[test]
fn a_toast_slides_in_stays_and_fades_out() {
    let start = toast_pose(0.0);
    assert_eq!(start.alpha, 0.0);
    assert!(start.dy < -10.0);
    let middle = toast_pose(LIFE_MS / 2.0);
    assert_eq!(middle.alpha, 1.0);
    assert_eq!(middle.dy, 0.0);
    let end = toast_pose(LIFE_MS - 1.0);
    assert!(end.alpha < 0.05);
}

#[test]
fn a_toast_goes_away_by_itself() {
    let mut toasts = Toasts::default();
    toasts.push(note("hola"));
    toasts.advance(LIFE_MS - 1.0);
    assert_eq!(toasts.len(), 1);
    toasts.advance(2.0);
    assert_eq!(toasts.len(), 0);
}

#[test]
fn a_newer_toast_pushes_the_oldest_out_past_the_limit() {
    let mut toasts = Toasts::default();
    for n in 0..=MAX_TOASTS {
        toasts.push(note(&n.to_string()));
    }
    assert_eq!(toasts.len(), MAX_TOASTS);
    assert_eq!(toasts.iter().next().unwrap().text, "1");
    assert_eq!(toasts.iter().last().unwrap().text, MAX_TOASTS.to_string());
}

#[test]
fn toasts_age_separately() {
    let mut toasts = Toasts::default();
    toasts.push(note("viejo"));
    toasts.advance(1000.0);
    toasts.push(note("nuevo"));
    toasts.advance(1000.0);
    let ages: Vec<f64> = toasts.iter().map(|toast| toast.age_ms).collect();
    assert_eq!(ages, vec![2000.0, 1000.0]);
}

#[test]
fn a_toast_can_carry_coins_and_warn() {
    let toast = note("x").with_coins(28, true).warning();
    assert_eq!(toast.coins, Some((28, true)));
    assert_eq!(toast.kind, ToastKind::Warning);
}
