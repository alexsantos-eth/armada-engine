//! The on-screen touch controls: one floating analog stick that moves, gathers and jumps.
//! The on-screen touch controls: one floating analog stick that moves, gathers and jumps.
//!
//! The first touch puts the stick's base under the thumb (it rests in the bottom-right corner
//! otherwise) and drives the player like the keyboard does, but analog: the walk vector scales
//! with the deflection, and pushing past the run threshold turns run on, the way Shift does on
//! a PC. Holding the stick still gathers. Releasing the stick stops the walk right away. While the stick moves the player, a new touch on the
//! screen jumps, and a second one while still moving jumps again: the double jump. A jump
//! touch held down keeps `jump_held` on while the finger is down — the mobile form of holding
//! Space: the variable jump; the release cuts the rise. The controls show up on coarse-pointer
//! devices (the `iso_pointer_coarse` FFI on the web) and on any platform after the first touch;
//! desktops with a mouse never see them. They are drawn over the overlay, regardless of the
//! route gate: the controls are gameplay input, not decoration.

mod controls;
mod layout;
mod platform;
mod stick;

pub(crate) use controls::{RawTouch, RawTouchPhase, StickView, TouchControls};
pub(crate) use platform::coarse_pointer;
