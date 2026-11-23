//! The hotbar: the inventory slots along the bottom of the screen, the progress bar of a
//! harvest under way and the note of what the last harvest gave.
//!
//! The layout, the labels and the progress are pure and tested in `hotbar.test.rs`; `draw_hotbar`
//! only paints them with Macroquad and is checked by eye with a scene run (`scenes/pr-harvest.json`).

use iso::harvest::HarvestStatus;
use iso::inventory::{Carried, ItemStack};
use iso::items::{HarvestYield, ItemCatalog};
use macroquad::prelude::*;

/// The progress bar of a harvest under way (share 0–1).
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Prompt {
    pub(crate) progress: f32,
}

/// Largest side of one slot, in screen pixels.
pub(crate) const SLOT_SIZE: f32 = 54.0;
/// Gap between two slots.
pub(crate) const SLOT_GAP: f32 = 6.0;
/// Space between the bar and the screen's edges.
pub(crate) const SLOT_MARGIN: f32 = 24.0;
/// How long the note of a harvest stays up, in milliseconds.
pub(crate) const GAIN_NOTE_MS: f64 = 1600.0;

/// One slot's square on screen.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct SlotRect {
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) size: f32,
}

/// The squares of `capacity` slots in a row centred along the bottom of a `width` × `height`
/// screen, shrunk when the row would not fit between the margins.
pub(crate) fn slot_rects(width: f32, height: f32, capacity: usize) -> Vec<SlotRect> {
    let count = capacity.max(1) as f32;
    let room = (width - 2.0 * SLOT_MARGIN).max(0.0);
    let size = SLOT_SIZE
        .min((room - SLOT_GAP * (count - 1.0)) / count)
        .max(8.0);
    let row = size * count + SLOT_GAP * (count - 1.0);
    let left = (width - row) / 2.0;
    let y = height - SLOT_MARGIN - size;
    (0..capacity)
        .map(|index| SlotRect {
            x: left + index as f32 * (size + SLOT_GAP),
            y,
            size,
        })
        .collect()
}

/// A stack's name and count as the slot writes them.
pub(crate) fn slot_label(stack: &ItemStack, items: &ItemCatalog) -> (String, String) {
    let name = items
        .item(&stack.item)
        .map_or_else(|| stack.item.clone(), |def| def.name.clone());
    (name, stack.count.to_string())
}

/// The harvest's progress while it is under way (share 0–1).
pub(crate) fn prompt(status: &HarvestStatus) -> Option<Prompt> {
    match status {
        HarvestStatus::Working {
            progress, total, ..
        } => Some(Prompt {
            progress: *progress as f32 / (*total).max(1) as f32,
        }),
        HarvestStatus::Idle
        | HarvestStatus::Done { .. }
        | HarvestStatus::Ready { .. }
        | HarvestStatus::Approaching { .. }
        | HarvestStatus::Blocked { .. } => None,
    }
}

/// The note a pick-up leaves when something in reach did not fit.
pub(crate) const FULL_NOTE: &str = "Inventario lleno";

/// The note of what a harvest gave: `+3 Madera`, one entry per yield.
pub(crate) fn gain_text(yields: &[HarvestYield], items: &ItemCatalog) -> String {
    yields
        .iter()
        .map(|y| {
            let name = items
                .item(&y.item)
                .map_or(y.item.as_str(), |def| def.name.as_str());
            format!("+{} {name}", y.amount)
        })
        .collect::<Vec<_>>()
        .join("  ")
}

/// Writes `text` centred on `centre_x` with its baseline at `y`.
fn draw_centred(text: &str, centre_x: f32, y: f32, size: u16, color: Color) {
    let measured = measure_text(text, None, size, 1.0);
    draw_text(
        text,
        centre_x - measured.width / 2.0,
        y,
        f32::from(size),
        color,
    );
}

/// Paints the slots, the progress bar while the harvest is under way and the note of the last
/// harvest.
pub(crate) fn draw_hotbar(
    carried: &Carried,
    items: &ItemCatalog,
    prompt: Option<&Prompt>,
    note: Option<&str>,
) {
    let width = screen_width();
    let rects = slot_rects(width, screen_height(), carried.inventory.capacity());
    let panel = Color::from_rgba(14, 20, 30, 190);
    let edge = Color::from_rgba(150, 190, 220, 200);
    for (rect, slot) in rects.iter().zip(carried.inventory.slots()) {
        draw_rectangle(rect.x, rect.y, rect.size, rect.size, panel);
        draw_rectangle_lines(rect.x, rect.y, rect.size, rect.size, 2.0, edge);
        if let Some(stack) = slot {
            let (name, count) = slot_label(stack, items);
            let centre = rect.x + rect.size / 2.0;
            draw_centred(&name, centre, rect.y + rect.size * 0.42, 14, WHITE);
            draw_centred(&count, centre, rect.y + rect.size * 0.82, 18, YELLOW);
        }
    }
    let Some(first) = rects.first() else { return };
    let mut top = first.y - 12.0;
    if let Some(prompt) = prompt {
        let bar_width = 160.0;
        let left = (width - bar_width) / 2.0;
        draw_rectangle(left, top - 10.0, bar_width, 10.0, panel);
        draw_rectangle(
            left,
            top - 10.0,
            bar_width * prompt.progress.clamp(0.0, 1.0),
            10.0,
            GREEN,
        );
        draw_rectangle_lines(left, top - 10.0, bar_width, 10.0, 1.5, edge);
        top -= 18.0;
    }
    if let Some(note) = note {
        draw_centred(note, width / 2.0, top, 22, YELLOW);
    }
}

#[cfg(test)]
#[path = "hotbar.test.rs"]
mod tests;
