//! Sunlight and the shadows it casts, with no graphics in sight.
//!
//! Everything here is arithmetic over screen pixels, world tiles and bytes of coverage, so the
//! shadows a scene gets can be tested without a window. The client owns the textures and the
//! draw order; this owns where a shadow goes.
//!
//! * [`shadow`] — the sun, and the one transform a shadow is built from.
//! * [`phases`] — the authored lighting phases; this client bakes [`phases::DAWN`].
//! * [`bake`] — a chunk's ground shadows, baked into a map of coverage.
//! * [`received`] — the shadows a standing sprite receives, as a lattice over its artwork.
//! * [`terrain`] — the shadow the ground casts, which is a horizon rather than a silhouette.
//! * [`faces`] — the ground's exposed vertical sides, the other surface a shadow lands on.

pub mod bake;
pub mod faces;
pub mod phases;
pub mod received;
pub mod shadow;
pub mod terrain;

pub use bake::*;
pub use faces::*;
pub use phases::*;
pub use received::*;
pub use shadow::*;
pub use terrain::*;
