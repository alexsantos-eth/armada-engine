use super::*;

fn input() -> PlayerFrameInput {
    PlayerFrameInput {
        walk_frames: 4,
        walk_stride: 2.0,
        climb_frames: Some(4),
        idle: Some((4, 2000.0)),
        jump_pose: Some(2),
        climbing: None,
        walking: false,
        flying: false,
        walked: 0.0,
        stood_ms: 500.0,
        air_pose: Some(3),
        swim: None,
        flip: None,
    }
}

/// The swim sheet of the Macroquad client: treading water, eight crawl poses and the dive.
fn swimming(under: bool, moving: bool, swum: f64) -> SwimInput {
    SwimInput {
        columns: 10,
        under,
        moving,
        swum,
        stride: 0.75,
    }
}

#[test]
fn a_swim_wins_over_every_other_sheet() {
    let frame = select_player_frame(PlayerFrameInput {
        climbing: Some(0.5),
        jump_pose: Some(2),
        walking: true,
        swim: Some(swimming(false, true, 0.0)),
        ..input()
    });
    assert_eq!(frame.sheet, PlayerSheet::Swim);
}

#[test]
fn a_still_swimmer_treads_water_and_a_moving_one_strokes() {
    let still = select_player_frame(PlayerFrameInput {
        swim: Some(swimming(false, false, 3.0)),
        ..input()
    });
    assert_eq!(still.pose, SWIM_FLOAT_POSE);
    let moving = select_player_frame(PlayerFrameInput {
        swim: Some(swimming(false, true, 0.0)),
        ..input()
    });
    assert_eq!(moving.pose, 1);
}

#[test]
fn a_submerged_swimmer_is_drawn_with_the_last_column() {
    let frame = select_player_frame(PlayerFrameInput {
        swim: Some(swimming(true, true, 2.0)),
        ..input()
    });
    assert_eq!(frame.pose, 9);
}

#[test]
fn the_crawl_cycles_through_the_columns_between_the_two_ends() {
    let poses: Vec<i32> = (0..8)
        .map(|step| {
            select_player_frame(PlayerFrameInput {
                swim: Some(swimming(false, true, f64::from(step) * 0.75 / 8.0)),
                ..input()
            })
            .pose
        })
        .collect();
    assert_eq!(poses, vec![1, 2, 3, 4, 5, 6, 7, 8]);
    let wrapped = select_player_frame(PlayerFrameInput {
        swim: Some(swimming(false, true, 0.75)),
        ..input()
    });
    assert_eq!(wrapped.pose, 1, "the cycle comes back round");
}

#[test]
fn prioritizes_climb_then_jump_then_idle() {
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            climbing: Some(0.5),
            walking: true,
            flying: true,
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Climb,
            pose: 2
        }
    );
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            walking: true,
            flying: true,
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Jump,
            pose: 2
        }
    );
    assert_eq!(
        select_player_frame(input()),
        PlayerFrame {
            sheet: PlayerSheet::Jump,
            pose: 2
        }
    );
}

#[test]
fn falls_back_to_idle_or_walk_when_special_sheets_are_missing() {
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            jump_pose: None,
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Idle,
            pose: 1
        }
    );
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            climb_frames: None,
            climbing: Some(0.5),
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Walk,
            pose: 0
        }
    );
}

#[test]
fn a_somersault_in_the_air_is_drawn_from_the_flip_sheet() {
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            flip: Some(FlipInput {
                columns: 12,
                turned: 0.25
            }),
            ..input()
        }),
        PlayerFrame {
            sheet: PlayerSheet::Flip,
            pose: 3
        }
    );
}

#[test]
fn a_climb_still_wins_over_a_somersault() {
    assert_eq!(
        select_player_frame(PlayerFrameInput {
            flip: Some(FlipInput {
                columns: 12,
                turned: 0.25
            }),
            climbing: Some(0.5),
            ..input()
        })
        .sheet,
        PlayerSheet::Climb
    );
}
