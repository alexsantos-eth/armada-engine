//! How long the last frame took, measured on the browser's rendering-update timestamp.
//!
//! The web build reads the instant `requestAnimationFrame` hands its callback through the
//! `iso_frame_timestamp` import (the same FFI pattern as `touch::platform`), instead of the
//! wall clock macroquad samples when the frame body starts. The wall clock moves with event
//! dispatch and is quantised to the millisecond, so on iOS Safari a touch turned a steady
//! cadence into a visibly uneven one; the rendering-update timestamp does not move with it.
//! Native builds have no such import and keep using the window's own measurement.
//!
//! On top of that the clock paces what it reports: it learns the delivered cadence, snaps a
//! measurement that is within `SNAP_TOLERANCE` of a whole number of cadences onto it, and
//! spreads a frame the browser deferred over the frames that follow instead of handing the
//! whole gap to the simulation at once.

/// One frame at sixty, for a measurement that is not a duration.
pub(crate) const DEFAULT_FRAME_MS: f64 = 1000.0 / 60.0;
/// The longest frame the clock reports: past it the page was not running.
pub(crate) const MAX_FRAME_MS: f64 = 250.0;
/// How many measurements the cadence is the median of.
const HISTORY_LEN: usize = 11;
/// How far from a whole number of cadences a measurement may be and still snap onto it.
const SNAP_TOLERANCE: f64 = 0.2;
/// The largest number of cadences a measurement is snapped onto.
const MAX_SNAP_MULTIPLE: f64 = 4.0;
/// The share of a cadence a frame may run long or short while paying back a deferred frame.
const CATCH_UP_SHARE: f64 = 0.25;
/// The most time, in cadences, the clock keeps owing before it writes the rest off.
const MAX_DEBT_MULTIPLE: f64 = 2.0;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn iso_frame_timestamp() -> f64;
}

/// The instant the browser gave this rendering update, in seconds, when there is one.
pub(crate) fn frame_timestamp_seconds() -> Option<f64> {
    #[cfg(target_arch = "wasm32")]
    {
        Some(unsafe { iso_frame_timestamp() })
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        None
    }
}

/// A measurement as a duration: anything that is not one becomes a frame at sixty, and
/// anything longer than a quarter second is clamped to it.
fn sanitised_ms(value: f64) -> f64 {
    if !value.is_finite() || value <= 0.0 {
        return DEFAULT_FRAME_MS;
    }
    value.min(MAX_FRAME_MS)
}

/// `raw_ms` rounded onto the nearest whole number of cadences when it is close enough to one.
fn snap_to_cadence(raw_ms: f64, cadence_ms: f64) -> f64 {
    if cadence_ms <= 0.0 {
        return raw_ms;
    }
    let multiple = (raw_ms / cadence_ms).round();
    if !(1.0..=MAX_SNAP_MULTIPLE).contains(&multiple) {
        return raw_ms;
    }
    let target = multiple * cadence_ms;
    if (raw_ms - target).abs() <= SNAP_TOLERANCE * cadence_ms {
        target
    } else {
        raw_ms
    }
}

/// The frame clock: the previous rendering-update instant, the measurements the cadence is
/// read from, and the time a deferred frame still owes.
pub(crate) struct FrameClock {
    last_seconds: Option<f64>,
    history: [f64; HISTORY_LEN],
    samples: usize,
    cursor: usize,
    debt_ms: f64,
}

impl FrameClock {
    /// A clock that has not seen a frame yet.
    pub(crate) fn new() -> Self {
        Self {
            last_seconds: None,
            history: [DEFAULT_FRAME_MS; HISTORY_LEN],
            samples: 0,
            cursor: 0,
            debt_ms: 0.0,
        }
    }

    /// How long this frame should count as, in milliseconds. `timestamp_seconds` is the
    /// browser's rendering-update instant when the platform has one, and `fallback_ms` is
    /// what the window measured, used until there are two timestamps to subtract.
    pub(crate) fn tick(&mut self, timestamp_seconds: Option<f64>, fallback_ms: f64) -> f64 {
        let raw_ms = self.measure_ms(timestamp_seconds, fallback_ms);
        self.record(raw_ms);
        match self.cadence_ms() {
            Some(cadence_ms) => self.paced_ms(raw_ms, cadence_ms),
            None => raw_ms,
        }
    }

    /// The gap between this rendering update and the previous one, falling back to the
    /// window's measurement when there is no usable pair of timestamps.
    fn measure_ms(&mut self, timestamp_seconds: Option<f64>, fallback_ms: f64) -> f64 {
        let fallback_ms = sanitised_ms(fallback_ms);
        let Some(now_seconds) = timestamp_seconds.filter(|value| value.is_finite() && *value > 0.0)
        else {
            return fallback_ms;
        };
        match self.last_seconds.replace(now_seconds) {
            Some(previous) if now_seconds > previous => {
                sanitised_ms((now_seconds - previous) * 1000.0)
            }
            _ => fallback_ms,
        }
    }

    /// Keeps the measurement in the rolling window the cadence is read from.
    fn record(&mut self, raw_ms: f64) {
        self.history[self.cursor] = raw_ms;
        self.cursor = (self.cursor + 1) % HISTORY_LEN;
        self.samples = self.samples.saturating_add(1);
    }

    /// The cadence the browser is actually delivering, once the window has filled: the median
    /// of its measurements, so one deferred frame does not move it.
    fn cadence_ms(&self) -> Option<f64> {
        if self.samples < HISTORY_LEN {
            return None;
        }
        let mut sorted = self.history;
        sorted.sort_by(f64::total_cmp);
        Some(sorted[HISTORY_LEN / 2])
    }

    /// The measurement as the simulation sees it: a frame that ran long hands over no more
    /// than a quarter cadence of extra time and owes the rest, and the frames that follow pay
    /// that back a quarter cadence at a time.
    fn paced_ms(&mut self, raw_ms: f64, cadence_ms: f64) -> f64 {
        let snapped_ms = snap_to_cadence(raw_ms, cadence_ms);
        let ceiling_ms = cadence_ms * (1.0 + CATCH_UP_SHARE);
        let reported_ms = if snapped_ms > ceiling_ms {
            self.debt_ms += snapped_ms - ceiling_ms;
            ceiling_ms
        } else {
            let paid_ms = self.debt_ms.min(cadence_ms * CATCH_UP_SHARE);
            self.debt_ms -= paid_ms;
            snapped_ms + paid_ms
        };
        self.debt_ms = self.debt_ms.clamp(0.0, cadence_ms * MAX_DEBT_MULTIPLE);
        reported_ms
    }
}

impl Default for FrameClock {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[path = "clock.test.rs"]
mod tests;
