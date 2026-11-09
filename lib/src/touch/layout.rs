//! Where the touch controls live on screen and when a pointer hits them.
//!
//! Both controls are anchored to the bottom corners: the joystick on the
//! left, the jump button on the right. Sizes scale with the screen height
//! and stay inside the screen for small landscape viewports.

/// The jump button's grab area is the button itself; the stick's is wider,
/// because thumbs rarely land dead centre.
pub(crate) const GRAB_FACTOR: f32 = 1.5;

/// Screen geometry for one frame: centres and radii of both controls, in screen pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct TouchLayout {
    pub(crate) joystick_center: (f32, f32),
    pub(crate) joystick_radius: f32,
    pub(crate) joystick_grab_radius: f32,
    pub(crate) knob_radius: f32,
    pub(crate) jump_center: (f32, f32),
    pub(crate) jump_radius: f32,
}

impl TouchLayout {
    /// The layout for a `width` × `height` viewport.
    pub(crate) fn new(width: f32, height: f32) -> Self {
        let scale = (height / 600.0).clamp(0.75, 1.4);
        let margin = 84.0 * scale;
        let joystick_radius = 60.0 * scale;
        Self {
            joystick_center: (margin, height - margin),
            joystick_radius,
            joystick_grab_radius: joystick_radius * GRAB_FACTOR,
            knob_radius: 24.0 * scale,
            jump_center: (width - margin, height - margin),
            jump_radius: 44.0 * scale,
        }
    }

    /// Whether `(x, y)` lands inside the stick's generous grab area.
    pub(crate) fn grab_hit(&self, x: f32, y: f32) -> bool {
        distance(self.joystick_center, (x, y)) <= self.joystick_grab_radius
    }

    /// Whether `(x, y)` lands inside the jump button.
    pub(crate) fn jump_hit(&self, x: f32, y: f32) -> bool {
        distance(self.jump_center, (x, y)) <= self.jump_radius
    }
}

fn distance(a: (f32, f32), b: (f32, f32)) -> f32 {
    (a.0 - b.0).hypot(a.1 - b.1)
}

#[cfg(test)]
#[path = "layout.test.rs"]
mod tests;
