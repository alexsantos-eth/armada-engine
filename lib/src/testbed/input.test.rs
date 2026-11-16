use super::*;
use iso::projection::GridPoint;

#[test]
fn a_scripted_frame_is_handed_over_as_it_was_decided() {
    let decided = NormalizedInput {
        walk: GridPoint { x: 1.0, y: 0.0 },
        jump_pressed: true,
        jump_held: true,
        run: true,
        jetpack_pressed: false,
    };
    let mut input = ScriptInput { frame: decided };

    assert_eq!(input.poll(), decided);
}

#[test]
fn polling_twice_in_one_frame_gives_the_same_input() {
    let mut input = ScriptInput {
        frame: NormalizedInput {
            jump_pressed: true,
            ..NormalizedInput::default()
        },
    };

    let first = input.poll();
    let second = input.poll();

    assert_eq!(first, second);
}
