//! Where the shop puts its pieces on a screen: the panel in the middle, the two tabs and the
//! close button along its top, the visible rows under them and the prompt that opens it. Pure;
//! tested in `layout.test.rs`.

use macroquad::math::Rect;

use super::session::Tab;

/// The panel's widest side.
const PANEL_MAX_WIDTH: f32 = 600.0;
/// Space around everything inside the panel.
pub(crate) const PAD: f32 = 18.0;
/// The tab row's height.
const TAB_HEIGHT: f32 = 46.0;
/// A tab's width.
const TAB_WIDTH: f32 = 150.0;
/// The close button's side.
const CLOSE_SIZE: f32 = 42.0;
/// A row's height and the gap under it.
pub(crate) const ROW_HEIGHT: f32 = 58.0;
const ROW_GAP: f32 = 8.0;
/// Room under the rows for the hint and the last message.
const FOOTER: f32 = 44.0;
/// The most rows shown at once; more scroll with the cursor.
const MAX_VISIBLE: usize = 6;
/// Gap kept between the panel and the screen's edges.
const SCREEN_MARGIN: f32 = 16.0;

/// What a point on the screen is over.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Hit {
    Tab(Tab),
    /// The row at this index of the whole list, not of the visible window.
    Row(usize),
    Close,
    /// The panel, over nothing in particular.
    Panel,
    Outside,
}

/// The shop's rectangles for one screen size.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ShopLayout {
    pub(crate) panel: Rect,
    pub(crate) sell: Rect,
    pub(crate) buy: Rect,
    pub(crate) close: Rect,
    /// Index in the whole list of the first row shown.
    pub(crate) first: usize,
    /// The visible rows, top to bottom.
    pub(crate) rows: Vec<Rect>,
    /// Where the hint and the message are written.
    pub(crate) footer: Rect,
}

impl ShopLayout {
    /// The layout of a list of `count` rows with the cursor on `cursor`, on a `width` ×
    /// `height` screen.
    pub(crate) fn new(width: f32, height: f32, count: usize, cursor: usize) -> Self {
        let panel_width = (width - 2.0 * SCREEN_MARGIN).clamp(260.0, PANEL_MAX_WIDTH);
        let head = PAD + TAB_HEIGHT + PAD;
        let room = height - 2.0 * SCREEN_MARGIN - head - FOOTER - PAD;
        let fit = ((room + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)).floor().max(1.0) as usize;
        let shown = count.clamp(1, MAX_VISIBLE.min(fit));
        let list = shown as f32 * (ROW_HEIGHT + ROW_GAP) - ROW_GAP;
        let panel_height = head + list + FOOTER + PAD;
        let panel = Rect::new(
            (width - panel_width) / 2.0,
            ((height - panel_height) / 2.0).max(SCREEN_MARGIN),
            panel_width,
            panel_height,
        );
        let tab_width = TAB_WIDTH.min((panel_width - 2.0 * PAD - CLOSE_SIZE - 20.0) / 2.0);
        let tab = |index: f32| {
            Rect::new(
                panel.x + PAD + index * (tab_width + 10.0),
                panel.y + PAD,
                tab_width,
                TAB_HEIGHT,
            )
        };
        let first = if cursor < shown {
            0
        } else {
            cursor + 1 - shown
        };
        let rows = (0..shown)
            .map(|index| {
                Rect::new(
                    panel.x + PAD,
                    panel.y + head + index as f32 * (ROW_HEIGHT + ROW_GAP),
                    panel_width - 2.0 * PAD,
                    ROW_HEIGHT,
                )
            })
            .collect();
        Self {
            panel,
            sell: tab(0.0),
            buy: tab(1.0),
            close: Rect::new(
                panel.x + panel_width - PAD - CLOSE_SIZE,
                panel.y + PAD,
                CLOSE_SIZE,
                CLOSE_SIZE,
            ),
            first,
            rows,
            footer: Rect::new(
                panel.x + PAD,
                panel.y + head + list + 8.0,
                panel_width - 2.0 * PAD,
                FOOTER - 8.0,
            ),
        }
    }

    /// What the point `(x, y)` is over; rows past the end of a short list are not rows.
    pub(crate) fn hit(&self, x: f32, y: f32, count: usize) -> Hit {
        let at = macroquad::math::vec2(x, y);
        if !self.panel.contains(at) {
            return Hit::Outside;
        }
        if self.close.contains(at) {
            return Hit::Close;
        }
        if self.sell.contains(at) {
            return Hit::Tab(Tab::Sell);
        }
        if self.buy.contains(at) {
            return Hit::Tab(Tab::Buy);
        }
        self.rows
            .iter()
            .enumerate()
            .find(|(_, rect)| rect.contains(at))
            .map(|(slot, _)| self.first + slot)
            .filter(|index| *index < count)
            .map_or(Hit::Panel, Hit::Row)
    }
}

#[cfg(test)]
#[path = "layout.test.rs"]
mod tests;
