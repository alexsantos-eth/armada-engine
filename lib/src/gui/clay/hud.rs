//! The native HUD's animation state: the comic bubble, the gains flying to their slots, the
//! slots' bumps and the counts still in the air, from each frame's `UiFrame` and `UiGain`.
//! Pure; `draw.rs` paints it.

use std::collections::HashMap;

use super::frame::{UiFrame, UiGain};
use super::motion;

/// How far above the player's chest the bubble's tail points.
pub(crate) const BUBBLE_LIFT: f32 = 40.0;

/// What the bubble says.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum BubbleContent {
    Gain {
        item: String,
        name: String,
        amount: u32,
    },
    Warning(String),
}

/// The bubble on screen: what it says, the tip of its tail and how long it has been up. A
/// warning is placed over the bar when it is drawn (`x`, `y` unused).
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Bubble {
    pub(crate) content: BubbleContent,
    pub(crate) x: f32,
    pub(crate) y: f32,
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
    /// Whether the inventory panel is unfolded (mobile: the backpack icon was tapped).
    pub(crate) inventory_open: bool,
}

impl ClayHud {
    /// Takes this frame's HUD state and pick-ups on a screen of `size`: each gain pops the bubble
    /// over the player and starts a flight to the slot holding its item (or the first empty
    /// one); a new full-inventory note pops a warning.
    pub(crate) fn apply(&mut self, frame: &UiFrame, gains: &[UiGain], size: (f32, f32)) {
        for gain in gains {
            let from = (gain.x * size.0, gain.y * size.1);
            self.bubble = Some(Bubble {
                content: BubbleContent::Gain {
                    item: gain.item.clone(),
                    name: gain.name.clone(),
                    amount: gain.amount,
                },
                x: from.0,
                y: from.1 - BUBBLE_LIFT,
                age_ms: 0.0,
            });
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
                    x: 0.0,
                    y: 0.0,
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
