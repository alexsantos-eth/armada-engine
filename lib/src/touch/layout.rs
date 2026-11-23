//! Where the floating stick rests and how big it is.
//!
//! The stick has no fixed place while it is used: the first touch puts its base under the
//! thumb. When no finger is down it rests in the bottom-right corner, as a hint of where it
//! will be. Sizes scale with the screen height and stay inside small landscape viewports.

/// Screen geometry for one frame: where the stick rests and its radii, in screen pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct TouchLayout {
    pub(crate) rest: (f32, f32),
    pub(crate) radius: f32,
    pub(crate) knob_radius: f32,
}

impl TouchLayout {
    /// The layout for a `width` × `height` viewport.
    pub(crate) fn new(width: f32, height: f32) -> Self {
        let scale = (height / 600.0).clamp(0.75, 1.4);
        let margin = 96.0 * scale;
        Self {
            rest: (width - margin, height - margin),
            radius: 60.0 * scale,
            knob_radius: 28.0 * scale,
        }
    }
}

#[cfg(test)]
#[path = "layout.test.rs"]
mod tests;
