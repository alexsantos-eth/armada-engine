//! Isometric draw keys; equal keys retain insertion order when sorted stably.

use std::cmp::Ordering;

/// Axis followed by a multi-tile footprint from its anchor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LengthAxis {
    X,
    Y,
}

/// Sort lower depths and layers first. Depth must be finite.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DrawKey {
    pub depth: f64,
    pub layer: i32,
}

/// Depth of a projected block or one tile of a footprint.
pub fn get_draw_depth(
    base_screen_y: f64,
    elevation: f64,
    x: f64,
    tile_height: f64,
    tile: i32,
    axis: LengthAxis,
) -> f64 {
    base_screen_y - f64::from(tile) * (tile_height / 2.0)
        + elevation * 0.001
        + (x + if axis == LengthAxis::X {
            f64::from(tile)
        } else {
            0.0
        }) * 0.0001
}

/// Ordering for stable sort. Inputs are finite projected depths from the scene.
pub fn compare_draw_keys(a: &DrawKey, b: &DrawKey) -> Ordering {
    a.depth
        .total_cmp(&b.depth)
        .then_with(|| a.layer.cmp(&b.layer))
}

#[cfg(test)]
#[path = "order.test.rs"]
mod tests;
