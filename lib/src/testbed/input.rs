//! The input a scripted run gives the player: the frame the script decided, and nothing read
//! from the keyboard or the screen.
//!
//! The run drives the player through the same port the keyboard and the touch controls use
//! ([`InputService`]), so the physics, the animation and the audio cannot tell the difference.

use iso::services::{InputService, NormalizedInput};

/// The input of one scripted frame.
pub(crate) struct ScriptInput {
    /// What the script decided this frame.
    pub(crate) frame: NormalizedInput,
}

impl InputService for ScriptInput {
    fn poll(&mut self) -> NormalizedInput {
        self.frame
    }
}

#[cfg(test)]
#[path = "input.test.rs"]
mod tests;
