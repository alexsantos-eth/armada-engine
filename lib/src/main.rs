//! The engine's client: declares the domains and enters through `app`.
//!
//! Everything that behaves lives in a domain module: `game` boots the world and splits the
//! frame into update (`game::frame`) and view (`game::scene`), `gui` paints the overlay and
//! `loops` sequences the frame. This file only declares the domains and hands control to
//! `app::run`.

mod app;
mod assets;
mod game;
mod gui;
mod lighting;
mod loops;
mod perf;
mod player;
mod rendering;
mod save;
mod services;
mod terrain;
mod touch;
mod water;

use app::window_conf;

#[macroquad::main(window_conf)]
async fn main() {
    app::run().await;
}
