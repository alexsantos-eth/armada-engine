use super::*;

fn marks(
    frame_start: f64,
    after_simulation: f64,
    after_collect: f64,
    after_draw: f64,
) -> FrameMarks {
    FrameMarks {
        frame_start,
        after_simulation,
        after_collect,
        after_draw,
    }
}

#[test]
fn each_section_of_the_frame_costs_the_gap_between_its_marks() {
    let sample = frame_sample(
        16.7,
        marks(100.0, 100.004, 100.009, 100.015),
        1.0,
        2.0,
        42,
        3,
        9,
    );

    assert!((sample.simulation_ms - 4.0).abs() < 1e-9);
    assert!((sample.scene_ms - 5.0).abs() < 1e-9);
    assert!((sample.draw_ms - 6.0).abs() < 1e-9);
    assert!((sample.stream_ms - 1.0).abs() < 1e-9);
    assert!((sample.bake_ms - 2.0).abs() < 1e-9);
    assert_eq!(sample.frame_ms, 16.7);
}

#[test]
fn the_sample_carries_what_the_scene_and_the_world_measured() {
    let sample = frame_sample(16.7, marks(0.0, 0.001, 0.002, 0.003), 0.5, 0.25, 128, 2, 7);

    assert_eq!(sample.sprites, 128);
    assert_eq!(sample.chunks, 2);
    assert_eq!(sample.chunks_alive, 7);
    assert_eq!(
        sample.cpu_ms(),
        sample.simulation_ms + sample.scene_ms + sample.draw_ms
    );
}

#[test]
fn a_frame_where_nothing_happened_costs_nothing() {
    let sample = frame_sample(0.0, marks(5.0, 5.0, 5.0, 5.0), 0.0, 0.0, 0, 0, 0);

    assert_eq!(sample.simulation_ms, 0.0);
    assert_eq!(sample.scene_ms, 0.0);
    assert_eq!(sample.draw_ms, 0.0);
    assert_eq!(sample.stream_ms, 0.0);
    assert_eq!(sample.bake_ms, 0.0);
    assert_eq!(sample.cpu_ms(), 0.0);
}
