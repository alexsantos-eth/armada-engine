//! The engine's client: window configuration and composition root.
//!
//! Everything that behaves lives in a domain module: `game` boots the world and splits the
//! frame into update (`game::frame`) and view (`game::scene`), `gui` paints the overlay and
//! `loops` sequences the frame. This file only picks the window and hands control to the loop.

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

use game::Game;
use macroquad::prelude::*;

fn window_conf() -> Conf {
    Conf {
        window_title: "iso-core".to_owned(),
        window_width: 960,
        window_height: 600,
        ..Default::default()
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    let game = Game::new().await;
    loops::run(game).await;
}
