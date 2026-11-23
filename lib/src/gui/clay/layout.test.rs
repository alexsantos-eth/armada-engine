//! Tests for where the native HUD puts its pieces, mirroring the kit's CSS.

use super::*;

#[test]
fn on_a_desktop_the_bar_is_one_centred_row_along_the_bottom() {
    let layout = HudLayout::new(1280.0, 800.0, 12, false);
    assert_eq!(layout.slot, 54.0);
    assert_eq!(layout.slots.len(), 12);
    assert!(
        layout
            .slots
            .iter()
            .all(|slot| (slot.y - layout.slots[0].y).abs() < 1e-3)
    );
    let centre = layout.panel.x + layout.panel.w / 2.0;
    assert!((centre - 640.0).abs() < 1e-3);
    assert!((layout.panel.y + layout.panel.h - (800.0 - BOTTOM_MARGIN)).abs() < 1e-3);
    assert!(layout.prompt_anchor.1 < layout.panel.y);
    assert_eq!(layout.action.w, 104.0);
    assert!((layout.action.x + layout.action.w - (1280.0 - ACTION_MARGIN)).abs() < 1e-3);
}

#[test]
fn slots_shrink_on_a_narrow_desktop_window() {
    let layout = HudLayout::new(600.0, 600.0, 12, false);
    assert!(layout.slot < 54.0 && layout.slot >= 30.0);
    let right = layout.panel.x + layout.panel.w;
    assert!(
        layout.panel.x >= 0.0 && right <= 600.0,
        "{:?}",
        layout.panel
    );
}

#[test]
fn with_touch_controls_the_bar_climbs_to_the_top_in_rows_of_six() {
    let layout = HudLayout::new(390.0, 844.0, 12, true);
    assert_eq!(layout.slots.len(), 12);
    assert!((layout.slots[6].y - layout.slots[0].y) > layout.slot);
    assert!((layout.slots[5].y - layout.slots[0].y).abs() < 1e-3);
    assert!((layout.panel.y - TOP_MARGIN).abs() < 1e-3);
    assert!(layout.prompt_anchor.1 > layout.panel.y + layout.panel.h);
}

#[test]
fn with_touch_controls_the_action_button_sits_above_jump() {
    let (width, height) = (390.0, 844.0);
    let layout = HudLayout::new(width, height, 12, true);
    let jump = crate::touch::TouchLayout::new(width, height);
    let centre_x = layout.action.x + layout.action.w / 2.0;
    assert!((centre_x - jump.jump_center.0).abs() < 1e-3);
    assert!(layout.action.y + layout.action.h < jump.jump_center.1 - jump.jump_radius);
}

#[test]
fn a_point_inside_the_action_button_hits_it() {
    let layout = HudLayout::new(1280.0, 800.0, 12, false);
    let a = layout.action;
    assert!(layout.action_hit(a.x + a.w / 2.0, a.y + a.h / 2.0));
    assert!(!layout.action_hit(a.x - 5.0, a.y));
}
