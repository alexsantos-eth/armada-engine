//! The touch controls' state machine: one floating stick and its gestures.
//!
//! The platform adapter feeds raw touches in. The first finger down becomes the stick and its
//! base appears under it; dragging walks (and runs past the threshold), and sliding past
//! `LOCK_REACH` locks the run that way until a finger slides back to the centre. The same stick
//! moves the player like the keyboard does, but analog: the walk vector scales with the
//! deflection. While the stick moves the player, a new touch anywhere on the screen jumps, and
//! a second one while still moving jumps again: the double jump. The game tells the controls
//! where the inventory button sits; a touch in it neither jumps nor places the stick. Holding
//! the stick still gathers. Other fingers are ignored while the stick is down, except the jump
//! touches. Letting go of a walking stick coasts the same way for `COAST_MS`; a touch while
//! coasting places the stick and keeps walking without jumping. Drawing the plain fallback
//! lives here too, as macroquad calls with no decisions; the rules are all in `update` and in
//! the tests.

use iso::projection::GridPoint;
use macroquad::prelude::*;

use super::layout::TouchLayout;
use super::stick::{DEADZONE, StickReading, clamp_offset, stick_reading};

/// How long the stick must rest in its dead zone before it gathers, in milliseconds.
pub(crate) const HOLD_MS: f64 = 300.0;
/// How long the player keeps walking the same way after the finger leaves a walking stick, in
/// milliseconds.
pub(crate) const COAST_MS: f64 = 300.0;
/// How far past the base centre, in stick radii, the finger must slide to lock the run.
pub(crate) const LOCK_REACH: f32 = 1.6;

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
    /// Where the sprint lock sits while the finger nears it or the run is locked.
    pub(crate) lock_at: Option<(f32, f32)>,
    pub(crate) locked: bool,
}

/// The finger that drives the stick.
#[derive(Clone, Copy, Debug)]
struct Stick {
    id: u64,
    center: (f32, f32),
    finger: (f32, f32),
    still_since_ms: f64,
    moved: bool,
    /// The walk a coast keeps while the stick is placed on it.
    carry: Option<StickReading>,
    /// What the stick asked for last frame.
    last: StickReading,
}

/// The run held by the sprint lock: the base, the unit direction and the finger touching it.
#[derive(Clone, Copy, Debug)]
struct Lock {
    center: (f32, f32),
    dir: (f32, f32),
    touch: Option<LockTouch>,
}

/// A finger on the locked stick: a slide back to the centre unlocks.
#[derive(Clone, Copy, Debug)]
struct LockTouch {
    id: u64,
    moved: bool,
    /// Whether it came down outside the dead zone, so reaching the centre is a slide back.
    from_outside: bool,
}

/// The walk the player keeps for a moment after the finger leaves a walking stick.
#[derive(Clone, Copy, Debug)]
struct Coast {
    reading: StickReading,
    until_ms: f64,
}

/// The touch controls: visibility, the stick finger and the jump touches.
pub(crate) struct TouchControls {
    visible: bool,
    stick: Option<Stick>,
    run_active: bool,
    gathering: bool,
    coast: Option<Coast>,
    lock: Option<Lock>,
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
            coast: None,
            lock: None,
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

        if self.lock.is_some() {
            return self.update_locked(&layout, touches, now_ms);
        }

        let mut jump_pressed = false;
        if self.stick.is_none()
            && let Some(touch) = touches.iter().find(|t| t.phase == RawTouchPhase::Started)
            && !self.jump_blocked(touch)
        {
            let carry = self
                .coast
                .take()
                .filter(|coast| now_ms <= coast.until_ms)
                .map(|coast| coast.reading);
            self.stick = Some(Stick {
                id: touch.id,
                center: (touch.x, touch.y),
                finger: (touch.x, touch.y),
                still_since_ms: now_ms,
                moved: false,
                carry,
                last: carry.unwrap_or_default(),
            });
        }

        let Some(mut stick) = self.stick else {
            self.run_active = false;
            self.gathering = false;
            let coast = self.coast.filter(|coast| now_ms <= coast.until_ms);
            self.coast = coast;
            return coast.map_or_else(TouchFrame::default, |coast| TouchFrame {
                walk: coast.reading.walk,
                magnitude: coast.reading.magnitude,
                run: coast.reading.run,
                ..TouchFrame::default()
            });
        };
        let live = touches.iter().find(|t| {
            t.id == stick.id && !matches!(t.phase, RawTouchPhase::Ended | RawTouchPhase::Cancelled)
        });
        let Some(touch) = live else {
            self.coast = (stick.last.magnitude > 0.0).then_some(Coast {
                reading: stick.last,
                until_ms: now_ms + COAST_MS,
            });
            self.stick = None;
            self.run_active = false;
            self.gathering = false;
            return TouchFrame {
                walk: stick.last.walk,
                magnitude: stick.last.magnitude,
                run: stick.last.run,
                jump_pressed,
                ..TouchFrame::default()
            };
        };

        stick.finger = (touch.x, touch.y);
        let (dx, dy) = (
            stick.finger.0 - stick.center.0,
            stick.finger.1 - stick.center.1,
        );
        let reach = dx.hypot(dy);
        if reach >= LOCK_REACH * layout.radius {
            self.stick = None;
            self.coast = None;
            self.gathering = false;
            self.lock = Some(Lock {
                center: stick.center,
                dir: (dx / reach, dy / reach),
                touch: Some(LockTouch {
                    id: stick.id,
                    moved: true,
                    from_outside: true,
                }),
            });
            let mut frame = self.update_locked(&layout, touches, now_ms);
            frame.jump_pressed |= jump_pressed;
            return frame;
        }
        let pushed = stick_reading(
            f64::from(stick.finger.0 - stick.center.0),
            f64::from(stick.finger.1 - stick.center.1),
            f64::from(layout.radius),
        );
        if pushed.magnitude > 0.0 {
            stick.moved = true;
            stick.still_since_ms = now_ms;
            stick.carry = None;
        }
        let reading = stick.carry.unwrap_or(pushed);
        stick.last = reading;
        if reading.magnitude > 0.0 {
            jump_pressed = touches.iter().any(|t| {
                t.phase == RawTouchPhase::Started && t.id != stick.id && !self.jump_blocked(t)
            });
        }
        let gathering = now_ms - stick.still_since_ms >= HOLD_MS;
        self.stick = Some(stick);
        self.run_active = reading.run;
        self.gathering = gathering;
        let StickReading {
            walk,
            magnitude,
            run,
        } = reading;
        TouchFrame {
            walk,
            magnitude,
            run,
            jump_pressed,
            jump_held: jump_pressed,
            gather_held: gathering,
        }
    }

    /// Where the stick is drawn: under the finger while one is down, held on its rim while the run
    /// is locked, resting in the corner otherwise.
    pub(crate) fn view(&self, width: f32, height: f32) -> StickView {
        let layout = TouchLayout::new(width, height);
        let lock_point = |center: (f32, f32), dir: (f32, f32)| {
            let reach = LOCK_REACH * layout.radius;
            (center.0 + dir.0 * reach, center.1 + dir.1 * reach)
        };
        let (center, knob, active, lock_at, locked) = match (self.lock, self.stick) {
            (Some(lock), _) => (
                lock.center,
                (
                    lock.center.0 + lock.dir.0 * layout.radius,
                    lock.center.1 + lock.dir.1 * layout.radius,
                ),
                true,
                Some(lock_point(lock.center, lock.dir)),
                true,
            ),
            (None, Some(stick)) => {
                let (dx, dy) = (
                    stick.finger.0 - stick.center.0,
                    stick.finger.1 - stick.center.1,
                );
                let reach = dx.hypot(dy);
                let (kx, ky) = clamp_offset(f64::from(dx), f64::from(dy), f64::from(layout.radius));
                let hint = (reach >= layout.radius)
                    .then(|| lock_point(stick.center, (dx / reach, dy / reach)));
                (
                    stick.center,
                    (stick.center.0 + kx as f32, stick.center.1 + ky as f32),
                    true,
                    hint,
                    false,
                )
            }
            (None, None) => (layout.rest, layout.rest, false, None, false),
        };
        StickView {
            center,
            knob,
            radius: layout.radius,
            knob_radius: layout.knob_radius,
            active,
            run: self.run_active,
            gathering: self.gathering,
            lock_at,
            locked,
        }
    }

    /// The locked run: the player runs the lock's way; a new touch anywhere on the screen jumps
    /// (the double jump), sliding a finger past the rim steers the lock, and sliding it back to
    /// the centre unlocks and hands that finger back to the stick.
    fn update_locked(
        &mut self,
        layout: &TouchLayout,
        touches: &[RawTouch],
        now_ms: f64,
    ) -> TouchFrame {
        let Some(mut lock) = self.lock else {
            return TouchFrame::default();
        };
        let mut jump_pressed = false;
        if let Some(touch) = touches.iter().find(|t| t.phase == RawTouchPhase::Started)
            && !self.jump_blocked(touch)
        {
            jump_pressed = true;
            if lock.touch.is_none() {
                let (dx, dy) = (touch.x - lock.center.0, touch.y - lock.center.1);
                lock.touch = Some(LockTouch {
                    id: touch.id,
                    moved: false,
                    from_outside: dx.hypot(dy) > DEADZONE as f32 * layout.radius,
                });
            }
        }
        if let Some(mut held) = lock.touch {
            let live = touches.iter().find(|t| {
                t.id == held.id
                    && !matches!(t.phase, RawTouchPhase::Ended | RawTouchPhase::Cancelled)
            });
            match live {
                Some(touch) => {
                    let (dx, dy) = (touch.x - lock.center.0, touch.y - lock.center.1);
                    let reach = dx.hypot(dy);
                    if held.from_outside && reach <= DEADZONE as f32 * layout.radius {
                        self.lock = None;
                        self.run_active = false;
                        self.stick = Some(Stick {
                            id: held.id,
                            center: lock.center,
                            finger: (touch.x, touch.y),
                            still_since_ms: now_ms,
                            moved: true,
                            carry: None,
                            last: StickReading::default(),
                        });
                        return TouchFrame {
                            jump_pressed,
                            ..TouchFrame::default()
                        };
                    }
                    if reach >= layout.radius {
                        lock.dir = (dx / reach, dy / reach);
                        held.moved = true;
                    }
                    lock.touch = Some(held);
                }
                None => {
                    lock.touch = None;
                }
            }
        }
        self.lock = Some(lock);
        let reading = stick_reading(
            f64::from(lock.dir.0 * layout.radius),
            f64::from(lock.dir.1 * layout.radius),
            f64::from(layout.radius),
        );
        self.run_active = reading.run;
        self.gathering = false;
        TouchFrame {
            walk: reading.walk,
            magnitude: reading.magnitude,
            run: reading.run,
            jump_pressed,
            jump_held: jump_pressed,
            gather_held: false,
        }
    }

    /// Paints the plain stick, for when the UI kit is missing. Call it last, over the overlay;
    /// no-op when hidden.
    pub(crate) fn draw(&self) {
        if !self.visible {
            return;
        }
        let view = self.view(screen_width(), screen_height());
        let (cx, cy) = view.center;
        draw_circle(cx, cy, view.radius, STICK_FILL);
        draw_circle_lines(cx, cy, view.radius, 2.0, STICK_RING);
        if let Some((lx, ly)) = view.lock_at {
            draw_circle_lines(lx, ly, view.knob_radius * 0.6, 2.0, STICK_RING);
        }
        let knob = if view.run { KNOB_RUN } else { KNOB_IDLE };
        draw_circle(view.knob.0, view.knob.1, view.knob_radius, knob);
    }
}

#[cfg(test)]
#[path = "controls.test.rs"]
mod tests;
