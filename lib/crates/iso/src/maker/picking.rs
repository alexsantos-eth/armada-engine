//! Which column a point on the screen falls on, as the eye reads the scene.

use std::ops::RangeInclusive;

use crate::grid::WorldCoord;
use crate::projection::{ProjectionConfig, ScreenPoint, unproject_screen_delta};

/// The column under `point`, or `None` when the point falls on no column.
///
/// Tops higher up the screen hide the ground behind them, so the search runs from the highest
/// level of `levels` down: for each level the point is unprojected as if it lay on a top at
/// that level, and the cell it lands in is a hit when `at` answers with that same level. `at`
/// gives the elevation of a column, or `None` where the world holds none.
pub fn pick_column(
    point: ScreenPoint,
    projection: ProjectionConfig,
    levels: RangeInclusive<i32>,
    at: impl Fn(WorldCoord) -> Option<i32>,
) -> Option<WorldCoord> {
    let step = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    let mut level = *levels.end();
    while level >= *levels.start() {
        let flat = unproject_screen_delta(
            ScreenPoint {
                x: point.x - projection.origin_x,
                y: point.y - projection.origin_y + f64::from(level) * step,
            },
            projection,
        );
        let cell = WorldCoord {
            x: flat.x.floor() as i32,
            y: flat.y.floor() as i32,
        };
        if at(cell) == Some(level) {
            return Some(cell);
        }
        level -= 1;
    }
    None
}

#[cfg(test)]
#[path = "picking.test.rs"]
mod tests;
