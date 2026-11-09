//! The virtual stick's analog math.
//!
//! Turns a screen-space offset into the world-space `walk` vector the player physics
//! expects: the horizontal screen axis and the inverted vertical screen axis feed the
//! same `x = across + up, y = up - across` map the keyboard uses, the result is
//! normalised and multiplied by the clamped deflection, so a full push walks (or, past
//! the run threshold, runs) at full speed.

use iso::projection::GridPoint;

/// Deflection below which the stick reads as idle.
pub(crate) const DEADZONE: f64 = 0.18;
/// Deflection at which the run modifier kicks in, mirroring Shift on the keyboard.
pub(crate) const RUN_THRESHOLD: f64 = 0.8;

/// What one stick sample produces: the walk vector, the analog magnitude and the run flag.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct StickReading {
    pub(crate) walk: GridPoint,
    pub(crate) magnitude: f64,
    pub(crate) run: bool,
}

/// Reads the stick at `(dx, dy)` screen pixels from the base centre, clamped to `radius`.
/// Screen `dy` grows downward; the world map needs `up` to grow upward.
pub(crate) fn stick_reading(dx: f64, dy: f64, radius: f64) -> StickReading {
    let idle = StickReading {
        walk: GridPoint { x: 0.0, y: 0.0 },
        magnitude: 0.0,
        run: false,
    };
    if radius <= 0.0 {
        return idle;
    }
    let len = dx.hypot(dy);
    let magnitude = (len / radius).min(1.0);
    if magnitude < DEADZONE {
        return idle;
    }
    let across = dx / len;
    let up = -dy / len;
    let raw_x = across + up;
    let raw_y = up - across;
    let raw_len = raw_x.hypot(raw_y);
    StickReading {
        walk: GridPoint {
            x: raw_x / raw_len * magnitude,
            y: raw_y / raw_len * magnitude,
        },
        magnitude,
        run: magnitude >= RUN_THRESHOLD,
    }
}

/// The knob position for an offset, clamped to `radius` so it never escapes the base.
pub(crate) fn clamp_offset(dx: f64, dy: f64, radius: f64) -> (f64, f64) {
    let len = dx.hypot(dy);
    if len <= radius || len == 0.0 {
        return (dx, dy);
    }
    (dx / len * radius, dy / len * radius)
}

#[cfg(test)]
#[path = "stick.test.rs"]
mod tests;
