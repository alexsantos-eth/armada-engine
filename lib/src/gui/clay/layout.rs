//! Where the HUD puts its pieces on every platform: one bottom row and the action button in the
//! corner on a desktop; with the touch controls on screen, the bar at the top (one slim row when
//! it fits, as on a landscape phone, else rows of six) and no action button (holding the stick
//! gathers). Pure; tested in `layout.test.rs`.

use macroquad::math::Rect;

/// Gap between the bottom of the screen and the bar.
pub(crate) const BOTTOM_MARGIN: f32 = 18.0;
/// Gap between the top of the screen and the bar with touch controls.
pub(crate) const TOP_MARGIN: f32 = 12.0;
/// Gap between the action button and the screen's corner on a desktop.
pub(crate) const ACTION_MARGIN: f32 = 28.0;
/// Gap between two slots.
pub(crate) const SLOT_GAP: f32 = 8.0;
/// Gap between the bar and the prompt.
const PROMPT_GAP: f32 = 16.0;
/// The bar's padding: sides, top and bottom.
const PANEL_PAD: (f32, f32, f32) = (12.0, 10.0, 12.0);
/// A slot is this much taller than wide.
pub(crate) const SLOT_ASPECT: f32 = 1.06;
/// The smallest and largest slot side of a single top row with touch controls; below the
/// smallest the bar wraps into rows of six.
const TOUCH_ROW_SLOT: (f32, f32) = (34.0, 44.0);
/// The action button's side on a desktop.
const ACTION_SIZE: f32 = 104.0;

/// The HUD's rectangles for one screen size.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct HudLayout {
    pub(crate) slot: f32,
    pub(crate) slots: Vec<Rect>,
    pub(crate) panel: Rect,
    /// The prompt's centre x and the y of its edge toward the bar (bottom on a desktop, top
    /// with touch controls).
    pub(crate) prompt_anchor: (f32, f32),
    pub(crate) prompt_below: bool,
    /// The action button, on a desktop only.
    pub(crate) action: Option<Rect>,
}

impl HudLayout {
    /// The layout of `count` slots on a `width` × `height` screen, with or without the touch
    /// controls on it.
    pub(crate) fn new(width: f32, height: f32, count: usize, touch: bool) -> Self {
        let count = count.max(1);
        let one_row = ((width - 48.0) / count as f32 - SLOT_GAP).min(TOUCH_ROW_SLOT.1);
        let single_row = touch && one_row >= TOUCH_ROW_SLOT.0;
        let slot = if single_row {
            one_row
        } else if touch {
            ((width - 48.0) / 6.0 - 10.0).clamp(30.0, 52.0)
        } else {
            ((width - 120.0) / count as f32 - 8.0).clamp(30.0, 54.0)
        };
        let room = (width - 32.0 - 2.0 * PANEL_PAD.0 + SLOT_GAP).max(slot + SLOT_GAP);
        let fit = ((room / (slot + SLOT_GAP)).floor() as usize).clamp(1, count);
        let columns = if touch && !single_row {
            fit.min(6)
        } else {
            fit
        };
        let rows = count.div_ceil(columns);
        let slot_h = slot * SLOT_ASPECT;
        let row_w = |n: usize| n as f32 * slot + (n.saturating_sub(1)) as f32 * SLOT_GAP;
        let panel_w = row_w(columns) + 2.0 * PANEL_PAD.0;
        let panel_h =
            rows as f32 * slot_h + (rows - 1) as f32 * SLOT_GAP + PANEL_PAD.1 + PANEL_PAD.2;
        let panel_y = if touch {
            TOP_MARGIN
        } else {
            height - BOTTOM_MARGIN - panel_h
        };
        let panel = Rect::new((width - panel_w) / 2.0, panel_y, panel_w, panel_h);
        let slots = (0..count)
            .map(|index| {
                let row = index / columns;
                let in_row = (count - row * columns).min(columns);
                let left = (width - row_w(in_row)) / 2.0;
                let col = index % columns;
                Rect::new(
                    left + col as f32 * (slot + SLOT_GAP),
                    panel.y + PANEL_PAD.1 + row as f32 * (slot_h + SLOT_GAP),
                    slot,
                    slot_h,
                )
            })
            .collect();
        let (prompt_anchor, prompt_below) = if touch {
            ((width / 2.0, panel.y + panel.h + PROMPT_GAP), true)
        } else {
            ((width / 2.0, panel.y - PROMPT_GAP), false)
        };
        let action = (!touch).then(|| {
            Rect::new(
                width - ACTION_MARGIN - ACTION_SIZE,
                height - ACTION_MARGIN - ACTION_SIZE,
                ACTION_SIZE,
                ACTION_SIZE,
            )
        });
        Self {
            slot,
            slots,
            panel,
            prompt_anchor,
            prompt_below,
            action,
        }
    }

    /// Whether `(x, y)` lands on the action button (its round shape).
    pub(crate) fn action_hit(&self, x: f32, y: f32) -> bool {
        self.action.is_some_and(|action| {
            let r = action.w / 2.0;
            (x - (action.x + r)).hypot(y - (action.y + r)) <= r
        })
    }
}

#[cfg(test)]
#[path = "layout.test.rs"]
mod tests;
