//! Paints the toasts: a cream (or red) rounded tag with its icon, its text and, when coins
//! moved, the coin and the amount. Only calls to Macroquad, no test: it is looked at in
//! `scenes/pr-shop.json`; the timing and the queue are pure and tested in `toast.test.rs`.

use macroquad::prelude::*;

use super::draw::{draw_icon, draw_label, draw_piece, fit_size, rgb, text_width};
use super::shop::draw_piece_icon;
use super::skin::ClaySkin;
use super::toast::{Toast, ToastIcon, ToastKind, Toasts, toast_pose};

const HEIGHT: f32 = 54.0;
const GAP: f32 = 8.0;
const TOP: f32 = 18.0;
const PAD: f32 = 14.0;
const ICON: f32 = 38.0;
const TEXT_SIZE: f32 = 24.0;
const COIN: f32 = 24.0;

/// What a toast spends besides its text: padding, icon and the coins at its end.
fn toast_extras(skin: &ClaySkin, toast: &Toast) -> f32 {
    let mut extras = PAD * 2.0 + ICON + 10.0;
    if let Some((amount, _)) = toast.coins {
        extras += 18.0 + COIN + 6.0 + text_width(skin, &format!("+{amount}"), TEXT_SIZE * 0.9);
    }
    extras
}

/// The text size of a toast: shrunk on a narrow screen so it never runs off it.
fn toast_text_size(skin: &ClaySkin, toast: &Toast) -> f32 {
    let room = screen_width() - 24.0 - toast_extras(skin, toast);
    fit_size(skin, &toast.text, TEXT_SIZE, room)
}

/// The width a toast takes: icon, text and the coins at its end.
fn toast_width(skin: &ClaySkin, toast: &Toast) -> f32 {
    let size = toast_text_size(skin, toast);
    (toast_extras(skin, toast) + text_width(skin, &toast.text, size)).min(screen_width() - 24.0)
}

fn draw_toast(skin: &ClaySkin, toast: &Toast, top: f32) {
    let pose = toast_pose(toast.age_ms);
    if pose.alpha <= 0.0 {
        return;
    }
    let width = toast_width(skin, toast);
    let rect = Rect::new((screen_width() - width) / 2.0, top + pose.dy, width, HEIGHT);
    let warning = toast.kind == ToastKind::Warning;
    draw_piece(
        skin,
        if warning { "toast_warning" } else { "toast" },
        rect,
        pose.alpha,
    );
    let ink = rgb(skin.palette.ink, pose.alpha);
    let text_fill = if warning {
        rgb(skin.palette.cream, pose.alpha)
    } else {
        ink
    };
    let icon_at = Rect::new(rect.x + PAD, rect.y + (HEIGHT - ICON) / 2.0, ICON, ICON);
    match &toast.icon {
        ToastIcon::Item(id) => {
            if let Some(texture) = skin.items.get(id) {
                draw_icon(texture, icon_at, pose.alpha);
            }
        }
        ToastIcon::Piece(name) => draw_piece_icon(skin, name, icon_at, pose.alpha),
    }
    let mut x = icon_at.x + ICON + 10.0;
    let size = toast_text_size(skin, toast);
    let line = rect.y + (HEIGHT - size) / 2.0;
    draw_label(skin, &toast.text, (x, line), size, text_fill, ink, 0.0);
    if let Some((amount, earned)) = toast.coins {
        x += text_width(skin, &toast.text, size) + 18.0;
        draw_piece(
            skin,
            "coin",
            Rect::new(x, rect.y + (HEIGHT - COIN) / 2.0, COIN, COIN),
            pose.alpha,
        );
        let sign = if earned { "+" } else { "-" };
        let size = TEXT_SIZE * 0.9;
        draw_label(
            skin,
            &format!("{sign}{amount}"),
            (x + COIN + 6.0, rect.y + (HEIGHT - size) / 2.0),
            size,
            text_fill,
            ink,
            0.0,
        );
    }
}

/// Paints the toasts from the top of the screen down, the oldest first.
pub(crate) fn draw_toasts(skin: &ClaySkin, toasts: &Toasts) {
    for (row, toast) in toasts.iter().enumerate() {
        draw_toast(skin, toast, TOP + row as f32 * (HEIGHT + GAP));
    }
}
