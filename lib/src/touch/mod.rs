//! The on-screen touch controls: one floating analog stick that moves, gathers and jumps.
//!
//! The first touch puts the stick's base under the thumb (it rests in the bottom-right corner
//! otherwise) and drives the player like the keyboard does, but analog: the walk vector scales
//! with the deflection, and pushing past the run threshold turns run on, the way Shift does on
//! a PC. Holding the stick still gathers. While the stick moves the player, a new touch on the
//! screen jumps, and a second one while still moving jumps again: the double jump. The
//! controls show up on coarse-pointer devices (the `iso_pointer_coarse` FFI on the web) and on
//! any platform after the first touch; desktops with a mouse never see them. They are drawn
//! over the overlay, regardless of the route gate: the controls are gameplay input, not
//! decoration.

mod controls;
mod layout;
mod platform;
mod stick;

pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};
pub(crate) use platform::coarse_pointer;
