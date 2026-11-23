//! A scripted run in flight: the steps left, where its output goes, and what it has to say.
//!
//! The run keeps the bookkeeping the report is built from. Carrying a frame out is
//! [`crate::testbed::drive`]'s job, because that reaches into the world and the screen.

use std::path::{Path, PathBuf};

use iso::lighting::BakePhase;
use iso::testbed::{Report, ReportEntity, ReportPlayer, Scene, SceneStep, Script, ScriptFrame};

/// The name a report gives a phase of the day, in the words a scene names it by.
pub(crate) const fn phase_name(phase: BakePhase) -> &'static str {
    match phase {
        BakePhase::Dawn => "dawn",
        BakePhase::Day => "day",
        BakePhase::Sunset => "sunset",
        BakePhase::Night => "night",
    }
}

/// A scripted run and what it has produced so far.
pub(crate) struct ScriptRun {
    script: Script,
    out: PathBuf,
    written: Vec<String>,
    notes: Vec<String>,
}

impl ScriptRun {
    /// A run of `scene`'s steps writing into `out`.
    pub(crate) fn new(scene: &Scene, out: PathBuf) -> Self {
        Self {
            script: Script::new(scene.steps.clone(), scene.max_frames),
            out,
            written: Vec::new(),
            notes: Vec::new(),
        }
    }

    /// Where this run's shots and report are written.
    pub(crate) fn out(&self) -> &Path {
        &self.out
    }

    /// The frame to take now, recording anything the script had to say about it.
    pub(crate) fn frame(&mut self, lit: bool) -> ScriptFrame {
        let frame = self.script.frame(lit);
        if let Some(note) = &frame.note {
            self.notes.push(note.clone());
        }
        frame
    }

    /// Records something worth reporting.
    pub(crate) fn note(&mut self, text: String) {
        self.notes.push(text);
    }

    /// Records a shot that reached the disk.
    pub(crate) fn wrote(&mut self, name: &str) {
        self.written.push(name.to_owned());
    }

    /// The report of the run as it stands, for the state the client reads off the world.
    pub(crate) fn report(
        &self,
        player: Option<ReportPlayer>,
        entities: Vec<ReportEntity>,
        phase: BakePhase,
    ) -> Report {
        let mut notes = self.notes.clone();
        let asked = self.script.steps();
        if self.script.step() < asked {
            notes.push(format!(
                "the run ended on step {} of {asked}",
                self.script.step() + 1
            ));
        }
        Report {
            frames: self.script.frames(),
            steps_taken: self.script.step().min(asked),
            steps: asked,
            shots: self.written.clone(),
            phase: phase_name(phase).to_owned(),
            player,
            entities,
            notes,
            sounds: Vec::new(),
        }
    }
}

/// The one line a finished run prints, so a terminal says what happened without opening the
/// report.
pub(crate) fn summary(report: &Report) -> String {
    format!(
        "scene: {} of {} steps in {} frames, {} shot(s), {} note(s)",
        report.steps_taken,
        report.steps,
        report.frames,
        report.shots.len(),
        report.notes.len()
    )
}

/// How many shots a scene asks for, so a run can say up front what it is about to write.
pub(crate) fn shots_asked(scene: &Scene) -> Vec<String> {
    scene
        .steps
        .iter()
        .filter_map(|step| match step {
            SceneStep::Shot(name) => Some(name.clone()),
            _ => None,
        })
        .collect()
}

#[cfg(test)]
#[path = "run.test.rs"]
mod tests;
