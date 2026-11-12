//! Cloud shadows drifting over the world.

use macroquad::prelude::*;

/// The path the pattern is loaded from, relative to the client root.
pub const CLOUD_SHADOW_SOURCE: &str = "content/images/cloud-shadow.png";

/// How many tiles the pattern repeats over, along both screen axes.
pub const CLOUD_PERIOD_TILES: f64 = 12.0;

/// Opacity of the whole pattern: one flat shade, so overlapping clouds never add up.
pub const CLOUD_SHADOW_ALPHA: f32 = 0.18;

/// How fast the clouds drift, as a fraction of a tile per real second: `x` across the screen,
pub const CLOUD_DRIFT: (f64, f64) = (2.0 / 40.0, 0.5 / 20.0);

/// The drifting pattern of cloud shadows, and the texture it is drawn from.
pub struct CloudShadows {
    texture: Texture2D,
    /// How far the pattern has drifted, in tiles: `x` across the screen, `y` down it.
    drift: (f64, f64),
}

impl CloudShadows {
    /// The pattern at rest, drawn from `texture`.
    pub fn new(texture: Texture2D) -> Self {
        texture.set_filter(FilterMode::Linear);
        Self {
            texture,
            drift: (0.0, 0.0),
        }
    }

    /// Moves the clouds on by `elapsed_ms` of real time.
    pub fn advance(&mut self, elapsed_ms: f64) {
        self.drift.0 += CLOUD_DRIFT.0 * elapsed_ms / 1000.0;
        self.drift.1 += CLOUD_DRIFT.1 * elapsed_ms / 1000.0;
        self.drift.0 %= CLOUD_PERIOD_TILES;
        self.drift.1 %= CLOUD_PERIOD_TILES;
    }

    /// Draws the pattern over the view, as many copies as it takes to cover it.
    pub fn draw(&self, origin: (f64, f64), tile: (f64, f64), screen: (f64, f64)) {
        let period = (CLOUD_PERIOD_TILES * tile.0, CLOUD_PERIOD_TILES * tile.1);
        let colour = Color::new(0.0, 0.0, 0.0, CLOUD_SHADOW_ALPHA);
        for (x, y) in cloud_copies(
            (
                origin.0 - self.drift.0 * tile.0,
                origin.1 - self.drift.1 * tile.1,
            ),
            period,
            screen,
        ) {
            draw_texture_ex(
                &self.texture,
                x as f32,
                y as f32,
                colour,
                DrawTextureParams {
                    dest_size: Some(vec2(period.0 as f32, period.1 as f32)),
                    ..Default::default()
                },
            );
        }
    }
}

/// Where each copy of the pattern goes to cover a `screen`-sized view, given one copy's top left
pub fn cloud_copies(anchor: (f64, f64), period: (f64, f64), screen: (f64, f64)) -> Vec<(f64, f64)> {
    if !(period.0 > 0.0 && period.1 > 0.0) {
        return Vec::new();
    }
    let start = |anchor: f64, period: f64| anchor - (anchor / period).ceil() * period;
    let (first_x, first_y) = (start(anchor.0, period.0), start(anchor.1, period.1));
    let mut copies = Vec::new();
    let mut y = first_y;
    while y < screen.1 {
        let mut x = first_x;
        while x < screen.0 {
            copies.push((x, y));
            x += period.0;
        }
        y += period.1;
    }
    copies
}

#[cfg(test)]
#[path = "cloud_shadows.test.rs"]
mod tests;
