use super::*;
use iso::testbed::{ScenePhase, parse_scene, player_of};

fn scene(json: &str) -> Scene {
    parse_scene(json).expect("the scene parses")
}

fn run(json: &str) -> ScriptRun {
    ScriptRun::new(&scene(json), PathBuf::from("shots"))
}

#[test]
fn every_phase_has_the_name_a_scene_calls_it_by() {
    assert_eq!(phase_name(BakePhase::Dawn), "dawn");
    assert_eq!(phase_name(BakePhase::Day), "day");
    assert_eq!(phase_name(BakePhase::Sunset), "sunset");
    assert_eq!(phase_name(BakePhase::Night), "night");
    assert_eq!(phase_name(ScenePhase::Night.bake()), "night");
}

#[test]
fn a_finished_run_reports_every_step_it_took() {
    let mut run = run(r#"{"steps": ["jump", {"shot": "a.png"}]}"#);

    run.frame(true);
    let last = run.frame(true);
    run.wrote("a.png");
    assert!(!last.done);
    assert!(run.frame(true).done);

    let report = run.report(Some(player_of(1.0, 2.0, 0.0)), Vec::new(), BakePhase::Day);

    assert_eq!(report.frames, 2);
    assert_eq!(report.steps, 2);
    assert_eq!(report.steps_taken, 2);
    assert_eq!(report.shots, vec!["a.png".to_owned()]);
    assert_eq!(report.phase, "day");
    assert!(report.notes.is_empty(), "{:?}", report.notes);
}

#[test]
fn a_run_that_stopped_early_says_which_step_it_was_on() {
    let mut run = ScriptRun::new(
        &scene(r#"{"steps": [{"wait": {"frames": 10}}, {"shot": "a.png"}]}"#),
        PathBuf::from("shots"),
    );
    for _ in 0..3 {
        run.frame(true);
    }

    let report = run.report(None, Vec::new(), BakePhase::Dawn);

    assert_eq!(report.steps_taken, 0);
    assert!(
        report.notes.iter().any(|note| note.contains("step 1 of 2")),
        "{:?}",
        report.notes
    );
}

#[test]
fn the_budget_the_script_ran_out_of_reaches_the_report() {
    let mut run = ScriptRun::new(
        &scene(r#"{"steps": ["settle"], "maxFrames": 1}"#),
        PathBuf::from("shots"),
    );

    run.frame(false);
    let stopped = run.frame(false);

    assert!(stopped.done);
    let report = run.report(None, Vec::new(), BakePhase::Day);
    assert!(
        report.notes.iter().any(|note| note.contains("budget")),
        "{:?}",
        report.notes
    );
}

#[test]
fn a_note_the_client_adds_reaches_the_report() {
    let mut run = run("{}");

    run.note("the atlas has no tree".to_owned());

    let report = run.report(None, Vec::new(), BakePhase::Day);
    assert_eq!(
        report.notes.first().map(String::as_str),
        Some("the atlas has no tree")
    );
}

#[test]
fn a_run_keeps_the_shots_it_wrote_in_order() {
    let mut run = run("{}");

    run.wrote("a.png");
    run.wrote("b.png");

    let report = run.report(None, Vec::new(), BakePhase::Day);
    assert_eq!(report.shots, ["a.png".to_owned(), "b.png".to_owned()]);
}

#[test]
fn a_runs_output_is_where_it_was_told_to_write() {
    let run = ScriptRun::new(&scene("{}"), PathBuf::from("scenes/shots"));

    assert_eq!(run.out(), Path::new("scenes/shots"));
}

#[test]
fn the_summary_says_what_happened_in_one_line() {
    let report = Report {
        frames: 42,
        steps_taken: 3,
        steps: 4,
        shots: vec!["a.png".to_owned()],
        phase: "dawn".to_owned(),
        player: None,
        entities: Vec::new(),
        notes: vec!["a note".to_owned()],
    };

    let line = summary(&report);

    assert_eq!(
        line,
        "scene: 3 of 4 steps in 42 frames, 1 shot(s), 1 note(s)"
    );
}

#[test]
fn the_shots_a_scene_asks_for_are_known_before_it_runs() {
    let asked = shots_asked(&scene(
        r#"{"steps": [{"shot": "a.png"}, "jump", {"shot": "b.png"}]}"#,
    ));

    assert_eq!(asked, vec!["a.png".to_owned(), "b.png".to_owned()]);
}
