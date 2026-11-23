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
    let action = layout.action.expect("a desktop has the action button");
    assert_eq!(action.w, 104.0);
    assert!((action.x + action.w - (1280.0 - ACTION_MARGIN)).abs() < 1e-3);
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
fn on_a_portrait_phone_the_bar_climbs_to_the_top_in_rows_of_six() {
    let layout = HudLayout::new(390.0, 844.0, 12, true);
    assert_eq!(layout.slots.len(), 12);
    assert!((layout.slots[6].y - layout.slots[0].y) > layout.slot);
    assert!((layout.slots[5].y - layout.slots[0].y).abs() < 1e-3);
    assert!((layout.panel.y - TOP_MARGIN).abs() < 1e-3);
    assert!(layout.prompt_anchor.1 > layout.panel.y + layout.panel.h);
}

#[test]
fn with_touch_controls_there_is_no_action_button() {
    let layout = HudLayout::new(390.0, 844.0, 12, true);
    assert!(layout.action.is_none());
    assert!(!layout.action_hit(300.0, 700.0));
}

#[test]
fn on_a_landscape_phone_the_bar_is_one_slim_row_at_the_top() {
    let layout = HudLayout::new(844.0, 390.0, 12, true);
    assert!(
        layout
            .slots
            .iter()
            .all(|slot| (slot.y - layout.slots[0].y).abs() < 1e-3)
    );
    assert!(layout.slot <= TOUCH_ROW_SLOT.1);
    assert!((layout.panel.y - TOP_MARGIN).abs() < 1e-3);
    assert!(layout.panel.x >= 0.0 && layout.panel.x + layout.panel.w <= 844.0);
}

#[test]
fn a_point_inside_the_action_button_hits_it() {
    let layout = HudLayout::new(1280.0, 800.0, 12, false);
    let a = layout.action.expect("a desktop has the action button");
    assert!(layout.action_hit(a.x + a.w / 2.0, a.y + a.h / 2.0));
    assert!(!layout.action_hit(a.x - 5.0, a.y));
}
