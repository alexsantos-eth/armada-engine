use super::*;

#[test]
fn a_scene_with_nothing_in_it_opens_the_streamed_world_and_takes_one_shot() {
    let scene = parse_scene("{}").expect("an empty object is a scene");

    assert_eq!(scene.world, SceneWorld::Procedural);
    assert_eq!(scene.seed, None);
    assert_eq!(scene.out, "shots");
    assert_eq!(scene.max_frames, DEFAULT_MAX_FRAMES);
    assert_eq!(scene.steps, default_steps());
}

#[test]
fn a_blank_world_is_named_in_lowercase() {
    let scene = parse_scene(r#"{"world": "blank"}"#).expect("blank is a world");

    assert_eq!(scene.world, SceneWorld::Blank);
}

#[test]
fn every_phase_of_the_day_names_its_bake() {
    let scene = parse_scene(r#"{"phase": "sunset"}"#)
        .expect("sunset is a phase")
        .phase;

    assert_eq!(scene, Some(ScenePhase::Sunset));
    assert_eq!(ScenePhase::Dawn.bake(), BakePhase::Dawn);
    assert_eq!(ScenePhase::Day.bake(), BakePhase::Day);
    assert_eq!(ScenePhase::Sunset.bake(), BakePhase::Sunset);
    assert_eq!(ScenePhase::Night.bake(), BakePhase::Night);
}

#[test]
fn the_edits_read_as_the_brushs_own_tools() {
    let scene = parse_scene(
        r#"{"edits": [
            {"raise": {"at": [1, 2], "times": 3}},
            {"lower": {"at": [1, 3]}},
            {"surface": {"at": [2, 2], "material": "sand"}},
            {"tint": {"at": [2, 3], "zone": 1}},
            {"top": {"at": [2, 4], "variant": 2}},
            {"place": {"at": [3, 3], "blueprint": "tree", "turned": true}},
            {"erase": {"at": [4, 4]}}
        ]}"#,
    )
    .expect("the seven tools parse");

    assert_eq!(
        scene.edits,
        vec![
            SceneEdit::Raise {
                at: [1, 2],
                times: 3
            },
            SceneEdit::Lower {
                at: [1, 3],
                times: 1
            },
            SceneEdit::Surface {
                at: [2, 2],
                material: TerrainMaterial::Sand
            },
            SceneEdit::Tint {
                at: [2, 3],
                zone: 1
            },
            SceneEdit::Top {
                at: [2, 4],
                variant: Some(2)
            },
            SceneEdit::Place {
                at: [3, 3],
                blueprint: "tree".to_owned(),
                turned: true
            },
            SceneEdit::Erase { at: [4, 4] },
        ]
    );
}

#[test]
fn an_edit_answers_its_cell_and_how_many_strokes_it_takes() {
    let raise = SceneEdit::Raise {
        at: [5, 6],
        times: 4,
    };
    let erase = SceneEdit::Erase { at: [7, 8] };

    assert_eq!(raise.at(), [5, 6]);
    assert_eq!(raise.times(), 4);
    assert_eq!(erase.at(), [7, 8]);
    assert_eq!(erase.times(), 1);
}

#[test]
fn a_top_without_a_variant_leaves_the_plain_block() {
    let scene =
        parse_scene(r#"{"edits": [{"top": {"at": [0, 0]}}]}"#).expect("variant is optional");

    assert_eq!(
        scene.edits,
        vec![SceneEdit::Top {
            at: [0, 0],
            variant: None
        }]
    );
}

#[test]
fn the_steps_read_as_words_where_they_carry_nothing() {
    let scene = parse_scene(
        r#"{"steps": [
            "settle",
            "jump",
            "jetpack",
            {"wait": {"frames": 5}},
            {"gather": {"frames": 30}},
            {"walk": {"dir": [1, 0], "frames": 40, "run": true}},
            {"teleport": [8, 9]},
            {"phase": "night"},
            {"edit": {"erase": {"at": [1, 1]}}},
            {"shot": "antes.png"}
        ]}"#,
    )
    .expect("every step parses");

    assert_eq!(
        scene.steps,
        vec![
            SceneStep::Settle,
            SceneStep::Jump,
            SceneStep::Jetpack,
            SceneStep::Wait { frames: 5 },
            SceneStep::Gather { frames: 30 },
            SceneStep::Walk {
                dir: [1.0, 0.0],
                frames: 40,
                run: true
            },
            SceneStep::Teleport([8, 9]),
            SceneStep::Phase(ScenePhase::Night),
            SceneStep::Edit(SceneEdit::Erase { at: [1, 1] }),
            SceneStep::Shot("antes.png".to_owned()),
        ]
    );
}

#[test]
fn only_the_steps_that_let_time_pass_or_capture_end_their_frame() {
    assert!(SceneStep::Jump.ends_the_frame());
    assert!(SceneStep::Jetpack.ends_the_frame());
    assert!(SceneStep::Gather { frames: 1 }.ends_the_frame());
    assert!(SceneStep::Wait { frames: 1 }.ends_the_frame());
    assert!(
        SceneStep::Walk {
            dir: [1.0, 0.0],
            frames: 1,
            run: false
        }
        .ends_the_frame()
    );
    assert!(SceneStep::Shot("a.png".to_owned()).ends_the_frame());
    assert!(!SceneStep::Settle.ends_the_frame());
    assert!(!SceneStep::Teleport([0, 0]).ends_the_frame());
    assert!(!SceneStep::Phase(ScenePhase::Day).ends_the_frame());
    assert!(!SceneStep::Edit(SceneEdit::Erase { at: [0, 0] }).ends_the_frame());
}

#[test]
fn a_shot_has_to_be_a_plain_png_name() {
    assert!(is_shot_name("antes.png"));
    assert!(is_shot_name("a-b_c.1.png"));
    assert!(!is_shot_name(".png"));
    assert!(!is_shot_name(""));
    assert!(!is_shot_name("antes.jpg"));
    assert!(!is_shot_name("shots/antes.png"));
    assert!(!is_shot_name("shots\\antes.png"));
    assert!(!is_shot_name("../antes.png"));
}

#[test]
fn a_shot_that_is_not_a_plain_png_name_is_refused_before_any_frame() {
    let refused = parse_scene(r#"{"steps": [{"shot": "../escape.png"}]}"#)
        .expect_err("an escaping name is refused");

    assert!(refused.contains("escape.png"), "{refused}");
}

#[test]
fn an_edit_that_repeats_zero_times_is_refused() {
    let refused = parse_scene(r#"{"edits": [{"raise": {"at": [1, 1], "times": 0}}]}"#)
        .expect_err("zero strokes is refused");

    assert!(refused.contains("zero times"), "{refused}");
}

#[test]
fn a_run_of_no_frames_is_refused() {
    let refused =
        parse_scene(r#"{"maxFrames": 0}"#).expect_err("a run has to have at least one frame");

    assert!(refused.contains("maxFrames"), "{refused}");
}

#[test]
fn a_field_the_scene_does_not_have_is_refused_instead_of_ignored() {
    let refused = parse_scene(r#"{"wrold": "blank"}"#).expect_err("a typo is refused");

    assert!(refused.contains("wrold"), "{refused}");
}

#[test]
fn a_scene_reads_its_window_zoom_centre_and_output() {
    let scene = parse_scene(
        r#"{"window": [1280, 720], "zoom": 1.5, "centre": [-120, -72],
            "seed": 7, "player": [1, 2], "out": "capturas", "maxFrames": 120}"#,
    )
    .expect("the whole header parses");

    assert_eq!(scene.window, Some([1280, 720]));
    assert_eq!(scene.zoom, Some(1.5));
    assert_eq!(scene.centre, Some([-120, -72]));
    assert_eq!(scene.seed, Some(7));
    assert_eq!(scene.player, Some([1, 2]));
    assert_eq!(scene.out, "capturas");
    assert_eq!(scene.max_frames, 120);
}

#[test]
fn a_scene_can_carry_items_hold_coins_and_visit_the_shop() {
    let scene = parse_scene(
        r#"{
            "carry": [{ "item": "wood", "amount": 9 }],
            "wallet": 40,
            "steps": [{ "trade": "open" }, { "trade": "confirm" }, { "shot": "a.png" }]
        }"#,
    )
    .unwrap();
    assert_eq!(scene.wallet, 40);
    assert_eq!(scene.carry[0].item, "wood");
    assert_eq!(scene.steps[0], SceneStep::Trade(SceneTrade::Open));
    assert!(!SceneStep::Trade(SceneTrade::Close).ends_the_frame());
    assert!(parse_scene(r#"{ "steps": [{ "trade": "haggle" }] }"#).is_err());
}

#[test]
fn a_scene_can_hold_a_phone_and_open_its_inventory_panel() {
    use crate::testbed::scene::ScenePack;
    let scene = parse_scene(
        r#"{ "touch": true, "steps": [{ "pack": "open" }, { "pack": "tools" }, { "shot": "a.png" }] }"#,
    )
    .unwrap();
    assert!(scene.touch);
    assert_eq!(scene.steps[0], SceneStep::Pack(ScenePack::Open));
    assert_eq!(scene.steps[1], SceneStep::Pack(ScenePack::Tools));
    assert!(!SceneStep::Pack(ScenePack::Close).ends_the_frame());
    assert!(!parse_scene("{}").unwrap().touch);
    assert!(parse_scene(r#"{ "steps": [{ "pack": "shake" }] }"#).is_err());
}
