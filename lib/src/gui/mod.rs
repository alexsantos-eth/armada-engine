//! The overlay the client paints over the scene: HUD and transient messages.
//!
//! The overlay is route-gated on the web build: `/` paints nothing, `/playground` and `/maker`
//! paint it all (see [`Route`]). Native always paints it.

mod hud;
mod route;

pub(crate) use hud::{HudWorld, PerfCounts, draw_hud, push_hud_update};
pub(crate) use route::{Route, current};
