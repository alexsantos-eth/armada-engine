//! The run's clockwork: which step a scripted frame is on, and what that frame does.
//!
//! One call per frame. Steps that only change the world are taken on the spot and the machine
//! moves on within the same frame; steps that move the player, let time pass or capture the
//! screen end it. A settle holds the frame until the client says the light is up to date.

use crate::lighting::BakePhase;
use crate::services::NormalizedInput;
use crate::testbed::scene::{SceneEdit, SceneStep, SceneTrade};

/// What one scripted frame does, for the client to carry out.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ScriptFrame {
    /// The input the player is given this frame.
    pub input: NormalizedInput,
    /// The phase the light is pinned to, when a step changed it.
    pub phase: Option<BakePhase>,
    /// The cell the player is put on, when a step moved it.
    pub teleport: Option<[i32; 2]>,
    /// The edits this frame makes to the world, in order.
    pub edits: Vec<SceneEdit>,
    /// What the player does at a merchant's shop this frame, in order.
    pub trade: Vec<SceneTrade>,
    /// The shots written after this frame is drawn.
    pub shots: Vec<String>,
    /// Whether the run is over: every step was taken, or the frame budget ran out.
    pub done: bool,
    /// Why the run stopped, when it stopped for a reason worth reporting.
    pub note: Option<String>,
}

/// A direction as the player's walk takes it: a unit vector, or still when it is neither.
fn unit(dir: [f64; 2]) -> crate::projection::GridPoint {
    let length = dir[0].hypot(dir[1]);
    if !length.is_finite() || length <= f64::EPSILON {
        return crate::projection::GridPoint { x: 0.0, y: 0.0 };
    }
    crate::projection::GridPoint {
        x: dir[0] / length,
        y: dir[1] / length,
    }
}

/// The steps of a run and where it has got to.
#[derive(Clone, Debug)]
pub struct Script {
    steps: Vec<SceneStep>,
    at: usize,
    /// Frames still owed by the step in hand, for the steps that span frames.
    left: u32,
    frames: u32,
    max_frames: u32,
    /// Whether the last frame held the gather key, which a shot right after it keeps held.
    gathering: bool,
}

impl Script {
    /// A run of `steps` that gives up after `max_frames`.
    pub fn new(steps: Vec<SceneStep>, max_frames: u32) -> Self {
        Self {
            steps,
            at: 0,
            left: 0,
            frames: 0,
            max_frames,
            gathering: false,
        }
    }

    /// How many frames the run has taken.
    pub const fn frames(&self) -> u32 {
        self.frames
    }

    /// Which step the run is on, counted from zero.
    pub const fn step(&self) -> usize {
        self.at
    }

    /// How many steps the run has.
    pub const fn steps(&self) -> usize {
        self.steps.len()
    }

    /// The frame to take now. `lit` is whether the client has the world on screen generated and
    /// its light baked; a settle waits for it.
    pub fn frame(&mut self, lit: bool) -> ScriptFrame {
        let frame = self.next_frame(lit);
        self.gathering = frame.input.gather_held;
        frame
    }

    /// The frame to take now, before the gather key is remembered for the shot after it.
    fn next_frame(&mut self, lit: bool) -> ScriptFrame {
        let mut frame = ScriptFrame::default();
        if self.frames >= self.max_frames {
            frame.done = true;
            frame.note = Some(format!(
                "the run stopped at step {} of {}: it reached its budget of {} frames",
                self.at + 1,
                self.steps.len(),
                self.max_frames
            ));
            return frame;
        }
        loop {
            let Some(step) = self.steps.get(self.at).cloned() else {
                frame.done = true;
                return frame;
            };
            match step {
                SceneStep::Phase(phase) => {
                    frame.phase = Some(phase.bake());
                    self.at += 1;
                }
                SceneStep::Teleport(at) => {
                    frame.teleport = Some(at);
                    self.at += 1;
                }
                SceneStep::Edit(edit) => {
                    frame.edits.push(edit);
                    self.at += 1;
                }
                SceneStep::Trade(step) => {
                    frame.trade.push(step);
                    self.at += 1;
                }
                SceneStep::Settle => {
                    if !lit {
                        self.frames += 1;
                        return frame;
                    }
                    self.at += 1;
                }
                SceneStep::Shot(name) => {
                    frame.shots.push(name);
                    frame.input.gather_held = self.gathering;
                    self.at += 1;
                    self.frames += 1;
                    return frame;
                }
                SceneStep::Jump => {
                    frame.input.jump_pressed = true;
                    frame.input.jump_held = true;
                    self.at += 1;
                    self.frames += 1;
                    return frame;
                }
                SceneStep::Jetpack => {
                    frame.input.jetpack_pressed = true;
                    self.at += 1;
                    self.frames += 1;
                    return frame;
                }
                SceneStep::Gather { frames } => {
                    if self.spend(frames) {
                        continue;
                    }
                    frame.input.gather_held = true;
                    self.frames += 1;
                    return frame;
                }
                SceneStep::Wait { frames } => {
                    if self.spend(frames) {
                        continue;
                    }
                    self.frames += 1;
                    return frame;
                }
                SceneStep::Walk { dir, frames, run } => {
                    if self.spend(frames) {
                        continue;
                    }
                    frame.input.walk = unit(dir);
                    frame.input.run = run;
                    self.frames += 1;
                    return frame;
                }
            }
        }
    }

    /// Spends one of the `frames` the step in hand owes, and says whether it owed none left, so
    /// the machine moves on to the next step.
    fn spend(&mut self, frames: u32) -> bool {
        if self.left == 0 {
            self.left = frames;
        }
        if self.left == 0 {
            self.at += 1;
            return true;
        }
        self.left -= 1;
        if self.left == 0 {
            self.at += 1;
        }
        false
    }
}

#[cfg(test)]
#[path = "script.test.rs"]
mod tests;
