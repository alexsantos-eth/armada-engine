//! Running the game from a scene file instead of from a person at the keyboard.
//!
//! A scripted run reads a `scene.json`, builds the world it describes, drives the player
//! through the same input port the keyboard uses, writes PNGs of the frames it is asked for and
//! answers with a report. The rules are `iso::testbed`; this domain reads the file, reaches into
//! the game and writes to disk.

mod drive;
mod input;
mod run;
mod scene_file;

pub(crate) use drive::{advance, begin, write_shots};
pub(crate) use input::ScriptInput;
pub(crate) use run::ScriptRun;
pub(crate) use scene_file::{load_scene, out_dir, scene_path};
