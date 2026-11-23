//! The HTML UI kit drawn natively: the pieces `scripts/export-ui.cjs` renders from
//! `web/ui/armada-ui.css` into `content/ui/`, sliced, posed and animated with Macroquad, so the
//! native build (and the scripted runs behind the PR screenshots) shows the same clay HUD as
//! the web build.

mod draw;
mod hud;
mod layout;
mod motion;
mod skin;
mod slice;

pub(crate) use draw::draw_clay_hud;
pub(crate) use hud::ClayHud;
pub(crate) use layout::HudLayout;
pub(crate) use skin::ClaySkin;
