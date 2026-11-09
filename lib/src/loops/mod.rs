//! The frame loop: the order of a frame, and nothing else.
//!
//! `update` → `scene` → draw → HUD. The rules of the game live in `game::frame`, the view in
//! `game::scene` and `gui`; this module only sequences them and feeds the frame's metrics.

mod frame_loop;

pub(crate) use frame_loop::run;
