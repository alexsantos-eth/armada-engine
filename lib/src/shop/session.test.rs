//! Tests for what an open shop remembers.

use super::*;

#[test]
fn the_cursor_stays_inside_the_list() {
    let mut shop = Shop::open(Tab::Sell);
    shop.press(ShopKey::Up, 3);
    assert_eq!(shop.cursor, 0);
    shop.press(ShopKey::Down, 3);
    shop.press(ShopKey::Down, 3);
    shop.press(ShopKey::Down, 3);
    assert_eq!(shop.cursor, 2);
    shop.press(ShopKey::Down, 0);
    assert_eq!(shop.cursor, 0, "an empty list has only the top to stand on");
    shop.cursor = 2;
    shop.clamp(1);
    assert_eq!(shop.cursor, 0);
}

#[test]
fn confirm_names_the_row_and_an_empty_list_confirms_nothing() {
    let mut shop = Shop::open(Tab::Buy);
    shop.press(ShopKey::Down, 3);
    assert_eq!(shop.press(ShopKey::Confirm, 3), ShopEvent::Confirm(1));
    assert_eq!(shop.press(ShopKey::Confirm, 0), ShopEvent::None);
}

#[test]
fn another_tab_starts_at_the_top_and_the_same_one_changes_nothing() {
    let mut shop = Shop::open(Tab::Sell);
    shop.press(ShopKey::Down, 4);
    shop.press(ShopKey::Tab(Tab::Sell), 4);
    assert_eq!(shop.cursor, 1);
    shop.press(ShopKey::Tab(Tab::Buy), 4);
    assert_eq!((shop.tab, shop.cursor), (Tab::Buy, 0));
}

#[test]
fn close_asks_to_close() {
    assert_eq!(
        Shop::open(Tab::Sell).press(ShopKey::Close, 1),
        ShopEvent::Close
    );
}

#[test]
fn a_message_fades_after_its_time() {
    let mut shop = Shop::open(Tab::Sell);
    shop.say("hola".to_owned());
    shop.advance(MESSAGE_MS - 1.0);
    assert!(shop.message.is_some());
    shop.advance(2.0);
    assert!(shop.message.is_none());
}
