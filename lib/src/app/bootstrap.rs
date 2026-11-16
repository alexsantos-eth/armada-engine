//! The app's composition root: the window the game opens in and the boot call handed to
//! Macroquad.
//!
//! `window_conf` fixes the title ([`GAME_TITLE`]) and the default size; `run` boots the world
//! and hands control to the frame loop. Kept separate from the crate root so the window
//! configuration is testable without an async `main`.

use macroquad::prelude::*;

use crate::game::{Game, config::GAME_TITLE};
use crate::loops;

/// The window a run with no scene opens in, in pixels.
const DEFAULT_WINDOW: (i32, i32) = (960, 600);

/// The window a scene asks for, in pixels, or the default when it asks for none. A size that
/// does not fit a window is ignored rather than refused.
fn window_size(asked: Option<[u32; 2]>) -> (i32, i32) {
    let Some([width, height]) = asked else {
        return DEFAULT_WINDOW;
    };
    match (i32::try_from(width), i32::try_from(height)) {
        (Ok(width), Ok(height)) if width > 0 && height > 0 => (width, height),
        _ => DEFAULT_WINDOW,
    }
}

/// The window the game opens in: titled after the game, 960×600 unless a scene asks for
/// another size. The icon is deferred to the OS bundle (`None`), so a macOS `.app` shows its
/// `game.icns` instead of Miniquad's default logo.
pub(crate) fn window_conf() -> Conf {
    let asked = crate::testbed::scene_path()
        .and_then(|path| crate::testbed::load_scene(&path).ok())
        .and_then(|scene| scene.window);
    let (window_width, window_height) = window_size(asked);
    Conf {
        window_title: GAME_TITLE.to_owned(),
        window_width,
        window_height,
        icon: None,
        ..Default::default()
    }
}

/// Boots the game (artwork, world, save) and runs the frame loop until exit. The route decides
/// what is booted: the streamed world, or the editor's one flat chunk.
pub(crate) async fn run() {
    let route = crate::gui::current();
    let scene = match crate::testbed::scene_path() {
        Some(path) => match crate::testbed::load_scene(&path) {
            Ok(scene) => Some((path, scene)),
            Err(reason) => {
                eprintln!("error: {reason}");
                return;
            }
        },
        None => None,
    };
    let mut game = Game::new(route, scene.as_ref().map(|(_, scene)| scene)).await;
    if let Some((path, scene)) = &scene {
        let out = crate::testbed::out_dir(path, &scene.out);
        crate::testbed::begin(&mut game, scene, out);
    }
    loops::run(game).await;
}

#[cfg(test)]
#[path = "bootstrap.test.rs"]
mod tests;
