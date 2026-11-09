//! The touch controls' state machine: one tracked stick touch, a set of jump touches.
//!
//! The platform adapter feeds raw touches in; `update` assigns each `Started`
//! touch to the control whose hit area it landed in (jump wins over the stick,
//! so a tap on the button never walks), keeps owners until `Ended`/`Cancelled`,
//! and reports one [`TouchFrame`] per call. Drawing lives here too but is kept
//! to macroquad calls with no decisions; the rules are all in `layout`/`stick`
//! and in the tests.

use iso::projection::GridPoint;
use macroquad::prelude::*;

use super::layout::TouchLayout;
use super::stick::{StickReading, clamp_offset, stick_reading};

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
}

const JUMP_FILL: Color = Color::from_rgba(255, 255, 255, 46);
const JUMP_RING: Color = Color::from_rgba(255, 255, 255, 160);
const JUMP_LABEL: Color = Color::from_rgba(255, 255, 255, 230);
const STICK_FILL: Color = Color::from_rgba(255, 255, 255, 28);
const STICK_RING: Color = Color::from_rgba(255, 255, 255, 110);
const KNOB_IDLE: Color = Color::from_rgba(255, 255, 255, 170);
const KNOB_RUN: Color = Color::from_rgba(255, 150, 60, 220);

/// The touch controls: visibility, the tracked stick touch and the owned jump touches.
pub(crate) struct TouchControls {
    visible: bool,
    joystick_id: Option<u64>,
    joystick_offset: (f32, f32),
    run_active: bool,
    jump_ids: Vec<u64>,
}

impl TouchControls {
    /// `coarse_pointer` is the platform hint (false on the desktop); the first
    /// touch flips it on for the rest of the process.
    pub(crate) fn new(coarse_pointer: bool) -> Self {
        Self {
            visible: coarse_pointer,
            joystick_id: None,
            joystick_offset: (0.0, 0.0),
            run_active: false,
            jump_ids: Vec::new(),
        }
    }

    /// Whether the controls are shown: either the platform reports a coarse
    /// pointer, or the player has touched the screen at least once.
    pub(crate) fn visible(&self) -> bool {
        self.visible
    }

    /// Advances the controls with this frame's touches and returns what they ask for.
    pub(crate) fn update(&mut self, width: f32, height: f32, touches: &[RawTouch]) -> TouchFrame {
        let layout = TouchLayout::new(width, height);
        if !touches.is_empty() {
            self.visible = true;
        }

        let mut jump_pressed = false;
        for touch in touches {
            if touch.phase != RawTouchPhase::Started {
                continue;
            }
            if layout.jump_hit(touch.x, touch.y) {
                if !self.jump_ids.contains(&touch.id) {
                    self.jump_ids.push(touch.id);
                    jump_pressed = true;
                }
            } else if layout.grab_hit(touch.x, touch.y) && self.joystick_id.is_none() {
                self.joystick_id = Some(touch.id);
                self.joystick_offset = knob_offset(touch, &layout);
            }
        }
        self.jump_ids.retain(|id| {
            touches.iter().any(|t| {
                t.id == *id && !matches!(t.phase, RawTouchPhase::Ended | RawTouchPhase::Cancelled)
            })
        });

        let reading = match self.joystick_id {
            Some(id) => match touches.iter().find(|t| t.id == id) {
                Some(touch)
                    if !matches!(touch.phase, RawTouchPhase::Ended | RawTouchPhase::Cancelled) =>
                {
                    let dx = f64::from(touch.x - layout.joystick_center.0);
                    let dy = f64::from(touch.y - layout.joystick_center.1);
                    self.joystick_offset = knob_offset(touch, &layout);
                    let reading = stick_reading(dx, dy, f64::from(layout.joystick_radius));
                    self.run_active = reading.run;
                    reading
                }
                _ => {
                    self.release_stick();
                    StickReading::default()
                }
            },
            None => {
                self.run_active = false;
                StickReading::default()
            }
        };

        TouchFrame {
            walk: reading.walk,
            magnitude: reading.magnitude,
            run: reading.run,
            jump_pressed,
            jump_held: !self.jump_ids.is_empty(),
        }
    }

    /// Paints the controls. Call it last, over the overlay; no-op when hidden.
    pub(crate) fn draw(&self) {
        if !self.visible {
            return;
        }
        let width = screen_width();
        let height = screen_height();
        let layout = TouchLayout::new(width, height);
        let (jx, jy) = layout.joystick_center;
        draw_circle(jx, jy, layout.joystick_radius, STICK_FILL);
        draw_circle_lines(jx, jy, layout.joystick_radius, 2.0, STICK_RING);
        let knob = if self.run_active { KNOB_RUN } else { KNOB_IDLE };
        draw_circle(
            jx + self.joystick_offset.0,
            jy + self.joystick_offset.1,
            layout.knob_radius,
            knob,
        );
        let (bx, by) = layout.jump_center;
        draw_circle(bx, by, layout.jump_radius, JUMP_FILL);
        draw_circle_lines(bx, by, layout.jump_radius, 2.0, JUMP_RING);
        let label = "SALTAR";
        let size = layout.jump_radius * 0.42;
        let measured = measure_text(label, None, size as u16, 1.0);
        draw_text(
            label,
            bx - measured.width * 0.5,
            by + size * 0.35,
            size,
            JUMP_LABEL,
        );
    }

    fn release_stick(&mut self) {
        self.joystick_id = None;
        self.joystick_offset = (0.0, 0.0);
        self.run_active = false;
    }
}

fn knob_offset(touch: &RawTouch, layout: &TouchLayout) -> (f32, f32) {
    let (x, y) = clamp_offset(
        f64::from(touch.x - layout.joystick_center.0),
        f64::from(touch.y - layout.joystick_center.1),
        f64::from(layout.joystick_radius),
    );
    (x as f32, y as f32)
}

#[cfg(test)]
#[path = "controls.test.rs"]
mod tests;
