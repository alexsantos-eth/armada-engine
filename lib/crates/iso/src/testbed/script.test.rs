use super::*;
use crate::projection::GridPoint;
use crate::testbed::scene::{ScenePhase, SceneStep};

/// A run of `steps` with room to spare.
fn script(steps: Vec<SceneStep>) -> Script {
    Script::new(steps, 1000)
}

#[test]
fn a_run_with_no_steps_is_over_on_its_first_frame() {
    let frame = script(Vec::new()).frame(true);

    assert!(frame.done);
    assert_eq!(frame.note, None);
}

#[test]
fn a_walk_holds_its_direction_for_as_many_frames_as_it_asks() {
    let mut run = script(vec![SceneStep::Walk {
        dir: [3.0, 4.0],
        frames: 2,
        run: true,
    }]);

    let first = run.frame(true);
    assert!((first.input.walk.x - 0.6).abs() < 1e-9);
    assert!((first.input.walk.y - 0.8).abs() < 1e-9);
    assert!(first.input.run);
    assert!(!first.done);

    let second = run.frame(true);
    assert!((second.input.walk.x - 0.6).abs() < 1e-9);
    assert!(!second.done);

    assert!(run.frame(true).done);
    assert_eq!(run.frames(), 2);
}

#[test]
fn a_walk_with_no_direction_stands_still() {
    let mut run = script(vec![SceneStep::Walk {
        dir: [0.0, 0.0],
        frames: 1,
        run: false,
    }]);

    let frame = run.frame(true);

    assert_eq!(frame.input.walk.x, 0.0);
    assert_eq!(frame.input.walk.y, 0.0);
}

#[test]
fn a_walk_of_no_frames_is_skipped_rather_than_held_forever() {
    let mut run = script(vec![
        SceneStep::Walk {
            dir: [1.0, 0.0],
            frames: 0,
            run: false,
        },
        SceneStep::Shot("a.png".to_owned()),
    ]);

    let frame = run.frame(true);

    assert_eq!(frame.shots, vec!["a.png".to_owned()]);
}

#[test]
fn a_jump_is_one_frame_of_the_jump_key() {
    let mut run = script(vec![SceneStep::Jump, SceneStep::Jump]);

    let first = run.frame(true);
    assert!(first.input.jump_pressed);
    assert!(first.input.jump_held);

    let second = run.frame(true);
    assert!(second.input.jump_pressed);

    assert!(run.frame(true).done);
    assert_eq!(run.frames(), 2);
}

#[test]
fn the_jetpack_step_presses_the_key_that_straps_it_on() {
    let frame = script(vec![SceneStep::Jetpack]).frame(true);

    assert!(frame.input.jetpack_pressed);
    assert!(!frame.input.jump_pressed);
}

#[test]
fn a_gather_holds_the_gather_key_for_its_frames() {
    let mut run = script(vec![SceneStep::Gather { frames: 2 }]);

    for _ in 0..2 {
        let frame = run.frame(true);
        assert!(frame.input.gather_held);
        assert_eq!(frame.input.walk, GridPoint::default());
    }
    assert!(run.frame(true).done);
}

#[test]
fn a_wait_spends_frames_with_no_input_at_all() {
    let mut run = script(vec![SceneStep::Wait { frames: 3 }]);

    for _ in 0..3 {
        let frame = run.frame(true);
        assert_eq!(frame.input, NormalizedInput::default());
        assert!(!frame.done);
    }

    assert!(run.frame(true).done);
}

#[test]
fn a_settle_holds_the_run_until_the_light_is_up_to_date() {
    let mut run = script(vec![SceneStep::Settle, SceneStep::Shot("a.png".to_owned())]);

    let waiting = run.frame(false);
    assert!(waiting.shots.is_empty());
    assert!(!waiting.done);
    assert_eq!(run.step(), 0);

    let taken = run.frame(true);
    assert_eq!(taken.shots, vec!["a.png".to_owned()]);
}

#[test]
fn the_steps_that_only_change_the_world_are_taken_in_the_same_frame() {
    let mut run = script(vec![
        SceneStep::Phase(ScenePhase::Night),
        SceneStep::Teleport([4, 5]),
        SceneStep::Edit(crate::testbed::scene::SceneEdit::Erase { at: [1, 1] }),
        SceneStep::Wait { frames: 1 },
    ]);

    let frame = run.frame(true);

    assert_eq!(frame.phase, Some(BakePhase::Night));
    assert_eq!(frame.teleport, Some([4, 5]));
    assert_eq!(frame.edits.len(), 1);
    assert_eq!(run.frames(), 1);
}

#[test]
fn a_shot_ends_its_frame_so_nothing_after_it_changes_what_was_captured() {
    let mut run = script(vec![
        SceneStep::Shot("a.png".to_owned()),
        SceneStep::Teleport([9, 9]),
    ]);

    let frame = run.frame(true);

    assert_eq!(frame.shots, vec!["a.png".to_owned()]);
    assert_eq!(frame.teleport, None);
}

#[test]
fn a_run_stops_and_says_so_when_it_reaches_its_frame_budget() {
    let mut run = Script::new(vec![SceneStep::Wait { frames: 10 }], 2);

    assert!(!run.frame(true).done);
    assert!(!run.frame(true).done);
    let stopped = run.frame(true);

    assert!(stopped.done);
    let note = stopped.note.expect("the budget is reported");
    assert!(note.contains("budget of 2 frames"), "{note}");
    assert!(note.contains("step 1 of 1"), "{note}");
}

#[test]
fn a_settle_that_never_lights_up_still_ends_at_the_budget() {
    let mut run = Script::new(vec![SceneStep::Settle], 3);

    for _ in 0..3 {
        assert!(!run.frame(false).done);
    }

    assert!(run.frame(false).done);
}

#[test]
fn a_run_counts_its_steps_and_the_one_it_is_on() {
    let mut run = script(vec![SceneStep::Jump, SceneStep::Jump]);

    assert_eq!(run.steps(), 2);
    assert_eq!(run.step(), 0);
    run.frame(true);
    assert_eq!(run.step(), 1);
}
