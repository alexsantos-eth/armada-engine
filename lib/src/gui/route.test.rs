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
fn the_native_route_is_plain_unless_an_argument_asks_otherwise() {
    assert_eq!(native_route(["iso-core".to_owned()].iter()), Route::Plain);
    assert_eq!(
        native_route(["iso-core".to_owned(), "--playground".to_owned()].iter()),
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
    assert_eq!(native_route(arguments.iter()), Route::Plain);
}

#[test]
fn a_native_run_given_a_scene_is_a_scripted_run() {
    let arguments = [
        "iso-core".to_owned(),
        "--scene".to_owned(),
        "scene.json".to_owned(),
    ];

    assert_eq!(native_route(arguments.iter()), Route::Script);
}

#[test]
fn a_scene_joined_by_an_equals_sign_is_a_scripted_run_too() {
    let arguments = ["iso-core".to_owned(), "--scene=scene.json".to_owned()];

    assert_eq!(native_route(arguments.iter()), Route::Script);
}

#[test]
fn a_scripted_run_paints_no_overlay_and_keeps_no_save() {
    assert!(!Route::Script.shows_overlay());
    assert!(!Route::Script.keeps_the_save());
    assert!(!Route::Script.edits_the_world());
}

#[test]
fn only_the_played_routes_keep_the_players_save() {
    assert!(Route::Plain.keeps_the_save());
    assert!(Route::Playground.keeps_the_save());
    assert!(!Route::Maker.keeps_the_save());
}

#[test]
fn only_the_player_routes_toggle_the_overlay() {
    assert!(Route::Plain.toggles_overlay());
    assert!(Route::Playground.toggles_overlay());
    assert!(!Route::Maker.toggles_overlay());
    assert!(!Route::Script.toggles_overlay());
}
