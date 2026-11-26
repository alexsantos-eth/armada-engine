//! The inventory as a panel in the middle of the screen, like the market's: two tabs
//! (items and tools) and a close button along its top, and under them either the item slots in
//! a grid or the tools in rows. Pure; tested in `pack.test.rs`; `pack_draw.rs` paints it.

use macroquad::math::Rect;

use super::layout::SLOT_ASPECT;

/// The panel's widest side.
const PANEL_MAX_WIDTH: f32 = 520.0;
/// Gap kept between the panel and the screen's edges.
const SCREEN_MARGIN: f32 = 16.0;
/// Space around everything inside the panel.
const PAD: f32 = 18.0;
/// The tab row's height and the widest a tab gets.
const TAB_HEIGHT: f32 = 46.0;
const TAB_WIDTH: f32 = 130.0;
/// The close button's side.
const CLOSE_SIZE: f32 = 42.0;
/// Gap between pieces.
const GAP: f32 = 8.0;
/// The most a slot's side grows to.
const SLOT_MAX: f32 = 64.0;
/// A tool row's height.
pub(crate) const TOOL_ROW: f32 = 58.0;

/// The two lists the panel shows.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum PackTab {
    /// What the player carries, in slots.
    #[default]
    Items,
    /// The tools the player owns.
    Tools,
}

/// What a point on the screen is over.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PackHit {
    Tab(PackTab),
    Close,
    Panel,
    Outside,
}

/// The panel's rectangles for one screen size and one amount of slots and tools.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PackLayout {
    pub(crate) panel: Rect,
    pub(crate) items: Rect,
    pub(crate) tools: Rect,
    pub(crate) close: Rect,
    /// The area under the tabs, where the slots or the tool rows go.
    pub(crate) content: Rect,
    /// A slot's side.
    pub(crate) slot: f32,
    pub(crate) slots: Vec<Rect>,
    pub(crate) tool_rows: Vec<Rect>,
}

impl PackLayout {
    /// The layout of `slot_count` slots and `tool_count` tools on a `width` × `height` screen.
    pub(crate) fn new(width: f32, height: f32, slot_count: usize, tool_count: usize) -> Self {
        let panel_w = (width - 2.0 * SCREEN_MARGIN).clamp(260.0, PANEL_MAX_WIDTH);
        let inner_w = panel_w - 2.0 * PAD;
        let columns = (((inner_w + GAP) / (46.0 + GAP)).floor() as usize).clamp(3, 6);
        let slot = ((inner_w - GAP * (columns - 1) as f32) / columns as f32).min(SLOT_MAX);
        let slot_h = slot * SLOT_ASPECT;
        let rows = slot_count.max(1).div_ceil(columns);
        let grid_h = rows as f32 * slot_h + (rows - 1) as f32 * GAP;
        let tools_h = tool_count.max(1) as f32 * TOOL_ROW + (tool_count.max(1) - 1) as f32 * GAP;
        // Both tabs share one height so the panel does not jump when the tab changes.
        let content_h = grid_h.max(tools_h);
        let panel_h = PAD + TAB_HEIGHT + GAP + content_h + PAD;
        let panel = Rect::new(
            (width - panel_w) / 2.0,
            ((height - panel_h) / 2.0).max(SCREEN_MARGIN),
            panel_w,
            panel_h,
        );
        let tab_w = TAB_WIDTH.min((inner_w - CLOSE_SIZE - 2.0 * GAP) / 2.0);
        let top = panel.y + PAD;
        let items = Rect::new(panel.x + PAD, top, tab_w, TAB_HEIGHT);
        let tools = Rect::new(items.x + tab_w + GAP, top, tab_w, TAB_HEIGHT);
        let close = Rect::new(
            panel.x + panel.w - PAD - CLOSE_SIZE,
            top + (TAB_HEIGHT - CLOSE_SIZE) / 2.0,
            CLOSE_SIZE,
            CLOSE_SIZE,
        );
        let content_top = top + TAB_HEIGHT + GAP;
        let slots = (0..slot_count)
            .map(|index| {
                let row = index / columns;
                let in_row = (slot_count - row * columns).min(columns);
                let row_w = in_row as f32 * slot + (in_row - 1) as f32 * GAP;
                let left = panel.x + (panel.w - row_w) / 2.0;
                Rect::new(
                    left + (index % columns) as f32 * (slot + GAP),
                    content_top + row as f32 * (slot_h + GAP),
                    slot,
                    slot_h,
                )
            })
            .collect();
        let tool_rows = (0..tool_count)
            .map(|index| {
                Rect::new(
                    panel.x + PAD,
                    content_top + index as f32 * (TOOL_ROW + GAP),
                    inner_w,
                    TOOL_ROW,
                )
            })
            .collect();
        let content = Rect::new(panel.x + PAD, content_top, inner_w, content_h);
        Self {
            panel,
            items,
            tools,
            close,
            content,
            slot,
            slots,
            tool_rows,
        }
    }

    /// What the point `(x, y)` is over.
    pub(crate) fn hit(&self, x: f32, y: f32) -> PackHit {
        let at = macroquad::math::vec2(x, y);
        if self.close.contains(at) {
            PackHit::Close
        } else if self.items.contains(at) {
            PackHit::Tab(PackTab::Items)
        } else if self.tools.contains(at) {
            PackHit::Tab(PackTab::Tools)
        } else if self.panel.contains(at) {
            PackHit::Panel
        } else {
            PackHit::Outside
        }
    }
}

#[cfg(test)]
#[path = "pack.test.rs"]
mod tests;
