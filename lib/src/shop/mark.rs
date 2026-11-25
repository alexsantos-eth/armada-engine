//! The icon that floats over a market: where it sits, how big it is and how it bobs. No text:
//! it only says "here is a market". Pure; tested in `mark.test.rs`.

use macroquad::math::Rect;

/// Real milliseconds of one bob.
pub(crate) const BOB_MS: f64 = 1500.0;
/// How far, in pixels, the icon rises and falls from its resting height.
const BOB_PX: f32 = 7.0;
/// How much bigger the icon pulses while the player is at the market, at most.
const NEAR_PULSE: f32 = 0.14;
/// How much of the market's tile width the icon takes, and its limits in pixels.
const SIDE_OF_TILE: f32 = 0.32;
const SIDE_LIMITS: (f32, f32) = (22.0, 46.0);

/// One market on screen this frame: where its icon rests.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct MarketMark {
    /// The icon's centre at rest, in screen pixels.
    pub(crate) at: (f32, f32),
    /// The icon's side in pixels.
    pub(crate) side: f32,
    /// Whether the player is within reach of this market.
    pub(crate) near: bool,
}

/// How the icon is posed at an instant.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct MarkPose {
    /// Pixels the icon is lifted above its resting place (negative: lower).
    pub(crate) lift: f32,
    pub(crate) scale: f32,
}

/// The side of an icon on a screen whose tiles are `tile_width` wide.
pub(crate) fn mark_side(tile_width: f32) -> f32 {
    (tile_width * SIDE_OF_TILE).clamp(SIDE_LIMITS.0, SIDE_LIMITS.1)
}

/// The icon's pose `clock_ms` into the game; `phase` (any number) keeps two markets from
/// bobbing together. Near the market it bobs faster and pulses.
pub(crate) fn mark_pose(clock_ms: f64, phase: f32, near: bool) -> MarkPose {
    let speed = if near { 1.8 } else { 1.0 };
    let turn = (clock_ms * speed / BOB_MS) as f32 * std::f32::consts::TAU + phase;
    MarkPose {
        lift: turn.sin() * BOB_PX,
        scale: if near {
            1.0 + NEAR_PULSE * (turn.cos() * 0.5 + 0.5)
        } else {
            1.0
        },
    }
}

/// The square of an icon resting at `at`, for the press that opens the market.
pub(crate) fn mark_rect(mark: &MarketMark) -> Rect {
    Rect::new(
        mark.at.0 - mark.side / 2.0,
        mark.at.1 - mark.side / 2.0,
        mark.side,
        mark.side,
    )
}

#[cfg(test)]
#[path = "mark.test.rs"]
mod tests;
