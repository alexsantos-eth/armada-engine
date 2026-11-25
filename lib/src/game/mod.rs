//! The game domain: world composition, boot, per-frame update and scene assembly.

pub(crate) mod config;
mod frame;
pub(crate) mod ground;
mod scene;
mod shop;
mod soundscape;
mod state;

pub(crate) use state::Game;
