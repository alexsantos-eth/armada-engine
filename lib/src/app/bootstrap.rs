//! The app's composition root: the window the game opens in and the boot call handed to
//! Macroquad.
//!
//! `window_conf` fixes the title ([`GAME_TITLE`]) and the default size; `run` boots the world
//! and hands control to the frame loop. Kept separate from the crate root so the window
//! configuration is testable without an async `main`.

use macroquad::prelude::*;

use crate::game::{Game, config::GAME_TITLE};
use crate::loops;

/// The window the game opens in: titled after the game, 960×600 by default. The icon is
/// deferred to the OS bundle (`None`), so a macOS `.app` shows its `game.icns` instead of
/// Miniquad's default logo.
pub(crate) fn window_conf() -> Conf {
    Conf {
        window_title: GAME_TITLE.to_owned(),
        window_width: 960,
        window_height: 600,
        icon: None,
        ..Default::default()
    }
}

/// Boots the game (artwork, world, save) and runs the frame loop until exit. The route decides
/// what is booted: the streamed world, or the editor's one flat chunk.
pub(crate) async fn run() {
    let route = crate::gui::current();
    let game = Game::new(route).await;
    loops::run(game).await;
}

#[cfg(test)]
#[path = "bootstrap.test.rs"]
mod tests;
