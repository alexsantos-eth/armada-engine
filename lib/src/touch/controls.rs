//! The touch controls' state machine: one floating stick and its gestures.
//!
//! The platform adapter feeds raw touches in. The first finger down becomes the stick and its
//! base appears under it; dragging walks (and runs past the threshold), and sliding past
//! `LOCK_REACH` locks the run that way until a finger slides back to the centre (while locked,
//! a tap jumps and another tap jumps again in the air). The same finger carries the other actions: held
//! still it gathers, and taps chain into jumps (the second tap of a quick chain jumps, the third
//! jumps again in the air). Letting go of a walking stick coasts the same way for `COAST_MS`, and
//! a touch inside that window jumps that way and keeps walking it until the finger moves, so one
//! thumb can run and jump. Other fingers are ignored while the stick is down. Drawing the
//! plain fallback lives here too, as macroquad calls with no decisions; the rules are all in
//! `update` and in the tests.

use iso::projection::GridPoint;
use macroquad::prelude::*;

use super::layout::TouchLayout;
use super::stick::{DEADZONE, StickReading, clamp_offset, stick_reading};

/// How long the stick must rest in its dead zone before it gathers, in milliseconds.
pub(crate) const HOLD_MS: f64 = 300.0;
/// The longest touch that still counts as a tap, in milliseconds.
pub(crate) const TAP_MS: f64 = 250.0;
/// The longest gap between a tap and the next touch for both to chain, in milliseconds.
pub(crate) const TAP_GAP_MS: f64 = 320.0;
/// How long the player keeps walking the same way after the finger leaves a walking stick, in
/// milliseconds; a touch inside that window jumps that way.
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
    started_ms: f64,
    still_since_ms: f64,
    moved: bool,
    jumping: bool,
    /// The walk a jump out of a coast keeps until the finger moves the stick.
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

/// A finger on the locked stick: a tap jumps, a slide back to the centre unlocks.
#[derive(Clone, Copy, Debug)]
struct LockTouch {
    id: u64,
    started_ms: f64,
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

/// The touch controls: visibility, the stick finger and the tap chain.
pub(crate) struct TouchControls {
    visible: bool,
    stick: Option<Stick>,
    run_active: bool,
    gathering: bool,
    taps: u32,
    last_tap_ms: Option<f64>,
    coast: Option<Coast>,
    lock: Option<Lock>,
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
            taps: 0,
            last_tap_ms: None,
            coast: None,
            lock: None,
        }
    }

    /// Whether the controls are shown: either the platform reports a coarse
    /// pointer, or the player has touched the screen at least once.
    pub(crate) fn visible(&self) -> bool {
        self.visible
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
        {
            let carry = self
                .coast
                .take()
                .filter(|coast| now_ms <= coast.until_ms)
                .map(|coast| coast.reading);
            let chained = self
                .last_tap_ms
                .is_some_and(|tap| now_ms - tap <= TAP_GAP_MS);
            self.taps = match (carry, chained) {
                (Some(_), _) => 2,
                (None, true) => self.taps + 1,
                (None, false) => 1,
            };
            let jumping = self.taps >= 2;
            jump_pressed = jumping;
            self.stick = Some(Stick {
                id: touch.id,
                center: (touch.x, touch.y),
                finger: (touch.x, touch.y),
                started_ms: now_ms,
                still_since_ms: now_ms,
                moved: false,
                jumping,
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
            let tap = !stick.moved && now_ms - stick.started_ms <= TAP_MS;
            self.last_tap_ms = tap.then_some(now_ms);
            if !tap {
                self.taps = 0;
            }
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
                    started_ms: stick.started_ms,
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
        let gathering = !stick.jumping && now_ms - stick.still_since_ms >= HOLD_MS;
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
            jump_held: stick.jumping,
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

    /// The locked run: the player runs the lock's way; a tap on the screen jumps (again in the
    /// air), sliding a finger past the rim steers the lock, and sliding it back to the centre
    /// unlocks and hands that finger back to the stick.
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
        if lock.touch.is_none()
            && let Some(touch) = touches.iter().find(|t| t.phase == RawTouchPhase::Started)
        {
            let (dx, dy) = (touch.x - lock.center.0, touch.y - lock.center.1);
            lock.touch = Some(LockTouch {
                id: touch.id,
                started_ms: now_ms,
                moved: false,
                from_outside: dx.hypot(dy) > DEADZONE as f32 * layout.radius,
            });
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
                        self.taps = 0;
                        self.last_tap_ms = None;
                        self.stick = Some(Stick {
                            id: held.id,
                            center: lock.center,
                            finger: (touch.x, touch.y),
                            started_ms: now_ms,
                            still_since_ms: now_ms,
                            moved: true,
                            jumping: false,
                            carry: None,
                            last: StickReading::default(),
                        });
                        return TouchFrame::default();
                    }
                    if reach >= layout.radius {
                        lock.dir = (dx / reach, dy / reach);
                        held.moved = true;
                    }
                    lock.touch = Some(held);
                }
                None => {
                    jump_pressed = !held.moved && now_ms - held.started_ms <= TAP_MS;
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
