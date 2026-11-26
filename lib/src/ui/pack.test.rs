//! Tests for where the mobile inventory panel puts its pieces.

use super::*;

fn inside(outer: Rect, inner: Rect) -> bool {
    inner.x >= outer.x - 0.01
        && inner.y >= outer.y - 0.01
        && inner.right() <= outer.right() + 0.01
        && inner.bottom() <= outer.bottom() + 0.01
}

#[test]
fn the_panel_sits_in_the_middle_of_the_screen() {
    let layout = PackLayout::new(390.0, 844.0, 12, 4);
    let centre = layout.panel.center();
    assert!((centre.x - 195.0).abs() < 0.5);
    assert!((centre.y - 422.0).abs() < 0.5);
}

#[test]
fn everything_fits_inside_the_panel_on_phones_of_any_size() {
    for (w, h) in [
        (320.0, 568.0),
        (390.0, 844.0),
        (844.0, 390.0),
        (1024.0, 768.0),
    ] {
        let layout = PackLayout::new(w, h, 12, 5);
        for rect in layout.slots.iter().chain(&layout.tool_rows).chain([
            &layout.items,
            &layout.tools,
            &layout.close,
        ]) {
            assert!(inside(layout.panel, *rect), "{w}x{h}: {rect:?}");
        }
        assert!(layout.panel.x >= 0.0 && layout.panel.right() <= w);
    }
}

#[test]
fn the_tabs_and_the_close_button_do_not_overlap() {
    let layout = PackLayout::new(320.0, 568.0, 12, 4);
    assert!(layout.items.right() <= layout.tools.x);
    assert!(layout.tools.right() <= layout.close.x);
}

#[test]
fn slots_make_a_grid_and_tools_make_a_list() {
    let layout = PackLayout::new(390.0, 844.0, 12, 3);
    assert_eq!(layout.slots.len(), 12);
    assert_eq!(layout.tool_rows.len(), 3);
    assert!(layout.slots[1].x > layout.slots[0].x);
    assert_eq!(layout.slots[1].y, layout.slots[0].y);
    assert!(layout.tool_rows[1].y > layout.tool_rows[0].y);
}

#[test]
fn the_panel_keeps_its_height_when_the_tab_changes() {
    // With few slots and many tools the list sets the height, and the other way round.
    let tall_list = PackLayout::new(390.0, 844.0, 4, 8);
    assert!(tall_list.panel.bottom() >= tall_list.tool_rows.last().unwrap().bottom());
    let tall_grid = PackLayout::new(390.0, 844.0, 24, 1);
    assert!(tall_grid.panel.bottom() >= tall_grid.slots.last().unwrap().bottom());
}

#[test]
fn points_land_on_what_is_under_them() {
    let layout = PackLayout::new(390.0, 844.0, 12, 4);
    let at = |rect: Rect| rect.center();
    assert_eq!(
        layout.hit(at(layout.items).x, at(layout.items).y),
        PackHit::Tab(PackTab::Items)
    );
    assert_eq!(
        layout.hit(at(layout.tools).x, at(layout.tools).y),
        PackHit::Tab(PackTab::Tools)
    );
    assert_eq!(
        layout.hit(at(layout.close).x, at(layout.close).y),
        PackHit::Close
    );
    let slot = at(layout.slots[0]);
    assert_eq!(layout.hit(slot.x, slot.y), PackHit::Panel);
    assert_eq!(layout.hit(2.0, 2.0), PackHit::Outside);
}
