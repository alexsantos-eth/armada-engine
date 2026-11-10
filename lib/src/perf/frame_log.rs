//! Frame timing log, reported in a stable, self-describing text shape.

use std::collections::VecDeque;

/// Frames kept in the window: five seconds at 60 fps.
pub const WINDOW_FRAMES: usize = 300;

/// Two refreshes of a 60 Hz display. A frame over this dropped one, which is what reads as a
pub const DROPPED_FRAME_MS: f64 = 33.4;

/// One frame's measurements, in milliseconds.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FrameSample {
    /// Whole frame, including waiting for the display.
    pub frame_ms: f64,
    /// Input, the fixed simulation steps, streaming and saving.
    pub simulation_ms: f64,
    /// Culling and building the sprite list.
    pub scene_ms: f64,
    /// Sorting the sprite list and issuing it.
    pub draw_ms: f64,
    /// Sprites queued this frame.
    pub sprites: usize,
    /// Chunks drawn this frame.
    pub chunks: usize,
    /// Chunks held in memory, drawn or not. Reported beside the drawn count because they are
    pub chunks_alive: usize,
}

impl FrameSample {
    /// What this loop spent on the CPU. The rest of `frame_ms` went to the GPU or to waiting
    pub fn cpu_ms(&self) -> f64 {
        self.simulation_ms + self.scene_ms + self.draw_ms
    }
}

/// A rolling window of the last [`WINDOW_FRAMES`] frames.
pub struct PerfLog {
    samples: VecDeque<FrameSample>,
    capacity: usize,
}

impl Default for PerfLog {
    fn default() -> Self {
        Self::new(WINDOW_FRAMES)
    }
}

/// Value at `fraction` of the way through `values` once sorted, nearest rank. `values` is
fn percentile(sorted: &[f64], fraction: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let rank = (fraction * (sorted.len() - 1) as f64).round() as usize;
    sorted[rank.min(sorted.len() - 1)]
}

impl PerfLog {
    pub fn new(capacity: usize) -> Self {
        Self {
            samples: VecDeque::with_capacity(capacity.max(1)),
            capacity: capacity.max(1),
        }
    }

    pub fn push(&mut self, sample: FrameSample) {
        if self.samples.len() == self.capacity {
            self.samples.pop_front();
        }
        self.samples.push_back(sample);
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    /// The display rate the window implies: its frames over its own span. One stuttering frame
    /// barely moves it, which is what a readout steady enough to watch wants.
    pub fn fps(&self) -> f64 {
        let span = self.span_seconds();
        if span > 0.0 {
            self.samples.len() as f64 / span
        } else {
            0.0
        }
    }

    /// Seconds the window covers, taken from the frames themselves rather than a clock, so the
    pub fn span_seconds(&self) -> f64 {
        self.samples.iter().map(|s| s.frame_ms).sum::<f64>() / 1000.0
    }

    /// The frame that took longest, which is the one a stutter is made of.
    pub fn worst(&self) -> FrameSample {
        self.samples
            .iter()
            .copied()
            .max_by(|a, b| a.frame_ms.total_cmp(&b.frame_ms))
            .unwrap_or_default()
    }

    /// Frames that missed two display refreshes.
    pub fn dropped(&self) -> usize {
        self.samples
            .iter()
            .filter(|s| s.frame_ms > DROPPED_FRAME_MS)
            .count()
    }

    fn sorted(&self, of: impl Fn(&FrameSample) -> f64) -> Vec<f64> {
        let mut values: Vec<f64> = self.samples.iter().map(&of).collect();
        values.sort_by(f64::total_cmp);
        values
    }

    /// `(p50, p95, max)` of whole frames, in milliseconds.
    pub fn frame_ms(&self) -> (f64, f64, f64) {
        let values = self.sorted(|s| s.frame_ms);
        (
            percentile(&values, 0.5),
            percentile(&values, 0.95),
            percentile(&values, 1.0),
        )
    }

    /// `(p50, p95, max)` of this loop's own CPU time, in milliseconds.
    pub fn cpu_ms(&self) -> (f64, f64, f64) {
        let values = self.sorted(FrameSample::cpu_ms);
        (
            percentile(&values, 0.5),
            percentile(&values, 0.95),
            percentile(&values, 1.0),
        )
    }

    fn mean(&self, of: impl Fn(&FrameSample) -> f64) -> f64 {
        if self.samples.is_empty() {
            return 0.0;
        }
        self.samples.iter().map(&of).sum::<f64>() / self.samples.len() as f64
    }

    /// The whole report, as lines to print.
    pub fn summary(&self) -> String {
        if self.is_empty() {
            return "iso perf · sin fotogramas todavía".to_owned();
        }
        let span = self.span_seconds();
        let frames = self.len();
        let fps = self.fps();
        let (f50, f95, fmax) = self.frame_ms();
        let (c50, c95, cmax) = self.cpu_ms();
        let worst = self.worst();
        format!(
            "iso perf · {span:.1} s · {frames} frames · {fps:.1} fps · chunks {chunks:.0} dibujados · {alive:.0} en memoria\n\
             frame ms p50 {f50:.1} · p95 {f95:.1} · max {fmax:.1} · over {DROPPED_FRAME_MS} ms: {dropped}\n\
             cpu ms p50 {c50:.1} · p95 {c95:.1} · max {cmax:.1} · sprites avg {sprites:.0} · max {sprites_max}\n\
             cpu split avg: sim {sim:.2} · escena {scene:.2} · dibujo {draw:.2}\n\
             peor frame {worst_ms:.1} ms: sim {wsim:.2} · escena {wscene:.2} · dibujo {wdraw:.2} · sprites {wsprites}",
            chunks = self.mean(|s| s.chunks as f64),
            alive = self.mean(|s| s.chunks_alive as f64),
            dropped = self.dropped(),
            sprites = self.mean(|s| s.sprites as f64),
            sprites_max = self.samples.iter().map(|s| s.sprites).max().unwrap_or(0),
            sim = self.mean(|s| s.simulation_ms),
            scene = self.mean(|s| s.scene_ms),
            draw = self.mean(|s| s.draw_ms),
            worst_ms = worst.frame_ms,
            wsim = worst.simulation_ms,
            wscene = worst.scene_ms,
            wdraw = worst.draw_ms,
            wsprites = worst.sprites,
        )
    }
}

#[cfg(test)]
#[path = "frame_log.test.rs"]
mod tests;
