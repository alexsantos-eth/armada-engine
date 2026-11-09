//! The overlay the client paints over the scene: HUD and transient messages.

mod hud;

pub(crate) use hud::{draw_hud, push_hud_update};
