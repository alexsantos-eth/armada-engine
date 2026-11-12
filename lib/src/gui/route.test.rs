use super::*;

#[test]
fn the_playground_route_shows_the_overlay() {
    assert_eq!(route_for_path("/playground"), Route::Playground);
    assert!(Route::Playground.shows_overlay());
    assert!(!Route::Playground.edits_the_world());
}

#[test]
fn a_trailing_slash_is_the_same_route() {
    assert_eq!(route_for_path("/playground/"), Route::Playground);
    assert_eq!(route_for_path("/maker/"), Route::Maker);
}

#[test]
fn the_initial_route_shows_no_overlay() {
    assert_eq!(route_for_path("/"), Route::Plain);
    assert_eq!(route_for_path(""), Route::Plain);
    assert!(!Route::Plain.shows_overlay());
    assert!(!Route::Plain.edits_the_world());
}

#[test]
fn the_maker_route_edits_the_world_with_the_overlay_on() {
    assert_eq!(route_for_path("/maker"), Route::Maker);
    assert!(Route::Maker.shows_overlay());
    assert!(Route::Maker.edits_the_world());
}

#[test]
fn no_other_route_leaves_the_initial_one() {
    for path in [
        "/playground/extra",
        "/playgrounds",
        "/Playground",
        "/playgroundx/",
        "/makers",
        "/maker/extra",
        "/save",
    ] {
        assert_eq!(route_for_path(path), Route::Plain, "{path}");
    }
}

#[test]
fn the_native_route_is_the_playground_unless_an_argument_asks_otherwise() {
    assert_eq!(
        native_route(["iso-core".to_owned()].iter()),
        Route::Playground
    );
    assert_eq!(
        native_route(["iso-core".to_owned(), "--maker".to_owned()].iter()),
        Route::Maker
    );
    assert_eq!(
        native_route(["iso-core".to_owned(), "--plain".to_owned()].iter()),
        Route::Plain
    );
}

#[test]
fn the_last_route_argument_is_the_one_that_counts() {
    let arguments = [
        "iso-core".to_owned(),
        "--plain".to_owned(),
        "--maker".to_owned(),
    ];
    assert_eq!(native_route(arguments.iter()), Route::Maker);
}

#[test]
fn an_argument_that_is_not_a_route_is_ignored() {
    let arguments = ["iso-core".to_owned(), "--whatever".to_owned()];
    assert_eq!(native_route(arguments.iter()), Route::Playground);
}

#[test]
fn only_the_development_surfaces_let_the_jetpack_on() {
    assert!(Route::Playground.allows_jetpack());
    assert!(Route::Maker.allows_jetpack());
    assert!(
        !Route::Plain.allows_jetpack(),
        "the game as it is presented is not flown"
    );
}
