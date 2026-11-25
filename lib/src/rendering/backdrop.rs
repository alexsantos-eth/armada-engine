//! The blur behind an open menu: how many pixels of it the presentation applies this frame.
//! It eases in when a menu opens and out when it closes, so the world softens instead of
//! snapping. Pure; tested in `backdrop.test.rs`.

/// The blur, in pixels of the scene target, once a menu is fully open.
pub const MENU_BLUR_PX: f32 = 7.0;

/// Milliseconds the blur takes to go from clear to full (and back).
pub const FADE_MS: f32 = 180.0;

/// The blur `blur` pixels wide a frame of `frame_ms` later, heading for full while a menu is
/// `open` and for clear otherwise.
pub fn fade(blur: f32, open: bool, frame_ms: f64) -> f32 {
    let step = MENU_BLUR_PX * frame_ms as f32 / FADE_MS;
    if open {
        (blur + step).min(MENU_BLUR_PX)
    } else {
        (blur - step).max(0.0)
    }
}

#[cfg(test)]
#[path = "backdrop.test.rs"]
mod tests;
