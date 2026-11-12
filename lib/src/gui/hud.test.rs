use super::*;

#[test]
fn the_frame_readout_escalates_at_the_budgets() {
    assert_eq!(readout_colour(0.0), LIME);
    assert_eq!(
        readout_colour(20.0),
        LIME,
        "20 ms is still inside one 60 Hz frame"
    );
    assert_eq!(readout_colour(20.1), ORANGE);
    assert_eq!(
        readout_colour(33.4),
        ORANGE,
        "33.4 ms is still at two refreshes"
    );
    assert_eq!(readout_colour(33.5), RED);
    assert_eq!(readout_colour(100.0), RED);
}

#[test]
fn the_help_line_swaps_controls_for_touch() {
    assert!(help_line(false).contains("WASD"));
    assert!(help_line(false).contains("Shift"));
    assert!(!help_line(false).contains("Joystick"));
    assert!(help_line(true).contains("Joystick"));
    assert!(help_line(true).contains("SALTAR"));
    assert!(!help_line(true).contains("Shift"));
}

#[test]
fn the_world_readout_carries_position_elevation_clock_and_cost() {
    let line = world_readout_line(&Readout {
        x: 12.34,
        y: 7.89,
        elevation: 3,
        motion: "Walking E",
        chunks: 5,
        clock: "08:30",
        fps: 60.0,
        frame_ms: 16.7,
    });

    assert!(line.contains("(12.34, 7.89, 3)"));
    assert!(line.contains("Walking E"));
    assert!(line.contains("chunks: 5"));
    assert!(line.contains("08:30"));
    assert!(line.contains("60 fps"));
    assert!(line.contains("16.7 ms"));
}

#[test]
fn phase_button_hit_selects_the_phase_under_a_click() {
    assert_eq!(
        phase_button_hit(PHASE_BUTTON_X + 1.0, PHASE_BUTTON_Y + 1.0),
        Some(BakePhase::Dawn)
    );
    assert_eq!(
        phase_button_hit(
            PHASE_BUTTON_X + 1.0 + PHASE_BUTTON_WIDTH + PHASE_BUTTON_GAP,
            PHASE_BUTTON_Y + 1.0
        ),
        Some(BakePhase::Day)
    );
    assert_eq!(
        phase_button_hit(
            PHASE_BUTTON_X + 1.0 + (PHASE_BUTTON_WIDTH + PHASE_BUTTON_GAP) * 2.0,
            PHASE_BUTTON_Y + 1.0
        ),
        Some(BakePhase::Sunset)
    );
    assert_eq!(
        phase_button_hit(
            PHASE_BUTTON_X + 1.0 + (PHASE_BUTTON_WIDTH + PHASE_BUTTON_GAP) * 3.0,
            PHASE_BUTTON_Y + 1.0
        ),
        Some(BakePhase::Night)
    );
    assert_eq!(phase_button_hit(10.0, PHASE_BUTTON_Y + 1.0), None);
    assert_eq!(phase_button_hit(31.0, PHASE_BUTTON_Y - 1.0), None);
}

#[test]
fn the_help_line_says_which_key_straps_the_jetpack_on() {
    assert!(help_line(false).contains("J: jetpack"));
    assert!(help_line(false).contains("volar"));
}

#[test]
fn the_jetpack_toggle_sits_past_the_last_phase_button() {
    let last =
        PHASE_BUTTON_X + (BAKE_PHASES.len() - 1) as f32 * (PHASE_BUTTON_WIDTH + PHASE_BUTTON_GAP);
    assert!(
        JETPACK_BUTTON_X >= last + PHASE_BUTTON_WIDTH,
        "the toggle never covers a phase button"
    );
    assert!(button_hit(
        JETPACK_BUTTON_X,
        JETPACK_BUTTON_X + 1.0,
        PHASE_BUTTON_Y + 1.0
    ));
    assert!(
        !button_hit(
            JETPACK_BUTTON_X,
            JETPACK_BUTTON_X - 1.0,
            PHASE_BUTTON_Y + 1.0
        ),
        "and nothing outside it is a click on it"
    );
    assert_eq!(
        phase_button_hit(JETPACK_BUTTON_X + 1.0, PHASE_BUTTON_Y + 1.0),
        None
    );
}
