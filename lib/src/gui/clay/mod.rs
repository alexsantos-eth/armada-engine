//! The game's HUD, drawn with Macroquad from the UI kit: the pieces `scripts/export-ui.cjs`
//! renders from `web/ui/armada-ui.css` into `content/ui/`, sliced, posed and animated. The same
//! code draws it on every platform (native, web and the scripted runs behind the PR screenshots).

mod draw;
mod frame;
mod hud;
mod layout;
mod motion;
mod skin;
mod slice;

pub(crate) use draw::{draw_clay_hud, draw_clay_stick};
pub(crate) use frame::{UiFrame, UiGain, UiPrompt, UiStack};
pub(crate) use hud::ClayHud;
pub(crate) use layout::HudLayout;
pub(crate) use skin::ClaySkin;
