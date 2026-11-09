//! The authored lighting phases, one of which the client bakes at a time.

use super::shadow::ShadowProjection;

/// A phase's sun and how strongly its shadows read.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PhaseLight {
    pub shadow: ShadowProjection,
    pub shadow_strength: f64,
}

impl PhaseLight {
    /// The opacity its shadows are drawn at, which is all the two numbers are ever used for
    pub fn opacity(&self) -> f64 {
        self.shadow.alpha * self.shadow_strength
    }
}

/// An authored phase that can be selected for a shadow bake.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BakePhase {
    Dawn,
    Day,
    Sunset,
    Night,
}

impl BakePhase {
    /// The Spanish label the client presents for this phase.
    pub const fn label(self) -> &'static str {
        match self {
            Self::Dawn => "AMANECER",
            Self::Day => "DIA",
            Self::Sunset => "ATARDECER",
            Self::Night => "NOCHE",
        }
    }

    /// The light configuration baked for this phase.
    pub const fn light(self) -> PhaseLight {
        match self {
            Self::Dawn => DAWN,
            Self::Day => DAY,
            Self::Sunset => SUNSET,
            Self::Night => NIGHT,
        }
    }
}

/// Sunrise: the sun low in the east, so shadows run long and almost straight along world `−x`.
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
