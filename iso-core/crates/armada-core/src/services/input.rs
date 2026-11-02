//! Normalized player input, independent of keyboard, touch or gamepad.

use crate::projection::GridPoint;

/// A normalized movement direction (unit vector, or (0,0) when idle).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct NormalizedInput {
    pub walk: GridPoint,
    pub jump_pressed: bool,
    pub jump_held: bool,
    pub run: bool,
    pub jetpack: bool,
}

/// Source of normalized input events.
pub trait InputService {
    /// Polls the current input state. Called once per frame.
    fn poll(&mut self) -> NormalizedInput;
}