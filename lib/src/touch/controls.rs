//! The touch controls' state machine: one floating stick and its gestures.
//!
//! The platform adapter feeds raw touches in. The first finger down becomes the stick and its
//! base appears under it; dragging walks (and runs past the threshold) while the finger stays
//! down. The same stick moves the player like the keyboard does, but analog: the walk vector
//! scales with the deflection. While the stick moves the player, a new touch anywhere on the
//! screen jumps, and a second one while still moving jumps again: the double jump. The game
//! tells the controls where the inventory button sits; a touch in it neither jumps nor places
//! the stick. Holding the stick still gathers. Other fingers are ignored while the stick is
//! down, except the jump touches. Releasing the stick stops the walk right away. Drawing the
//! plain fallback lives here too, as macroquad calls with no decisions; the rules are all in
//! `update` and in the tests.

use iso::projection::GridPoint;
use macroquad::prelude::*;

use super::layout::TouchLayout;
use super::stick::{clamp_offset, stick_reading};

/// How long the stick must rest in its dead zone before it gathers, in milliseconds.
pub(crate) const HOLD_MS: f64 = 300.0;

/// The lifecycle phase of one touch, mirroring macroquad's `TouchPhase` without it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RawTouchPhase {
    Started,
    Stationary,
    Moved,
    Ended,
    Cancelled,
}

/// One touch as the state machine sees it, in screen pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct RawTouch {
    pub(crate) id: u64,
    pub(crate) phase: RawTouchPhase,
    pub(crate) x: f32,
    pub(crate) y: f32,
}

/// What the touch controls produced this frame.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct TouchFrame {
    pub(crate) walk: GridPoint,
    pub(crate) magnitude: f64,
    pub(crate) run: bool,
    pub(crate) jump_pressed: bool,
    pub(crate) jump_held: bool,
    pub(crate) gather_held: bool,
}

/// Where the stick is drawn this frame and what it is doing.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct StickView {
    pub(crate) center: (f32, f32),
    pub(crate) knob: (f32, f32),
    pub(crate) radius: f32,
    pub(crate) knob_radius: f32,
    pub(crate) active: bool,
    pub(crate) run: bool,
    pub(crate) gathering: bool,
}

/// The finger that drives the stick.
#[derive(Clone, Copy, Debug)]
struct Stick {
    id: u64,
    center: (f32, f32),
    finger: (f32, f32),
    still_since_ms: f64,
}

/// The touch controls: visibility, the stick finger, the jump touches and the inventory block.
pub(crate) struct TouchControls {
    visible: bool,
    stick: Option<Stick>,
    run_active: bool,
    gathering: bool,
    /// The inventory button's rect: touches inside it neither jump nor place the stick.
    jump_block: Option<Rect>,
}

const STICK_FILL: Color = Color::from_rgba(255, 255, 255, 28);
const STICK_RING: Color = Color::from_rgba(255, 255, 255, 110);
const KNOB_IDLE: Color = Color::from_rgba(255, 255, 255, 170);
const KNOB_RUN: Color = Color::from_rgba(255, 150, 60, 220);

impl TouchControls {
    /// `coarse_pointer` is the platform hint (false on the desktop); the first
    /// touch flips it on for the rest of the process.
    pub(crate) fn new(coarse_pointer: bool) -> Self {
        Self {
            visible: coarse_pointer,
            stick: None,
            run_active: false,
            gathering: false,
            jump_block: None,
        }
    }

    /// Whether the controls are shown: either the platform reports a coarse
    /// pointer, or the player has touched the screen at least once.
    pub(crate) fn visible(&self) -> bool {
        self.visible
    }

    /// The rect the game paints the inventory button in: a touch inside it neither jumps nor
    /// places the stick — the game's inventory toggle is what it is for.
    pub(crate) fn set_jump_block(&mut self, rect: Option<Rect>) {
        self.jump_block = rect;
    }

    /// Whether `touch` lands on the inventory button's rect.
    fn jump_blocked(&self, touch: &RawTouch) -> bool {
        self.jump_block
            .is_some_and(|rect| rect.contains(Vec2::new(touch.x, touch.y)))
    }

    /// The rect the game paints the inventory button in: a touch inside it neither jumps nor
    /// places the stick — the game's inventory toggle is what it is for.
    pub(crate) fn set_jump_block(&mut self, rect: Option<Rect>) {
        self.jump_block = rect;
    }

    /// Whether `touch` lands on the inventory button's rect.
    fn jump_blocked(&self, touch: &RawTouch) -> bool {
        self.jump_block
            .is_some_and(|rect| rect.contains(Vec2::new(touch.x, touch.y)))
    }

    /// Advances the controls with this frame's touches at `now_ms` and returns what they ask for.
    pub(crate) fn update(
        &mut self,
        width: f32,
        height: f32,
        touches: &[RawTouch],
        now_ms: f64,
    ) -> TouchFrame {
        let layout = TouchLayout::new(width, height);
        if !touches.is_empty() {
            self.visible = true;
        }

        let mut jump_pressed = false;
        if self.stick.is_none()
            && let Some(touch) = touches.iter().find(|t| t.phase == RawTouchPhase::Started)
            && !self.jump_blocked(touch)
        {
            self.stick = Some(Stick {
                id: touch.id,
                center: (touch.x, touch.y),
                finger: (touch.x, touch.y),
                still_since_ms: now_ms,
            });
        }

        let Some(mut stick) = self.stick else {
            self.run_active = false;
            self.gathering = false;
            return TouchFrame::default();
        };
        let live = touches.iter().find(|t| {
            t.id == stick.id && !matches!(t.phase, RawTouchPhase::Ended | RawTouchPhase::Cancelled)
        });
        let Some(touch) = live else {
            self.stick = None;
            self.run_active = false;
            self.gathering = false;
            return TouchFrame::default();
        };

        stick.finger = (touch.x, touch.y);
        let pushed = stick_reading(
            f64::from(stick.finger.0 - stick.center.0),
            f64::from(stick.finger.1 - stick.center.1),
            f64::from(layout.radius),
        );
        if pushed.magnitude > 0.0 {
            stick.still_since_ms = now_ms;
            jump_pressed = touches.iter().any(|t| {
                t.phase == RawTouchPhase::Started && t.id != stick.id && !self.jump_blocked(t)
            });
        }
        let gathering = now_ms - stick.still_since_ms >= HOLD_MS;
        self.stick = Some(stick);
        self.run_active = pushed.run;
        self.gathering = gathering;
        TouchFrame {
            walk: pushed.walk,
            magnitude: pushed.magnitude,
            run: pushed.run,
            jump_pressed,
            jump_held: jump_pressed,
            jump_held: jump_pressed,
            gather_held: gathering,
        }
    }

    /// Where the stick is drawn: under the finger while one is down, resting in the corner
    /// otherwise.
    pub(crate) fn view(&self, width: f32, height: f32) -> StickView {
        let layout = TouchLayout::new(width, height);
        let (center, knob, active) = match self.stick {
            Some(stick) => {
                let (dx, dy) = (
                    stick.finger.0 - stick.center.0,
                    stick.finger.1 - stick.center.1,
                );
                let (kx, ky) = clamp_offset(f64::from(dx), f64::from(dy), f64::from(layout.radius));
                (
                    stick.center,
                    (stick.center.0 + kx as f32, stick.center.1 + ky as f32),
                    true,
                )
            }
            None => (layout.rest, layout.rest, false),
        };
        StickView {
            center,
            knob,
            radius: layout.radius,
            knob_radius: layout.knob_radius,
            active,
            run: self.run_active,
            gathering: self.gathering,
        }
    }

    /// Paints the plain stick, for when the UI kit is missing. Call it last, over the overlay;
    /// no-op when hidden or while the stick rests idle.
    pub(crate) fn draw(&self) {
        if !self.visible {
            return;
        }
        let view = self.view(screen_width(), screen_height());
        if !view.active {
            return;
        }
        let (cx, cy) = view.center;
        draw_circle(cx, cy, view.radius, STICK_FILL);
        draw_circle_lines(cx, cy, view.radius, 2.0, STICK_RING);
        let knob = if view.run { KNOB_RUN } else { KNOB_IDLE };
        draw_circle(view.knob.0, view.knob.1, view.knob_radius, knob);
    }
}

#[cfg(test)]
#[path = "controls.test.rs"]
mod tests;
