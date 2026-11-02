//! Convert variable real frame time into fixed logical steps.

use crate::time::TICKS_PER_SECOND;

pub const STEP_MS: f64 = 1000.0 / TICKS_PER_SECOND as f64;
pub const DEFAULT_MAX_FRAME_MS: f64 = 250.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StepperOptions {
    pub step_ms: f64,
    pub max_frame_ms: f64,
    pub time_scale: f64,
}

impl Default for StepperOptions {
    fn default() -> Self {
        Self {
            step_ms: STEP_MS,
            max_frame_ms: DEFAULT_MAX_FRAME_MS,
            time_scale: 1.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InvalidStepperOptions;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FixedStepper {
    pub step_ms: f64,
    pub max_frame_ms: f64,
    pub time_scale: f64,
    pub paused: bool,
    accumulator_ms: f64,
}

impl FixedStepper {
    pub fn new(options: StepperOptions) -> Result<Self, InvalidStepperOptions> {
        if !options.step_ms.is_finite()
            || options.step_ms <= 0.0
            || !options.max_frame_ms.is_finite()
            || options.max_frame_ms <= 0.0
            || !options.time_scale.is_finite()
            || options.time_scale < 0.0
        {
            return Err(InvalidStepperOptions);
        }
        Ok(Self {
            step_ms: options.step_ms,
            max_frame_ms: options.max_frame_ms,
            time_scale: options.time_scale,
            paused: false,
            accumulator_ms: 0.0,
        })
    }

    pub fn consume_frame(&mut self, elapsed_ms: f64) -> u64 {
        if self.paused || !elapsed_ms.is_finite() || elapsed_ms <= 0.0 {
            return 0;
        }
        let added = elapsed_ms.min(self.max_frame_ms) * self.time_scale;
        if !added.is_finite() {
            return 0;
        }
        let total = self.accumulator_ms + added;
        if !total.is_finite() || total / self.step_ms >= u64::MAX as f64 {
            return 0;
        }
        let steps = (total / self.step_ms).floor() as u64;
        self.accumulator_ms = total - steps as f64 * self.step_ms;
        steps
    }

    pub fn interpolation_alpha(&self) -> f64 {
        self.accumulator_ms / self.step_ms
    }

    pub fn set_time_scale(&mut self, scale: f64) -> Result<(), InvalidStepperOptions> {
        if !scale.is_finite() || scale < 0.0 {
            return Err(InvalidStepperOptions);
        }
        self.time_scale = scale;
        Ok(())
    }
}

impl Default for FixedStepper {
    fn default() -> Self {
        Self::new(StepperOptions::default()).expect("default stepper options are valid")
    }
}

#[cfg(test)]
#[path = "stepper.test.rs"]
mod tests;
