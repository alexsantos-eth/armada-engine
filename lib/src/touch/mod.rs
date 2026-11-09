//! The on-screen touch controls: an analog joystick and a jump button.
//!
//! The joystick lives in the bottom-left corner and drives the player like the
//! keyboard does, but analog: the walk vector scales with the deflection, and
//! pushing past the run threshold turns run on, the way Shift does on a PC.
//! The jump button lives in the bottom-right corner. Both controls show up on
//! coarse-pointer devices (the `iso_pointer_coarse` FFI on the web) and on any
//! platform after the first touch; desktops with a mouse never see them. The
//! drawing is paint-only and runs over the overlay, regardless of the route
//! gate: the controls are gameplay input, not decoration.

mod controls;
mod layout;
mod platform;
mod stick;

pub(crate) use controls::{RawTouch, RawTouchPhase, TouchControls};
pub(crate) use platform::coarse_pointer;
