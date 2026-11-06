//! The authored lighting phases, and the one this client bakes.
//!
//! The TypeScript engine authors four sun positions (`core/engine/lighting/phases.ts`) and eases
//! between them when the game asks; it never derives them from the simulation clock. This client
//! bakes its shadows into a map per chunk, so it holds still at one phase: the shadows of a
//! phase are the same every frame, and changing phase would mean rebaking every chunk. Only
//! [`DAWN`] is wired up for now; the other three are kept here, with the same numbers, so the
//! phase a scene is lit by is a one-line change rather than a new set of constants.

use super::shadow::ShadowProjection;

/// A phase's sun and how strongly its shadows read.
///
/// `shadow_strength` is a presentation control over the same baked map: the opacity a shadow is
/// finally drawn at is `shadow.alpha * shadow_strength`, so dawn's long shadows can be softened
/// without rebaking anything.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PhaseLight {
    pub shadow: ShadowProjection,
    pub shadow_strength: f64,
}

impl PhaseLight {
    /// The opacity its shadows are drawn at, which is all the two numbers are ever used for
    /// together.
    pub fn opacity(&self) -> f64 {
        self.shadow.alpha * self.shadow_strength
    }
}

/// Sunrise: the sun low in the east, so shadows run long and almost straight along world `−x`.
///
/// `dir_y` is `√(1 − 0.92²)` written out, because a direction has to be a constant to be baked
/// into one; [`shadow_direction_is_a_unit_vector`](self) keeps it honest.
pub const DAWN: PhaseLight = PhaseLight {
    shadow: ShadowProjection {
        dir_x: -0.92,
        dir_y: 0.391_918_358_845_308_46,
        stretch: 2.2,
        alpha: 0.34,
    },
    shadow_strength: 0.85,
};

/// Midday: light from the upper right, short shadows at full strength.
pub const DAY: PhaseLight = PhaseLight {
    shadow: ShadowProjection {
        dir_x: -0.25,
        dir_y: 0.968_245_836_551_854_5,
        stretch: 1.15,
        alpha: 0.34,
    },
    shadow_strength: 1.0,
};

/// Sunset: the sun low in the south, shadows as long as dawn's and turned a quarter.
pub const SUNSET: PhaseLight = PhaseLight {
    shadow: ShadowProjection {
        dir_x: 0.936_749_699_759_759_8,
        dir_y: -0.35,
        stretch: 2.2,
        alpha: 0.34,
    },
    shadow_strength: 0.85,
};

/// Night: a dim moon, shadows short and faint.
pub const NIGHT: PhaseLight = PhaseLight {
    shadow: ShadowProjection {
        dir_x: 0.6,
        dir_y: 0.8,
        stretch: 0.85,
        alpha: 0.2,
    },
    shadow_strength: 0.55,
};

#[cfg(test)]
#[path = "phases.test.rs"]
mod tests;
