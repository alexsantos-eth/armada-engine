//! macOS `.app` bundle layout: where assets and saves live when the game runs from one.
//!
//! A Finder-launched bundle starts with `/` as its working directory, so the development
//! layout (`content/` and `saves/` next to the crate) does not apply. Read-only assets ship
//! in `Contents/Resources`; the save belongs in the per-user
//! `~/Library/Application Support/<GAME_TITLE>` directory. Outside a bundle both helpers
//! return the development paths unchanged.

use std::path::{Path, PathBuf};

use crate::game::config::GAME_TITLE;

const SAVE_FILE: &str = "saves/iso_save.json";

/// The `Contents/Resources` directory holding `exe`, when `exe` looks like the binary of a
/// macOS application bundle and that directory exists.
fn resources_of(exe: &Path, is_dir: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    let macos = exe.parent()?;
    if macos.file_name()? != "MacOS" {
        return None;
    }
    let contents = macos.parent()?;
    if contents.file_name()? != "Contents" {
        return None;
    }
    let resources = contents.join("Resources");
    is_dir(&resources).then_some(resources)
}

/// This process's bundle resources directory, or `None` when not running from a `.app`.
fn bundle_resources() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    resources_of(&exe, &|path| path.is_dir())
}

/// Picks where an asset is fetched from: the working directory when it exists there, else
/// the bundle's candidate, else the relative path itself.
fn decide_asset(path: &str, cwd_hit: bool, bundle_hit: Option<PathBuf>) -> String {
    if cwd_hit {
        return path.to_owned();
    }
    bundle_hit.map_or_else(|| path.to_owned(), |hit| hit.to_string_lossy().into_owned())
}

/// Where a CWD-relative asset path is fetched from: as-is when it exists next to the working
/// directory (development), from the bundle's `Contents/Resources` when running inside a
/// `.app`, and as-is otherwise, leaving the failure mode unchanged.
pub(crate) fn asset_path(path: &str) -> String {
    let hit = bundle_resources()
        .map(|resources| resources.join(path))
        .filter(|candidate| candidate.exists());
    decide_asset(path, Path::new(path).exists(), hit)
}

/// Picks where the save lives: the per-user support directory inside a bundle when a home
/// directory is known, else the development path.
fn decide_save(home: Option<PathBuf>, inside_bundle: bool, title: &str) -> PathBuf {
    if inside_bundle && let Some(home) = home {
        return home
            .join("Library/Application Support")
            .join(title)
            .join(SAVE_FILE);
    }
    PathBuf::from(SAVE_FILE)
}

/// The user's home directory from `HOME`, or `None` when it is unset or empty.
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// Where the save file lives: the per-user support directory when running inside a bundle,
/// or the development `saves/iso_save.json` relative to the working directory otherwise.
pub(crate) fn save_path() -> PathBuf {
    decide_save(home_dir(), bundle_resources().is_some(), GAME_TITLE)
}

#[cfg(test)]
#[path = "bundle.test.rs"]
mod tests;
