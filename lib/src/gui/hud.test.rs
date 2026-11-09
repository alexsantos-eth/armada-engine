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
fn the_world_readout_carries_position_elevation_and_cost() {
    let line = world_readout_line(12.34, 7.89, 3, "Walking E", 5, 60, 16.7);

    assert!(line.contains("(12.34, 7.89, 3)"));
    assert!(line.contains("Walking E"));
    assert!(line.contains("chunks: 5"));
    assert!(line.contains("60 fps"));
    assert!(line.contains("16.7 ms"));
}
