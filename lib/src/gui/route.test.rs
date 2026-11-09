use super::*;

#[test]
fn the_playground_route_shows_the_overlay() {
    assert!(overlay_for_path("/playground"));
}

#[test]
fn a_trailing_slash_is_the_same_route() {
    assert!(overlay_for_path("/playground/"));
}

#[test]
fn the_initial_route_shows_no_overlay() {
    assert!(!overlay_for_path("/"));
    assert!(!overlay_for_path(""));
}

#[test]
fn no_other_route_shows_the_overlay() {
    assert!(!overlay_for_path("/playground/extra"));
    assert!(!overlay_for_path("/playgrounds"));
    assert!(!overlay_for_path("/Playground"));
    assert!(!overlay_for_path("/playgroundx/"));
    assert!(!overlay_for_path("/save"));
}
