//! Debris: how an entity is built from the pieces of the voxel kit, and how those pieces fly
//! apart when it is gathered.

pub mod blast;
pub mod fall;
pub mod parts;

pub use blast::*;
pub use fall::*;
pub use parts::*;
