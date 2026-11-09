//! The game domain: world composition, boot, per-frame update and scene assembly.

pub(crate) mod config;
mod frame;
mod ground;
mod scene;
mod state;

pub(crate) use state::Game;
