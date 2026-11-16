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

#[test]
fn a_scene_opens_the_window_at_the_size_it_asks_for() {
    assert_eq!(window_size(Some([1280, 720])), (1280, 720));
}

#[test]
fn a_scene_with_no_window_opens_the_default_one() {
    assert_eq!(window_size(None), DEFAULT_WINDOW);
}

#[test]
fn a_window_size_that_is_no_window_falls_back_to_the_default() {
    assert_eq!(window_size(Some([0, 600])), DEFAULT_WINDOW);
    assert_eq!(window_size(Some([960, 0])), DEFAULT_WINDOW);
    assert_eq!(window_size(Some([u32::MAX, 600])), DEFAULT_WINDOW);
}
