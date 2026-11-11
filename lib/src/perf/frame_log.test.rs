use super::{DROPPED_FRAME_MS, FrameSample, PerfLog, percentile};

fn frame(frame_ms: f64) -> FrameSample {
    FrameSample {
        frame_ms,
        simulation_ms: frame_ms * 0.1,
        scene_ms: frame_ms * 0.2,
        draw_ms: frame_ms * 0.05,
        stream_ms: frame_ms * 0.3,
        bake_ms: frame_ms * 0.4,
        sprites: 100,
        chunks: 9,
        chunks_alive: 25,
    }
}

#[test]
fn percentiles_pick_the_ranked_value() {
    let values: Vec<f64> = (0..=100).map(f64::from).collect();
    assert_eq!(percentile(&values, 0.0), 0.0);
    assert_eq!(percentile(&values, 0.5), 50.0);
    assert_eq!(percentile(&values, 0.95), 95.0);
    assert_eq!(percentile(&values, 1.0), 100.0);
    assert_eq!(percentile(&[], 0.5), 0.0, "an empty window reports zero");
    assert_eq!(percentile(&[7.0], 0.95), 7.0);
}

/// The window keeps the last frames and forgets the rest, so a stutter minutes ago does not
#[test]
fn the_window_holds_only_the_last_frames() {
    let mut log = PerfLog::new(4);
    for ms in [100.0, 16.0, 16.0, 16.0, 16.0] {
        log.push(frame(ms));
    }
    assert_eq!(log.len(), 4);
    assert_eq!(log.worst().frame_ms, 16.0);
    assert_eq!(log.dropped(), 0);
}

#[test]
fn reports_percentiles_the_worst_frame_and_dropped_frames() {
    let mut log = PerfLog::new(100);
    for _ in 0..95 {
        log.push(frame(16.0));
    }
    for _ in 0..5 {
        log.push(frame(50.0));
    }
    let (p50, p95, max) = log.frame_ms();
    assert_eq!(p50, 16.0);
    assert_eq!(max, 50.0);
    assert!((16.0..=50.0).contains(&p95), "p95 was {p95}");
    assert_eq!(log.dropped(), 5, "frames over {DROPPED_FRAME_MS} ms");
    assert_eq!(log.worst().frame_ms, 50.0);
    assert!(
        (log.span_seconds() - 1.77).abs() < 0.001,
        "{}",
        log.span_seconds()
    );
}

/// The CPU figure is this loop's own work. When it is far below the frame time, the frame was
#[test]
fn cpu_time_is_the_sum_of_the_phases() {
    let mut log = PerfLog::new(10);
    log.push(FrameSample {
        frame_ms: 16.7,
        simulation_ms: 0.5,
        scene_ms: 2.0,
        draw_ms: 1.0,
        stream_ms: 0.2,
        bake_ms: 0.2,
        sprites: 640,
        chunks: 9,
        chunks_alive: 25,
    });
    assert_eq!(log.cpu_ms(), (3.5, 3.5, 3.5));
    assert!(log.worst().cpu_ms() < log.worst().frame_ms);
}

#[test]
fn cpu_drops_count_frames_that_spent_a_refresh_on_this_loops_own_work() {
    let mut log = PerfLog::new(10);
    for _ in 0..3 {
        log.push(FrameSample {
            frame_ms: 45.0,
            simulation_ms: 1.0,
            scene_ms: 2.0,
            draw_ms: 1.0,
            stream_ms: 0.0,
            bake_ms: 0.0,
            sprites: 10,
            chunks: 1,
            chunks_alive: 2,
        });
    }
    assert_eq!(log.dropped(), 3, "the browser made those frames long");
    assert_eq!(log.cpu_dropped(), 0, "this loop spent 4 ms on them");

    log.push(FrameSample {
        frame_ms: 45.0,
        simulation_ms: 9.0,
        scene_ms: 9.0,
        draw_ms: 2.0,
        stream_ms: 0.0,
        bake_ms: 0.0,
        sprites: 10,
        chunks: 1,
        chunks_alive: 2,
    });
    assert_eq!(log.dropped(), 4);
    assert_eq!(log.cpu_dropped(), 1);
}

#[test]
fn an_empty_log_summarizes_without_dividing_by_zero() {
    let log = PerfLog::new(10);
    assert!(log.is_empty());
    assert_eq!(log.frame_ms(), (0.0, 0.0, 0.0));
    assert_eq!(log.span_seconds(), 0.0);
    assert!(log.summary().contains("sin fotogramas"));
}

#[test]
fn the_fps_readout_is_the_window_average_not_one_frame() {
    let log = PerfLog::new(10);
    assert_eq!(log.fps(), 0.0, "an empty window reports zero, not a divide");
    let mut log = PerfLog::new(10);
    for _ in 0..9 {
        log.push(frame(16.0));
    }
    log.push(frame(50.0));
    let fps = log.fps();
    let expected = 10.0 / ((9.0 * 16.0 + 50.0) / 1000.0);
    assert!((fps - expected).abs() < 0.001, "fps was {fps}");
    assert!(
        (50.0..61.0).contains(&fps),
        "one stuttering frame barely moves it"
    );
}

#[test]
fn the_summary_carries_every_figure_it_claims_to() {
    let mut log = PerfLog::new(10);
    for _ in 0..10 {
        log.push(frame(16.0));
    }
    let summary = log.summary();
    for expected in [
        "iso perf",
        "10 frames",
        "chunks 9 dibujados · 25 en memoria",
        "frame ms p50 16.0",
        "sprites avg 100",
        "cpu split avg",
        "stream",
        "bake",
        "peor frame 16.0 ms",
    ] {
        assert!(
            summary.contains(expected),
            "missing {expected:?} in:\n{summary}"
        );
    }
}
