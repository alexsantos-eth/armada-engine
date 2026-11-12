//! The rules of the world editor: the brush, what a stroke changes, and how to take it back.
//!
//! This domain owns the editing rules, not the overlay: the client reads the pointer and paints
//! the panel, and every decision a stroke takes lives here, testable without a window.

mod brush;
mod dressing;
mod edit;
mod history;
mod picking;

pub use brush::{MAKER_SURFACES, MAKER_TOOLS, MakerBrush, MakerTool, turned_blueprint};
pub use dressing::Dressing;
pub use edit::{MAKER_MAX_ELEVATION, MAKER_MIN_ELEVATION, MakerStroke, apply_brush};
pub use history::{ChunkSnapshot, History, restore, snapshot};
pub use picking::pick_column;
