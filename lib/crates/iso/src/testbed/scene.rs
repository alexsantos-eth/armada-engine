//! What a scripted run is given: the world it opens, what it builds there, and the steps it
//! takes.
//!
//! The scene is data, read from a `scene.json` the client hands over. Nothing here touches the
//! world; `apply` performs the edits and `script` sequences the steps.

use serde::Deserialize;

use crate::lighting::BakePhase;
use crate::terrain::TerrainMaterial;

/// What a run opens before anything is built.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SceneWorld {
    /// The procedural world, streamed around the centre, as the game plays it.
    #[default]
    Procedural,
    /// One flat grass chunk with nothing generated or placed, as the editor opens.
    Blank,
}

/// A phase of the day a scene can pin the light to.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScenePhase {
    Dawn,
    Day,
    Sunset,
    Night,
}

impl ScenePhase {
    /// The bake phase this one names.
    pub const fn bake(self) -> BakePhase {
        match self {
            Self::Dawn => BakePhase::Dawn,
            Self::Day => BakePhase::Day,
            Self::Sunset => BakePhase::Sunset,
            Self::Night => BakePhase::Night,
        }
    }
}

/// How many times a repeatable edit is applied when the scene does not say.
const fn once() -> u32 {
    1
}

/// One change to the world, in the terms the editor's brush already understands.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase", deny_unknown_fields)]
pub enum SceneEdit {
    /// Lifts the column `times` blocks.
    Raise {
        at: [i32; 2],
        #[serde(default = "once")]
        times: u32,
    },
    /// Sinks the column `times` blocks.
    Lower {
        at: [i32; 2],
        #[serde(default = "once")]
        times: u32,
    },
    /// Paints the column's surface.
    Surface {
        at: [i32; 2],
        material: TerrainMaterial,
    },
    /// Writes the colour zone of the cell's top.
    Tint { at: [i32; 2], zone: usize },
    /// Grows a top variant on the cell; `variant` absent leaves the plain block.
    Top {
        at: [i32; 2],
        #[serde(default)]
        variant: Option<usize>,
    },
    /// Puts a blueprint down, anchored on the cell, optionally turned a quarter turn.
    Place {
        at: [i32; 2],
        blueprint: String,
        #[serde(default)]
        turned: bool,
    },
    /// Takes away whatever stands on the cell, then its dressing.
    Erase { at: [i32; 2] },
}

impl SceneEdit {
    /// The cell this edit works on.
    pub const fn at(&self) -> [i32; 2] {
        match self {
            Self::Raise { at, .. }
            | Self::Lower { at, .. }
            | Self::Surface { at, .. }
            | Self::Tint { at, .. }
            | Self::Top { at, .. }
            | Self::Place { at, .. }
            | Self::Erase { at } => *at,
        }
    }

    /// How many strokes this edit takes.
    pub const fn times(&self) -> u32 {
        match self {
            Self::Raise { times, .. } | Self::Lower { times, .. } => *times,
            _ => 1,
        }
    }
}

/// One step of a run, in the order the scene lists them.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase", deny_unknown_fields)]
pub enum SceneStep {
    /// Holds the walk direction, in world axes, for a number of frames.
    Walk {
        dir: [f64; 2],
        frames: u32,
        #[serde(default)]
        run: bool,
    },
    /// Presses the jump key for one frame.
    Jump,
    /// Presses the key that straps the jetpack on, for one frame.
    Jetpack,
    /// Holds the gather key, standing still, for a number of frames.
    Gather { frames: u32 },
    /// Runs a number of frames with no input at all.
    Wait { frames: u32 },
    /// Runs frames until every chunk on screen is generated and its shadows are baked and
    /// faded in. The run's frame budget still bounds it.
    Settle,
    /// Puts the player on a cell, with the camera already framing it.
    Teleport([i32; 2]),
    /// Pins the light to a phase of the day.
    Phase(ScenePhase),
    /// Changes the world mid-run, as the scene's own edits do at the start.
    Edit(SceneEdit),
    /// Writes the frame as a PNG under the run's output directory.
    Shot(String),
}

impl SceneStep {
    /// Whether this step ends the frame it is taken in: anything that moves the player, lets
    /// time pass, or captures what is on screen.
    pub const fn ends_the_frame(&self) -> bool {
        matches!(
            self,
            Self::Walk { .. }
                | Self::Jump
                | Self::Jetpack
                | Self::Gather { .. }
                | Self::Wait { .. }
                | Self::Shot(_)
        )
    }
}

/// Where the shots land when the scene does not say.
fn default_out() -> String {
    "shots".to_owned()
}

/// The most frames a run may take when the scene does not say: thirty seconds at the fixed
/// step, enough for any settle and short enough that a stuck scene still ends.
pub const DEFAULT_MAX_FRAMES: u32 = 600;

/// How many frames a run may take when the scene does not say.
const fn default_max_frames() -> u32 {
    DEFAULT_MAX_FRAMES
}

/// One scripted run, as `scene.json` describes it.
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Scene {
    /// What the run opens: the streamed world, or one flat chunk.
    #[serde(default)]
    pub world: SceneWorld,
    /// The seed the procedural world generates from; absent keeps the game's own.
    #[serde(default)]
    pub seed: Option<u64>,
    /// The cell the world opens around; absent keeps the game's own centre.
    #[serde(default)]
    pub centre: Option<[i32; 2]>,
    /// The window the run opens, in pixels.
    #[serde(default)]
    pub window: Option<[u32; 2]>,
    /// The camera's zoom; one is the game's own.
    #[serde(default)]
    pub zoom: Option<f64>,
    /// The phase the light is pinned to for the whole run, unless a step changes it.
    #[serde(default)]
    pub phase: Option<ScenePhase>,
    /// The cell the player stands on before the first step.
    #[serde(default)]
    pub player: Option<[i32; 2]>,
    /// What is built before the first step.
    #[serde(default)]
    pub edits: Vec<SceneEdit>,
    /// The steps the run takes; empty settles the light and takes one shot.
    #[serde(default)]
    pub steps: Vec<SceneStep>,
    /// Where the shots and the report are written, relative to the scene file.
    #[serde(default = "default_out")]
    pub out: String,
    /// The most frames the run may take before it stops and says so.
    #[serde(default = "default_max_frames")]
    pub max_frames: u32,
}

/// The steps an empty scene takes: settle the light, then one shot named after the scene.
pub fn default_steps() -> Vec<SceneStep> {
    vec![SceneStep::Settle, SceneStep::Shot("scene.png".to_owned())]
}

/// Whether `name` is a shot the run may write: a plain file name ending in `.png`, with no
/// directory of its own.
pub fn is_shot_name(name: &str) -> bool {
    !name.is_empty()
        && name.ends_with(".png")
        && name.len() > ".png".len()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
}

/// Reads a scene, and says what is wrong with it rather than panicking. A scene with no steps
/// is given the default ones, and every shot name is checked before a frame is drawn.
pub fn parse_scene(json: &str) -> Result<Scene, String> {
    let mut scene: Scene = serde_json::from_str(json).map_err(|err| err.to_string())?;
    if scene.steps.is_empty() {
        scene.steps = default_steps();
    }
    if scene.max_frames == 0 {
        return Err("maxFrames has to be at least one frame".to_owned());
    }
    for step in &scene.steps {
        if let SceneStep::Shot(name) = step
            && !is_shot_name(name)
        {
            return Err(format!(
                "{name} is not a shot name: it has to be a plain file name ending in .png"
            ));
        }
    }
    for edit in &scene.edits {
        if edit.times() == 0 {
            return Err(format!("an edit on {:?} repeats zero times", edit.at()));
        }
    }
    Ok(scene)
}

#[cfg(test)]
#[path = "scene.test.rs"]
mod tests;
