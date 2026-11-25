//! Paints the shop with the kit: the umber panel, the paper rows, the tabs, the coin and the
//! comic bubbles that offer it and report a trade. Only calls to Macroquad, no test: it is looked
//! at in `scenes/pr-shop.json` (the GPU exception of `FILE_STRUCTURE.md`); where things sit and
//! what they say are pure and tested in `shop::layout`, `shop::rows` and `shop::session`.

use macroquad::prelude::*;

use super::draw::{draw_icon, draw_label, draw_piece, posed, rgb, text_width};
use super::frame::ShopFrame;
use super::skin::ClaySkin;
use crate::shop::{MarketMark, ShopLayout, ShopRow, Tab, mark_pose, mark_rect};

/// Writes `text` centred on a rectangle.
fn centred(skin: &ClaySkin, text: &str, rect: Rect, size: f32, fill: Color, ink: Color) {
    let width = text_width(skin, text, size);
    draw_label(
        skin,
        text,
        (
            rect.x + (rect.w - width) / 2.0,
            rect.y + (rect.h - size) / 2.0,
        ),
        size,
        fill,
        ink,
        0.0,
    );
}

/// Gap between a coin and the number beside it.
const COIN_GAP: f32 = 10.0;
/// The coin beside a price in a row.
const COIN_SIDE: f32 = 26.0;

/// How wide a coin of `side` and `text` are together.
fn coin_width(skin: &ClaySkin, text: &str, side: f32) -> f32 {
    side + COIN_GAP + text_width(skin, text, side * 0.82)
}

/// The coin icon with `text` beside it, from `(x, top)`, the text in `fill`.
fn coin_and_text(skin: &ClaySkin, text: &str, (x, top): (f32, f32), side: f32, fill: Color) {
    let ink = rgb(skin.palette.ink, 1.0);
    draw_piece(skin, "coin", Rect::new(x, top, side, side), 1.0);
    let size = side * 0.82;
    draw_label(
        skin,
        text,
        (x + side + COIN_GAP, top + (side - size) / 2.0),
        size,
        fill,
        ink,
        0.0,
    );
}

/// A kit piece (a tool's icon) drawn into a square `icon_at`, its padding hanging outside it.
pub(super) fn draw_piece_icon(skin: &ClaySkin, name: &str, icon_at: Rect, alpha: f32) {
    if let (Some(texture), Some(meta)) = (skin.pieces.get(name), skin.manifest.pieces.get(name)) {
        let room = meta.pad / skin.manifest.scale * icon_at.w / 48.0;
        draw_icon(
            texture,
            Rect::new(
                icon_at.x - room,
                icon_at.y - room,
                icon_at.w + 2.0 * room,
                icon_at.w + 2.0 * room,
            ),
            alpha,
        );
    }
}

fn draw_row(skin: &ClaySkin, row: &ShopRow, rect: Rect, selected: bool) {
    let ink = rgb(skin.palette.ink, 1.0);
    let umber = rgb(skin.palette.umber, 1.0);
    let red = rgb(skin.palette.red, 1.0);
    let piece = if selected && row.enabled {
        "shop_row_selected"
    } else if row.enabled {
        "shop_row"
    } else {
        "shop_row_disabled"
    };
    draw_piece(skin, piece, rect, 1.0);
    let side = rect.h - 14.0;
    let icon_at = Rect::new(rect.x + 14.0, rect.y + 7.0, side, side);
    if row.is_tool {
        draw_piece_icon(skin, &row.icon, icon_at, 1.0);
    } else if let Some(texture) = skin.items.get(&row.icon) {
        draw_icon(texture, icon_at, 1.0);
    }
    let text_x = icon_at.x + side + 12.0;
    draw_label(skin, &row.name, (text_x, rect.y + 7.0), 24.0, ink, ink, 0.0);
    draw_label(
        skin,
        &row.detail,
        (text_x, rect.y + 33.0),
        17.0,
        umber,
        umber,
        0.0,
    );
    let price = row.coins.to_string();
    let right = rect.x + rect.w - 16.0;
    let width = coin_width(skin, &price, COIN_SIDE);
    let mut top = rect.y + (rect.h - COIN_SIDE) / 2.0;
    if let Some(note) = row.note.filter(|_| !row.enabled) {
        let note_width = text_width(skin, note, 17.0);
        draw_label(
            skin,
            note,
            (right - note_width, rect.y + 5.0),
            17.0,
            red,
            red,
            0.0,
        );
        top = rect.y + rect.h - COIN_SIDE - 5.0;
    }
    coin_and_text(skin, &price, (right - width, top), COIN_SIDE, ink);
}

/// Paints the open shop over the game: a dim backdrop, the panel with its tabs, the visible
/// rows, the wallet and, above or below the panel, what the last trade said.
pub(crate) fn draw_shop(skin: &ClaySkin, frame: &ShopFrame, layout: &ShopLayout) {
    let ink = rgb(skin.palette.ink, 1.0);
    let cream = rgb(skin.palette.cream, 1.0);
    draw_rectangle(
        0.0,
        0.0,
        screen_width(),
        screen_height(),
        Color::new(0.04, 0.03, 0.02, 0.45),
    );
    draw_piece(skin, "hotbar", layout.panel, 1.0);
    for (tab, rect, name) in [
        (Tab::Sell, layout.sell, "Vender"),
        (Tab::Buy, layout.buy, "Comprar"),
    ] {
        let active = frame.tab == tab;
        draw_piece(
            skin,
            if active {
                "shop_row_selected"
            } else {
                "shop_row"
            },
            rect,
            1.0,
        );
        centred(skin, name, rect, 24.0, ink, ink);
    }
    draw_piece(skin, "badge", layout.close, 1.0);
    centred(skin, "X", layout.close, 22.0, ink, ink);
    if frame.rows.is_empty() {
        let empty = match frame.tab {
            Tab::Sell => "No llevas nada que se venda",
            Tab::Buy => "No queda nada en el estante",
        };
        let area = layout.rows.first().copied().unwrap_or(layout.panel);
        centred(skin, empty, area, 22.0, cream, ink);
    }
    for (slot, rect) in layout.rows.iter().enumerate() {
        let index = layout.first + slot;
        let Some(row) = frame.rows.get(index) else {
            break;
        };
        draw_row(skin, row, *rect, index == frame.cursor);
    }
    coin_and_text(
        skin,
        &frame.coins.to_string(),
        (layout.footer.x + 4.0, layout.footer.y + 2.0),
        30.0,
        cream,
    );
}

/// The icon floating over the market in reach, bobbing and pulsing; far markets show none.
pub(crate) fn draw_market_marks(skin: &ClaySkin, marks: &[MarketMark], clock_ms: f64) {
    for mark in marks.iter().filter(|mark| mark.near) {
        let pose = mark_pose(clock_ms, mark.at.0 * 0.013, mark.near);
        let mut shape = mark_rect(mark);
        shape.y -= pose.lift;
        let pivot = (shape.x + shape.w / 2.0, shape.y + shape.h / 2.0);
        posed(pivot, (pose.scale, pose.scale), 0.0, (0.0, 0.0), || {
            draw_piece(skin, "market_mark", shape, 1.0);
        });
    }
}

/// The wallet in the corner: a rounded paper tag with the coin and the count, no words.
pub(crate) fn draw_wallet(skin: &ClaySkin, coins: u64) {
    let text = coins.to_string();
    let width = coin_width(skin, &text, 30.0) + 36.0;
    let rect = Rect::new(18.0, 18.0, width, 50.0);
    draw_piece(skin, "shop_row", rect, 1.0);
    coin_and_text(
        skin,
        &text,
        (rect.x + 18.0, rect.y + 10.0),
        30.0,
        rgb(skin.palette.ink, 1.0),
    );
}
