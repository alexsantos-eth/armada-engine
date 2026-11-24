//! The engine's client: declares the domains and enters through `app`.
//!
//! Everything that behaves lives in a domain module: `game` boots the world and splits the
//! frame into update (`game::frame`) and view (`game::scene`), `gui` paints the overlay, `harvest` the hotbar,
//! `maker` edits one chunk on the `/maker` route and `loops` sequences the frame. This file
//! only declares the domains and hands control to `app::run`. `testbed` runs the game from a
//! scene file instead of from a person at the keyboard.

mod app;
mod assets;
mod effects;
mod game;
mod gui;
mod harvest;
mod lighting;
mod loops;
mod maker;
mod npc;
mod perf;
mod player;
mod rendering;
mod save;
mod services;
mod terrain;
mod testbed;
mod touch;
mod ui;
mod water;

use app::window_conf;

#[macroquad::main(window_conf)]
async fn main() {
    app::run().await;
}
