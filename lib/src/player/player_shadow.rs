//! The simple ground shadow that follows the player.

use iso::projection::ScreenPoint;

/// The shadow's screen-space ellipse.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlayerShadow {
    pub centre: ScreenPoint,
    pub width: f64,
    pub height: f64,
    pub alpha: f32,
}

/// A small flattened shadow anchored to the player's supporting ground, fading as the player
/// rises above it.
pub fn player_shadow(ground: ScreenPoint, height: f64, tile_width: f64) -> PlayerShadow {
    let air = (height.max(0.0) / 3.0).clamp(0.0, 1.0);
    PlayerShadow {
        centre: ground,
        width: tile_width * (0.28 - air * 0.1),
        height: tile_width * (0.09 - air * 0.03),
        alpha: (0.28 - air as f32 * 0.14).max(0.0),
    }
}

#[cfg(test)]
#[path = "player_shadow.test.rs"]
mod tests;
