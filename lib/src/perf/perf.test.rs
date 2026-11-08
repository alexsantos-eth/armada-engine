use super::{DROPPED_FRAME_MS, FrameSample, PerfLog, percentile};

fn frame(frame_ms: f64) -> FrameSample {
    FrameSample {
        frame_ms,
        simulation_ms: frame_ms * 0.1,
        scene_ms: frame_ms * 0.2,
        draw_ms: frame_ms * 0.05,
        sprites: 100,
        chunks: 9,
        chunks_alive: 25,
    }
}

#[test]
fn percentiles_pick_the_ranked_value() {
    // 101 values so each percentile lands on a value rather than between two.
    let values: Vec<f64> = (0..=100).map(f64::from).collect();
    assert_eq!(percentile(&values, 0.0), 0.0);
    assert_eq!(percentile(&values, 0.5), 50.0);
    assert_eq!(percentile(&values, 0.95), 95.0);
    assert_eq!(percentile(&values, 1.0), 100.0);
    assert_eq!(percentile(&[], 0.5), 0.0, "an empty window reports zero");
    assert_eq!(percentile(&[7.0], 0.95), 7.0);
}

/// The window keeps the last frames and forgets the rest, so a stutter minutes ago does not
/// still colour the reading.
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
    // The span comes from the frames themselves: 95 * 16 + 5 * 50 ms.
    assert!(
        (log.span_seconds() - 1.77).abs() < 0.001,
        "{}",
        log.span_seconds()
    );
}

/// The CPU figure is this loop's own work. When it is far below the frame time, the frame was
/// waiting on something else, and that is the whole reason the two are reported apart.
#[test]
fn cpu_time_is_the_sum_of_the_phases() {
    let mut log = PerfLog::new(10);
    log.push(FrameSample {
        frame_ms: 16.7,
        simulation_ms: 0.5,
        scene_ms: 2.0,
        draw_ms: 1.0,
        sprites: 640,
        chunks: 9,
        chunks_alive: 25,
    });
    assert_eq!(log.cpu_ms(), (3.5, 3.5, 3.5));
    assert!(log.worst().cpu_ms() < log.worst().frame_ms);
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
fn the_summary_carries_every_figure_it_claims_to() {
    let mut log = PerfLog::new(10);
    for _ in 0..10 {
        log.push(frame(16.0));
    }
    let summary = log.summary();
    for expected in [
        "Armada perf",
        "10 frames",
        "chunks 9 dibujados · 25 en memoria",
        "frame ms p50 16.0",
        "sprites avg 100",
        "cpu split avg",
        "peor frame 16.0 ms",
    ] {
        assert!(
            summary.contains(expected),
            "missing {expected:?} in:\n{summary}"
        );
    }
}
