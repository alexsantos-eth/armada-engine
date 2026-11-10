//! The app domain: the client's composition root (window and boot) and the macOS `.app`
//! bundle layout (where assets and saves live inside one).
//!
//! Everything that behaves lives in a domain module; this domain only picks the window, hands
//! control to the loop and resolves the paths a bundle relocates.

mod bootstrap;
#[cfg(not(target_arch = "wasm32"))]
mod bundle;

pub(crate) use bootstrap::{run, window_conf};
#[cfg(not(target_arch = "wasm32"))]
pub(crate) use bundle::{asset_path, save_path};
