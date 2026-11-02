//! Asset manifest: a versioned description of the rasterized atlas and its sprites.
//!
//! The manifest is produced by the build pipeline (rasterizing the SVG sources) and consumed
//! by the Macroquad client. The core crate only deserializes and validates it; no rendering
//! happens here.

pub mod manifest;

pub use manifest::*;
