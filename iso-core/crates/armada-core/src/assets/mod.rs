//! Asset manifest: a versioned description of the rasterized atlas and its sprites.
//!
//! The manifest is produced by the build pipeline (rasterizing the SVG sources) and consumed
//! by the Macroquad client. The core crate only deserializes and validates it; no rendering
//! happens here.

pub mod ink;
pub mod layout;
pub mod manifest;
pub mod terrain_sprites;

pub use ink::*;
pub use layout::*;
pub use manifest::*;
pub use terrain_sprites::*;
