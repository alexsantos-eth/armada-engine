//! Tick-based clock. One tick is one fixed simulation step.

pub const TICKS_PER_SECOND: u64 = 20;
pub const TICKS_PER_DAY: u64 = 20 * 60 * TICKS_PER_SECOND;
pub const TICKS_PER_HOUR: u64 = TICKS_PER_DAY / 24;
pub const WORLD_START_TICK: u64 = 8 * TICKS_PER_HOUR;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WorldClock {
    pub tick: u64,
}

impl Default for WorldClock {
    fn default() -> Self {
        Self {
            tick: WORLD_START_TICK,
        }
    }
}

impl WorldClock {
    pub fn new(tick: u64) -> Self {
        Self { tick }
    }

    /// Advance atomically; overflow leaves the clock unchanged.
    pub fn advance(&mut self, ticks: u64) -> Result<u64, ClockOverflow> {
        self.tick = self.tick.checked_add(ticks).ok_or(ClockOverflow)?;
        Ok(self.tick)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClockOverflow;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClockTime {
    pub day: u64,
    pub hour: u8,
    pub minute: u8,
}

/// Fraction of a day for a signed offset; negative offsets wrap to the previous day.
pub fn time_of_day(tick: i64) -> f64 {
    tick.rem_euclid(TICKS_PER_DAY as i64) as f64 / TICKS_PER_DAY as f64
}

pub fn clock_time(tick: u64) -> ClockTime {
    let in_day = tick % TICKS_PER_DAY;
    let minutes = in_day * 24 * 60 / TICKS_PER_DAY;
    ClockTime {
        day: tick / TICKS_PER_DAY,
        hour: (minutes / 60) as u8,
        minute: (minutes % 60) as u8,
    }
}

pub fn format_clock_time(time: ClockTime) -> String {
    format!("{:02}:{:02}", time.hour, time.minute)
}

#[cfg(test)]
#[path = "clock.test.rs"]
mod tests;
