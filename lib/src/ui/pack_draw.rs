//! Paints the mobile inventory panel with the kit: the umber panel, the two tabs, the close
//! button and then the slots or the tool rows. Only calls to Macroquad, no test: it is looked at
//! in `scenes/pr-pack.json`; where things sit is pure and tested in `pack.test.rs`.

use macroquad::prelude::*;

use super::draw::{draw_icon, draw_label, draw_piece, fit_size, rgb, text_width};
use super::frame::UiFrame;
use super::hud::ClayHud;
use super::layout::HudLayout;
use super::pack::{PackLayout, PackTab};
use super::shop::centred;
use super::skin::ClaySkin;

fn draw_tool_row(skin: &ClaySkin, tool: &super::frame::UiTool, rect: Rect) {
    let ink = rgb(skin.palette.ink, 1.0);
    let umber = rgb(skin.palette.umber, 1.0);
    draw_piece(skin, "shop_row", rect, 1.0);
    let side = rect.h - 14.0;
    let icon_at = Rect::new(rect.x + 14.0, rect.y + 7.0, side, side);
    if let Some(texture) = skin.items.get(&tool.icon) {
        draw_icon(texture, icon_at, 1.0);
    }
    let text_x = icon_at.x + side + 12.0;
    let mut room = rect.x + rect.w - 16.0 - text_x;
    if tool.count > 1 {
        let count = format!("x{}", tool.count);
        let width = text_width(skin, &count, 26.0);
        draw_label(
            skin,
            &count,
            (
                rect.x + rect.w - 16.0 - width,
                rect.y + (rect.h - 26.0) / 2.0,
            ),
            26.0,
            ink,
            ink,
            0.0,
        );
        room -= width + 10.0;
    }
    let name_size = fit_size(skin, &tool.name, 24.0, room);
    draw_label(
        skin,
        &tool.name,
        (text_x, rect.y + 7.0),
        name_size,
        ink,
        ink,
        0.0,
    );
    let level = format!("Nivel {}", tool.tier);
    draw_label(
        skin,
        &level,
        (text_x, rect.y + 33.0),
        17.0,
        umber,
        umber,
        0.0,
    );
}

/// Paints the open inventory panel for `frame`, in the middle of the screen. `draw_slots` is the
/// HUD's own slot painter, handed the panel's slot rectangles.
pub(crate) fn draw_pack(
    skin: &ClaySkin,
    hud: &ClayHud,
    frame: &UiFrame,
    layout: &HudLayout,
    draw_slots: impl FnOnce(&HudLayout),
) {
    let pack = PackLayout::new(
        screen_width(),
        screen_height(),
        frame.slots.len(),
        frame.tools.len(),
    );
    let ink = rgb(skin.palette.ink, 1.0);
    let cream = rgb(skin.palette.cream, 1.0);
    draw_piece(skin, "hotbar", pack.panel, 1.0);
    for (tab, rect, name) in [
        (PackTab::Items, pack.items, "Items"),
        (PackTab::Tools, pack.tools, "Herramientas"),
    ] {
        let piece = if hud.pack_tab == tab {
            "shop_row_selected"
        } else {
            "shop_row"
        };
        draw_piece(skin, piece, rect, 1.0);
        // The long name gets a smaller size so it stays inside its tab on a narrow phone.
        let size = if text_width(skin, name, 24.0) > rect.w - 14.0 {
            18.0
        } else {
            24.0
        };
        centred(skin, name, rect, size, ink, ink);
    }
    draw_piece(skin, "badge", pack.close, 1.0);
    centred(skin, "X", pack.close, 22.0, ink, ink);
    match hud.pack_tab {
        PackTab::Items => {
            let mut slots = layout.clone();
            slots.slot = pack.slot;
            slots.slots = pack.slots;
            draw_slots(&slots);
        }
        PackTab::Tools => {
            if frame.tools.is_empty() {
                centred(skin, "Sin herramientas", pack.content, 22.0, cream, ink);
            }
            for (tool, rect) in frame.tools.iter().zip(&pack.tool_rows) {
                draw_tool_row(skin, tool, *rect);
            }
        }
    }
}
