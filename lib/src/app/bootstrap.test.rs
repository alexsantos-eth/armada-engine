use super::*;

#[test]
fn the_window_is_titled_after_the_game() {
    assert_eq!(window_conf().window_title, GAME_TITLE);
}

#[test]
fn the_window_opens_at_the_default_size() {
    let conf = window_conf();

    assert_eq!(conf.window_width, 960);
    assert_eq!(conf.window_height, 600);
}

#[test]
fn the_window_defers_its_icon_to_the_bundle() {
    assert!(window_conf().icon.is_none());
}
