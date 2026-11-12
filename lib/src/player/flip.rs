//! The front flip the player turns in the air when it jumps a second time.

/// Real milliseconds a whole somersault takes, about the air time of a second jump.
pub const FLIP_MS: f64 = 520.0;

/// Real milliseconds the rest of a somersault takes once a landing has cut it short, so that the
/// body finishes the turn it was in instead of snapping upright.
pub const FLIP_LANDING_MS: f64 = 110.0;

/// What the player did since the frame before, as far as the somersault is concerned.
#[derive(Clone, Copy, Debug)]
pub struct FlipMoment {
    /// Jumps the player has taken, which starts a somersault when the new one was taken in the
    /// air.
    pub jumps: i32,
    pub landings: i32,
    /// Whether the last jump counted was taken in the air: the only one that flips.
    pub air_jump: bool,
    pub elapsed_ms: f64,
}

/// The somersault's memory between frames.
#[derive(Clone, Copy, Debug)]
pub struct FlipMotion {
    seen_jumps: i32,
    seen_landings: i32,
    turning: bool,
    /// The share of the whole turn already made, from `0.0` to `1.0`.
    turned: f64,
    /// Turns made per real millisecond.
    rate: f64,
}

impl Default for FlipMotion {
    fn default() -> Self {
        Self {
            seen_jumps: 0,
            seen_landings: 0,
            turning: false,
            turned: 0.0,
            rate: 1.0 / FLIP_MS,
        }
    }
}

impl FlipMotion {
    /// Takes one frame into account and answers with how much of the somersault is turned, from
    /// `0.0` to `1.0`, or `None` when the player is drawn upright.
    pub fn advance(&mut self, moment: FlipMoment) -> Option<f64> {
        if moment.landings != self.seen_landings {
            self.seen_landings = moment.landings;
            if self.turning {
                self.rate = ((1.0 - self.turned) / FLIP_LANDING_MS).max(0.0);
            }
        }
        if moment.jumps != self.seen_jumps {
            self.seen_jumps = moment.jumps;
            if moment.air_jump {
                self.turning = true;
                self.turned = 0.0;
                self.rate = 1.0 / FLIP_MS;
            }
        }
        if !self.turning {
            return None;
        }
        self.turned += self.rate * moment.elapsed_ms.max(0.0);
        if self.turned >= 1.0 {
            self.turning = false;
            self.turned = 0.0;
            return None;
        }
        Some(self.turned)
    }
}

#[cfg(test)]
#[path = "flip.test.rs"]
mod tests;
