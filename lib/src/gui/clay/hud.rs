//! The native HUD's animation state: the warning bubble, the gains flying to their slots, the
//! slots' bumps and the counts still in the air, from each frame's `UiFrame` and `UiGain`.
//! Pure; `draw.rs` paints it.

use std::collections::HashMap;

use super::frame::{UiFrame, UiGain};
use super::layout::HudLayout;
use super::motion;

/// What the warning bubble says.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum BubbleContent {
    Warning(String),
}

/// The warning bubble on screen and how long it has been up.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Bubble {
    pub(crate) content: BubbleContent,
    pub(crate) age_ms: f64,
}

/// A gain on its way to slot `slot`, thrown from `from` (screen pixels).
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Flight {
    pub(crate) item: String,
    pub(crate) amount: u32,
    pub(crate) from: (f32, f32),
    pub(crate) slot: usize,
    pub(crate) age_ms: f64,
}

impl Flight {
    /// The screen point the flight animates to: the backpack icon when the inventory is the
    /// folded mobile one, otherwise the slot holding the item.
    pub(crate) fn destination(&self, layout: &HudLayout) -> Option<(f32, f32)> {
        if let Some(rect) = layout.backpack {
            return Some((rect.x + rect.w / 2.0, rect.y + rect.h / 2.0));
        }
        layout
            .slots
            .get(self.slot)
            .map(|rect| (rect.x + rect.w / 2.0, rect.y + rect.h / 2.0))
    }
}

/// Everything the native HUD animates.
#[derive(Debug, Default)]
pub(crate) struct ClayHud {
    pub(crate) bubble: Option<Bubble>,
    pub(crate) flights: Vec<Flight>,
    bumps: HashMap<usize, f64>,
    in_air: HashMap<String, u32>,
    note: Option<String>,
    /// Time since the HUD started, for looping animations.
    pub(crate) clock_ms: f64,
    /// Whether the action button is held this frame.
    pub(crate) held: bool,
    /// Whether the inventory panel is open (mobile: a finger is down on the backpack icon).
    pub(crate) inventory_open: bool,
}

impl ClayHud {
    /// Takes this frame's HUD state and pick-ups on a screen of `size`: each gain starts a
    /// flight to the slot holding its item (or the first empty one); a new full-inventory note
    /// pops a warning.
    pub(crate) fn apply(&mut self, frame: &UiFrame, gains: &[UiGain], size: (f32, f32)) {
        for gain in gains {
            let from = (gain.x * size.0, gain.y * size.1);
            let slot = frame
                .slots
                .iter()
                .position(|s| s.as_ref().is_some_and(|stack| stack.item == gain.item))
                .or_else(|| frame.slots.iter().position(Option::is_none))
                .unwrap_or(0);
            *self.in_air.entry(gain.item.clone()).or_default() += gain.amount;
            self.flights.push(Flight {
                item: gain.item.clone(),
                amount: gain.amount,
                from,
                slot,
                age_ms: 0.0,
            });
        }
        if frame.note != self.note {
            if let Some(text) = &frame.note {
                self.bubble = Some(Bubble {
                    content: BubbleContent::Warning(text.clone()),
                    age_ms: 0.0,
                });
            }
            self.note.clone_from(&frame.note);
        }
    }

    /// Ages everything by `elapsed_ms`: landed flights hand their count to the slot and bump
    /// it, and a bubble that has left is gone.
    pub(crate) fn advance(&mut self, elapsed_ms: f64) {
        self.clock_ms += elapsed_ms;
        if let Some(bubble) = self.bubble.as_mut() {
            bubble.age_ms += elapsed_ms;
            if motion::bubble_done(bubble.age_ms) {
                self.bubble = None;
            }
        }
        for age in self.bumps.values_mut() {
            *age += elapsed_ms;
        }
        self.bumps.retain(|_, age| *age < motion::BUMP_MS);
        let mut landed = Vec::new();
        self.flights.retain_mut(|flight| {
            flight.age_ms += elapsed_ms;
            let done = flight.age_ms >= motion::FLY_MS;
            if done {
                landed.push((flight.item.clone(), flight.amount, flight.slot));
            }
            !done
        });
        for (item, amount, slot) in landed {
            if let Some(left) = self.in_air.get_mut(&item) {
                *left = left.saturating_sub(amount);
                if *left == 0 {
                    self.in_air.remove(&item);
                }
            }
            self.bumps.insert(slot, 0.0);
        }
    }

    /// The count a slot shows: what it holds minus what is still flying to it.
    pub(crate) fn shown_count(&self, item: &str, count: u32) -> u32 {
        count.saturating_sub(self.in_air.get(item).copied().unwrap_or(0))
    }

    /// How long slot `slot` has been bumping, if it is.
    pub(crate) fn bump_age(&self, slot: usize) -> Option<f64> {
        self.bumps.get(&slot).copied()
    }
}

#[cfg(test)]
#[path = "hud.test.rs"]
mod tests;
