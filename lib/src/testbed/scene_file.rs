//! Where a scripted run reads its scene from, and where it writes what it produces.
//!
//! The scene is a file on disk named by `--scene`, so the run is one command with no input of
//! its own. Output paths are resolved against the scene's own directory, which keeps a scene
//! and its shots together wherever it is kept.

use std::path::{Path, PathBuf};

use iso::testbed::{Scene, is_shot_name, parse_scene};

/// The argument that runs a scene.
#[cfg(any(not(target_arch = "wasm32"), test))]
pub(crate) const SCENE_FLAG: &str = "--scene";

/// The scene named by `arguments`, if any: the value after `--scene`, or the tail of
/// `--scene=…`.
#[cfg(any(not(target_arch = "wasm32"), test))]
pub(crate) fn scene_argument<'a>(arguments: impl Iterator<Item = &'a String>) -> Option<String> {
    let mut wanted = false;
    for argument in arguments {
        if wanted {
            return Some(argument.clone());
        }
        if argument == SCENE_FLAG {
            wanted = true;
        } else if let Some(path) = argument.strip_prefix(&format!("{SCENE_FLAG}=")) {
            return Some(path.to_owned());
        }
    }
    None
}

/// The scene this process was asked to run, if it was asked to run one. The web build has no
/// arguments, so it never runs a scene.
pub(crate) fn scene_path() -> Option<PathBuf> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        scene_argument(std::env::args().collect::<Vec<String>>().iter()).map(PathBuf::from)
    }
    #[cfg(target_arch = "wasm32")]
    {
        None
    }
}

/// Where a run's output goes: `out` as the scene wrote it when it is absolute, and next to the
/// scene file when it is not.
pub(crate) fn out_dir(scene: &Path, out: &str) -> PathBuf {
    let asked = Path::new(out);
    if asked.is_absolute() {
        return asked.to_path_buf();
    }
    match scene.parent() {
        Some(directory) if !directory.as_os_str().is_empty() => directory.join(asked),
        _ => asked.to_path_buf(),
    }
}

/// Where one shot is written, for a name the scene already had checked.
pub(crate) fn shot_path(out: &Path, name: &str) -> Option<PathBuf> {
    is_shot_name(name).then(|| out.join(name))
}

/// What the report of a run is called.
pub(crate) const REPORT_FILE: &str = "report.json";

/// Reads the scene at `path`, saying what is wrong with it rather than panicking.
pub(crate) fn load_scene(path: &Path) -> Result<Scene, String> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let text = std::fs::read_to_string(path)
            .map_err(|err| format!("could not read the scene at {}: {err}", path.display()))?;
        parse_scene(&text).map_err(|err| format!("{}: {err}", path.display()))
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = (path, parse_scene);
        Err("a scripted run is native only".to_owned())
    }
}

#[cfg(test)]
#[path = "scene_file.test.rs"]
mod tests;
