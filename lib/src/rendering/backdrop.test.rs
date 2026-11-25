//! Tests for the blur behind an open menu.

use super::*;

#[test]
fn an_open_menu_blurs_the_world_up_to_the_full_amount() {
    let mut blur = 0.0;
    for _ in 0..40 {
        blur = fade(blur, true, 16.0);
    }
    assert_eq!(blur, MENU_BLUR_PX);
}

#[test]
fn a_closed_menu_clears_the_world() {
    let mut blur = MENU_BLUR_PX;
    for _ in 0..40 {
        blur = fade(blur, false, 16.0);
    }
    assert_eq!(blur, 0.0);
}

#[test]
fn the_blur_arrives_gradually() {
    let first = fade(0.0, true, 16.0);
    assert!(first > 0.0 && first < MENU_BLUR_PX);
}

#[test]
fn a_closed_world_stays_clear() {
    assert_eq!(fade(0.0, false, 16.0), 0.0);
}
