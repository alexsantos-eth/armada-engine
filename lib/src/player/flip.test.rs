use super::*;

fn still(elapsed_ms: f64) -> FlipMoment {
    FlipMoment {
        jumps: 0,
        landings: 0,
        air_jump: false,
        elapsed_ms,
    }
}

fn air_jump() -> FlipMoment {
    FlipMoment {
        jumps: 1,
        landings: 0,
        air_jump: true,
        elapsed_ms: 0.0,
    }
}

fn flying(elapsed_ms: f64) -> FlipMoment {
    FlipMoment {
        jumps: 1,
        landings: 0,
        air_jump: true,
        elapsed_ms,
    }
}

#[test]
fn a_player_that_has_not_jumped_is_not_turning() {
    let mut flip = FlipMotion::default();

    assert_eq!(flip.advance(still(16.0)), None);
}

#[test]
fn a_jump_from_the_ground_does_not_turn_a_somersault() {
    let mut flip = FlipMotion::default();

    let turned = flip.advance(FlipMoment {
        jumps: 1,
        air_jump: false,
        ..still(16.0)
    });

    assert_eq!(turned, None);
}

#[test]
fn a_jump_taken_in_the_air_turns_a_whole_somersault() {
    let mut flip = FlipMotion::default();
    flip.advance(air_jump());

    let quarter = flip.advance(flying(FLIP_MS / 4.0));
    let half = flip.advance(flying(FLIP_MS / 4.0));

    assert!((quarter.unwrap() - 0.25).abs() < 1e-9);
    assert!((half.unwrap() - 0.5).abs() < 1e-9);
}

#[test]
fn the_somersault_ends_when_the_turn_is_whole() {
    let mut flip = FlipMotion::default();
    flip.advance(air_jump());

    let done = flip.advance(flying(FLIP_MS));
    let after = flip.advance(flying(16.0));

    assert_eq!(done, None);
    assert_eq!(after, None);
}

#[test]
fn landing_early_finishes_the_turn_it_had_left() {
    let mut flip = FlipMotion::default();
    flip.advance(air_jump());
    flip.advance(flying(FLIP_MS / 2.0));

    let landed = flip.advance(FlipMoment {
        landings: 1,
        elapsed_ms: FLIP_LANDING_MS / 2.0,
        ..flying(0.0)
    });
    let upright = flip.advance(FlipMoment {
        landings: 1,
        elapsed_ms: FLIP_LANDING_MS / 2.0,
        ..flying(0.0)
    });

    assert!((landed.unwrap() - 0.75).abs() < 1e-9);
    assert_eq!(upright, None);
}

#[test]
fn a_landing_with_no_somersault_in_the_air_changes_nothing() {
    let mut flip = FlipMotion::default();

    let turned = flip.advance(FlipMoment {
        landings: 1,
        ..still(16.0)
    });

    assert_eq!(turned, None);
}

#[test]
fn a_second_air_jump_starts_the_somersault_again() {
    let mut flip = FlipMotion::default();
    flip.advance(air_jump());
    flip.advance(flying(FLIP_MS / 2.0));

    flip.advance(FlipMoment {
        jumps: 2,
        ..air_jump()
    });
    let quarter = flip.advance(FlipMoment {
        jumps: 2,
        ..flying(FLIP_MS / 4.0)
    });

    assert!((quarter.unwrap() - 0.25).abs() < 1e-9);
}

#[test]
fn time_running_backwards_does_not_turn_the_body() {
    let mut flip = FlipMotion::default();
    flip.advance(air_jump());

    let turned = flip.advance(flying(-100.0));

    assert_eq!(turned, Some(0.0));
}
