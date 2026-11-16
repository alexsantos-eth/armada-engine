//! The rules of a scripted run: what a scene describes, what its edits do, how its steps are
//! sequenced, and what it answers with.
//!
//! This domain owns the decisions so they can be tested without a window; the client reads the
//! scene file, carries the frames out and writes the shots.

mod apply;
mod report;
mod scene;
mod script;

pub use apply::{apply_edit, blueprint_index, brush_for};
pub use report::{Report, ReportEntity, ReportPlayer, entities_in, player_of, refusal_note};
pub use scene::{
    DEFAULT_MAX_FRAMES, Scene, SceneEdit, ScenePhase, SceneStep, SceneWorld, default_steps,
    is_shot_name, parse_scene,
};
pub use script::{Script, ScriptFrame};
