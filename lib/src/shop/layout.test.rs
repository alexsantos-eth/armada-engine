//! Tests for where the shop sits on a screen.

use super::*;
use macroquad::math::vec2;

#[test]
fn the_panel_is_centred_and_inside_the_screen() {
    for (w, h) in [(1280.0, 800.0), (844.0, 390.0), (360.0, 640.0)] {
        let layout = ShopLayout::new(w, h, 8, 0);
        let panel = layout.panel;
        assert!(panel.x >= 0.0 && panel.y >= 0.0, "{w}x{h}");
        assert!(panel.x + panel.w <= w && panel.y + panel.h <= h, "{w}x{h}");
        assert!((panel.x + panel.w / 2.0 - w / 2.0).abs() < 0.5);
        assert!(layout.rows.iter().all(|row| panel.contains(row.point())));
        assert!(
            layout
                .rows
                .iter()
                .all(|row| row.y + row.h <= panel.y + panel.h)
        );
    }
}

#[test]
fn a_short_screen_shows_fewer_rows_and_scrolls_with_the_cursor() {
    let tall = ShopLayout::new(1280.0, 800.0, 10, 0);
    let short = ShopLayout::new(844.0, 390.0, 10, 0);
    assert!(short.rows.len() < tall.rows.len());
    let shown = short.rows.len();
    assert_eq!(short.first, 0);
    let deep = ShopLayout::new(844.0, 390.0, 10, 7);
    assert_eq!(
        deep.first + shown - 1,
        7,
        "the cursor is the last row shown"
    );
}

#[test]
fn the_tabs_and_the_close_button_do_not_overlap() {
    let layout = ShopLayout::new(1280.0, 800.0, 3, 0);
    assert!(layout.sell.intersect(layout.buy).is_none());
    assert!(layout.buy.intersect(layout.close).is_none());
    let narrow = ShopLayout::new(320.0, 640.0, 3, 0);
    assert!(narrow.buy.intersect(narrow.close).is_none());
}

#[test]
fn a_point_is_over_what_it_is_over() {
    let layout = ShopLayout::new(1280.0, 800.0, 2, 0);
    let centre = |rect: Rect| (rect.x + rect.w / 2.0, rect.y + rect.h / 2.0);
    let (x, y) = centre(layout.buy);
    assert_eq!(layout.hit(x, y, 2), Hit::Tab(Tab::Buy));
    let (x, y) = centre(layout.sell);
    assert_eq!(layout.hit(x, y, 2), Hit::Tab(Tab::Sell));
    let (x, y) = centre(layout.close);
    assert_eq!(layout.hit(x, y, 2), Hit::Close);
    let (x, y) = centre(layout.rows[1]);
    assert_eq!(layout.hit(x, y, 2), Hit::Row(1));
    assert_eq!(
        layout.hit(x, y, 1),
        Hit::Panel,
        "no such row in a list of one"
    );
    assert_eq!(layout.hit(2.0, 2.0, 2), Hit::Outside);
}

#[test]
fn the_prompt_sits_centred_above_the_bottom_row() {
    let rect = prompt_rect(1000.0, 700.0, 200.0);
    assert!((rect.x + rect.w / 2.0 - 500.0).abs() < 0.5);
    assert!(rect.contains(vec2(500.0, rect.y + 5.0)));
    assert!(rect.y + rect.h < 700.0 - 100.0);
}
