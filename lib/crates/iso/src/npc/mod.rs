//! Non-player characters: who lives where, and the wander that moves them.

pub mod crowd;
pub mod look;
pub mod spawn;
pub mod wander;
pub use crowd::*;
pub use look::*;
pub use spawn::*;
pub use wander::*;
