//! The chips a blow knocks off what is being gathered: shapes of the player's dust, coloured by
//! the item it yields, and where on the target they burst from.

use crate::grid::WorldCoord;
use crate::player::{DUST_ALPHA, DUST_COLORS, DUST_MS, DustShape};
use crate::projection::GridPoint;

/// Share of the way from the target's cell towards the player at which a blow lands.
pub const STRIKE_REACH: f64 = 0.35;

/// Blocks above the target's base at which a blow lands: about the height of the hands.
pub const STRIKE_LIFT: f64 = 0.45;

/// `color` darkened to 60 %, the shaded side of a chip.
pub fn darker(color: u32) -> u32 {
    let scale = |shift: u32| (((color >> shift) & 0xff) * 3 / 5) << shift;
    scale(16) | scale(8) | scale(0)
}

/// The burst of one blow: a few small chips thrown back towards the player and up.
pub fn strike_chips(color: u32) -> DustShape {
    DustShape {
        voxels: 7,
        radius: (0.02, 0.08),
        drift: (0.12, 0.26),
        size: (0.03, 0.06),
        lift: 0.18,
        rise: 0.2,
        kick: 0.35,
        colors: (color, darker(color)),
        ms: DUST_MS,
        alpha: DUST_ALPHA,
    }
}

/// [`strike_chips`] of an item that may not declare a colour; without one, plain dust.
pub fn strike_chips_of(color: Option<u32>) -> DustShape {
    match color {
        Some(color) => strike_chips(color),
        None => DustShape {
            colors: DUST_COLORS,
            ..strike_chips(0)
        },
    }
}

/// The burst of the last blow, when the target gives way: more chips, wider and longer.
pub fn felled_chips(color: u32) -> DustShape {
    DustShape {
        voxels: 16,
        radius: (0.05, 0.25),
        drift: (0.2, 0.45),
        size: (0.04, 0.08),
        lift: 0.3,
        rise: 0.3,
        kick: 0.1,
        ms: DUST_MS * 1.4,
        ..strike_chips(color)
    }
}

/// Where a blow on the target anchored at `cell` lands, for a player whose feet are at `feet`:
/// [`STRIKE_REACH`] of the way from the cell's centre towards the feet.
pub fn strike_point(cell: WorldCoord, feet: GridPoint) -> GridPoint {
    let (x, y) = (f64::from(cell.x), f64::from(cell.y));
    GridPoint {
        x: x + (feet.x - x) * STRIKE_REACH,
        y: y + (feet.y - y) * STRIKE_REACH,
    }
}

#[cfg(test)]
#[path = "chips.test.rs"]
mod tests;
