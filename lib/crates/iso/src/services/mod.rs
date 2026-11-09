//! Application-edge services: input, audio, UI and chunk loading.
//!
//! These are contracts the Macroquad client implements. The core crate defines them so the
//! domain can describe what it needs without depending on Macroquad, the DOM or the GPU.
//!
//! The leaf files intentionally contain only traits and data declarations. Their behavior is
//! tested by concrete adapters in the client; they do not need standalone unit-test modules.

pub mod input;
pub mod audio;
pub mod ui;
pub mod chunk_loader;

pub use input::*;
pub use audio::*;
pub use ui::*;
pub use chunk_loader::*;
