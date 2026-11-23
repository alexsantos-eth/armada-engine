//! Paints the native HUD from the exported kit: the bar and its slots, the prompt with its
//! progress, the action button, the comic bubble and the flying gains. Macroquad calls only;
//! the layout, the slicing and the motion are pure and tested next door, and the whole is
//! checked by eye with `scenes/pr-harvest.json`.

use macroquad::prelude::*;

use super::frame::{UiFrame, UiPrompt};
use super::hud::{BubbleContent, ClayHud};
use super::layout::HudLayout;
use super::motion;
use super::skin::ClaySkin;
use super::slice::nine_slice;
use crate::touch::StickView;

/// A camera that draws in screen pixels through one pose matrix.
struct Posed(Mat4);

impl Camera for Posed {
    fn matrix(&self) -> Mat4 {
        self.0
    }
    fn depth_enabled(&self) -> bool {
        false
    }
    fn render_pass(&self) -> Option<macroquad::texture::RenderPass> {
        None
    }
    fn viewport(&self) -> Option<(i32, i32, i32, i32)> {
        None
    }
}

fn rgb(value: [u8; 3], alpha: f32) -> Color {
    Color::from_rgba(
        value[0],
        value[1],
        value[2],
        (alpha.clamp(0.0, 1.0) * 255.0) as u8,
    )
}

fn faded(alpha: f32) -> Color {
    Color::new(1.0, 1.0, 1.0, alpha.clamp(0.0, 1.0))
}

/// Runs `paint` with everything posed around `pivot`.
fn posed(
    pivot: (f32, f32),
    scale: (f32, f32),
    turn: f32,
    offset: (f32, f32),
    paint: impl FnOnce(),
) {
    let matrix = motion::pose_matrix(
        (screen_width(), screen_height()),
        pivot,
        scale,
        turn,
        offset,
    );
    push_camera_state();
    set_camera(&Posed(matrix));
    paint();
    pop_camera_state();
}

fn draw_piece(skin: &ClaySkin, name: &str, shape: Rect, alpha: f32) {
    let (Some(piece), Some(texture)) = (skin.manifest.pieces.get(name), skin.pieces.get(name))
    else {
        return;
    };
    for (source, dest) in nine_slice(piece, skin.manifest.scale, shape) {
        draw_texture_ex(
            texture,
            dest.x,
            dest.y,
            faded(alpha),
            DrawTextureParams {
                source: Some(source),
                dest_size: Some(vec2(dest.w, dest.h)),
                ..Default::default()
            },
        );
    }
}

fn draw_icon(texture: &Texture2D, rect: Rect, alpha: f32) {
    draw_texture_ex(
        texture,
        rect.x,
        rect.y,
        faded(alpha),
        DrawTextureParams {
            dest_size: Some(vec2(rect.w, rect.h)),
            ..Default::default()
        },
    );
}

fn text_width(skin: &ClaySkin, text: &str, size: f32) -> f32 {
    measure_text(text, Some(&skin.display), size as u16, 1.0).width
}

/// Writes `text` with its top-left at `(x, top)` in a line `size` tall, outlined `stroke` px.
fn draw_label(
    skin: &ClaySkin,
    text: &str,
    (x, top): (f32, f32),
    size: f32,
    fill: Color,
    ink: Color,
    stroke: f32,
) {
    let dims = measure_text(text, Some(&skin.display), size as u16, 1.0);
    let baseline = top + (size - dims.height) / 2.0 + dims.offset_y;
    let params = |color: Color| TextParams {
        font: Some(&skin.display),
        font_size: size as u16,
        color,
        ..Default::default()
    };
    if stroke > 0.0 {
        for step in 0..16 {
            let angle = step as f32 * std::f32::consts::TAU / 16.0;
            draw_text_ex(
                text,
                x + angle.cos() * stroke,
                baseline + angle.sin() * stroke,
                params(ink),
            );
        }
    }
    draw_text_ex(text, x, baseline, params(fill));
}

fn draw_slots(skin: &ClaySkin, hud: &ClayHud, frame: &UiFrame, layout: &HudLayout) {
    let ink = rgb(skin.palette.ink, 1.0);
    for (index, (rect, stack)) in layout.slots.iter().zip(&frame.slots).enumerate() {
        let (sx, sy, turn) = hud
            .bump_age(index)
            .map_or((1.0, 1.0, 0.0), motion::bump_pose);
        let pivot = (rect.x + rect.w / 2.0, rect.y + rect.h / 2.0);
        posed(pivot, (sx, sy), turn, (0.0, 0.0), || {
            let piece = if stack.is_some() {
                "slot"
            } else {
                "slot_empty"
            };
            draw_piece(skin, piece, *rect, 1.0);
            let Some(stack) = stack else { return };
            if let Some(icon) = skin.items.get(&stack.item) {
                let side = rect.w * 0.72;
                let icon_rect =
                    Rect::new(pivot.0 - side / 2.0, pivot.1 - side / 2.0 - 4.0, side, side);
                draw_icon(icon, icon_rect, 1.0);
            }
            let count = hud.shown_count(&stack.item, stack.count);
            if count > 1 {
                let text = count.to_string();
                let size = rect.w * 0.34;
                let width = text_width(skin, &text, size);
                draw_label(
                    skin,
                    &text,
                    (rect.x + rect.w + 6.0 - width, rect.y + rect.h + 8.0 - size),
                    size,
                    WHITE,
                    ink,
                    2.5,
                );
            }
        });
    }
}

fn draw_prompt(skin: &ClaySkin, prompt: &UiPrompt, layout: &HudLayout, touch: bool) {
    let size = 17.0;
    let ink = rgb(skin.palette.ink, 1.0);
    let key = !prompt.blocked && !touch;
    let key_w = if key { 22.0 + 6.0 } else { 0.0 };
    let line_w = key_w + text_width(skin, &prompt.text, size);
    let bar = prompt.progress.map(|_| (150.0, 14.0));
    let inner_w = bar.map_or(line_w, |(w, _)| line_w.max(w));
    let inner_h = size + bar.map_or(0.0, |(_, h)| 6.0 + h);
    let (w, h) = (inner_w + 32.0, inner_h + 16.0);
    let top = if layout.prompt_below {
        layout.prompt_anchor.1
    } else {
        layout.prompt_anchor.1 - h
    };
    let shape = Rect::new(layout.prompt_anchor.0 - w / 2.0, top, w, h);
    let piece = if prompt.blocked {
        "prompt_blocked"
    } else {
        "prompt"
    };
    draw_piece(skin, piece, shape, 1.0);
    let mut x = layout.prompt_anchor.0 - line_w / 2.0;
    let line_top = shape.y + 7.0;
    if key {
        draw_piece(skin, "kbd", Rect::new(x, line_top - 1.0, 22.0, 20.0), 1.0);
        let k = text_width(skin, "E", 13.0);
        draw_label(
            skin,
            "E",
            (x + 11.0 - k / 2.0, line_top),
            13.0,
            ink,
            ink,
            0.0,
        );
        x += key_w;
    }
    let fill = if prompt.blocked { WHITE } else { ink };
    draw_label(skin, &prompt.text, (x, line_top), size, fill, ink, 0.0);
    if let (Some(share), Some((bw, bh))) = (prompt.progress, bar) {
        let left = layout.prompt_anchor.0 - bw / 2.0;
        let y = line_top + size + 6.0;
        draw_rectangle(left, y, bw, bh, rgb(skin.palette.umber, 1.0));
        let filled = bw * share.clamp(0.0, 1.0);
        draw_rectangle(left, y, filled, bh, rgb(skin.palette.leaf, 1.0));
        if filled > 0.0 && filled < bw {
            draw_line(left + filled, y, left + filled, y + bh, 3.0, ink);
        }
        draw_rectangle_lines(left, y, bw, bh, 3.0, ink);
    }
}

fn draw_action(skin: &ClaySkin, hud: &ClayHud, prompt: &UiPrompt, rect: Rect) {
    let size = rect.w;
    let ink = rgb(skin.palette.ink, 1.0);
    let (offset, scale, piece) = if hud.held {
        ((4.0, 5.0), (0.95, 0.92), "action_pressed")
    } else {
        ((0.0, 0.0), (1.0, 1.0), "action")
    };
    let pivot = (rect.x + size / 2.0, rect.y + size / 2.0);
    posed(pivot, scale, 0.0, offset, || {
        draw_piece(skin, piece, rect, 1.0);
        let icon_name = format!("tool_{}", prompt.tool);
        if let (Some(icon), Some(piece)) = (
            skin.pieces.get(&icon_name),
            skin.manifest.pieces.get(&icon_name),
        ) {
            let side = size * 0.42;
            let label = size * 0.18;
            let block = side + 2.0 + label;
            let centre = (pivot.0, pivot.1 - block / 2.0 + side / 2.0);
            let turn = if prompt.progress.is_some() {
                motion::chop_angle(hud.clock_ms)
            } else {
                0.0
            };
            let room = piece.pad / skin.manifest.scale * side / 48.0;
            posed(centre, (1.0, 1.0), turn, (0.0, 0.0), || {
                draw_icon(
                    icon,
                    Rect::new(
                        centre.0 - side / 2.0 - room,
                        centre.1 - side / 2.0 - room,
                        side + 2.0 * room,
                        side + 2.0 * room,
                    ),
                    1.0,
                );
            });
            let w = text_width(skin, prompt.verb, label);
            draw_label(
                skin,
                prompt.verb,
                (pivot.0 - w / 2.0, centre.1 + side / 2.0 + 2.0),
                label,
                WHITE,
                ink,
                2.0,
            );
        }
        let badge = Rect::new(rect.x + size - 26.0, rect.y + 2.0, 26.0, 26.0);
        draw_piece(skin, "badge", badge, 1.0);
        let k = text_width(skin, "E", 13.0);
        draw_label(
            skin,
            "E",
            (badge.x + 13.0 - k / 2.0, badge.y + 6.0),
            13.0,
            ink,
            ink,
            0.0,
        );
    });
}

fn draw_bubble(skin: &ClaySkin, hud: &ClayHud, layout: &HudLayout) {
    let Some(bubble) = hud.bubble.as_ref() else {
        return;
    };
    let ink = rgb(skin.palette.ink, 1.0);
    let pose = motion::bubble_pose(bubble.age_ms);
    let size = 28.0;
    let (amount, icon, name, warning) = match &bubble.content {
        BubbleContent::Gain { item, name, amount } => (
            Some(format!("+{amount}")),
            skin.items.get(item),
            name.as_str(),
            false,
        ),
        BubbleContent::Warning(text) => (None, None, text.as_str(), true),
    };
    let amount_size = size * 1.22;
    let icon_side = size * 1.4;
    let amount_w = amount
        .as_deref()
        .map_or(0.0, |a| text_width(skin, a, amount_size) + 10.0);
    let icon_w = if icon.is_some() {
        icon_side + 10.0
    } else {
        0.0
    };
    let name_w = text_width(skin, name, size);
    let content_h = if icon.is_some() {
        icon_side
    } else {
        amount_size.max(size)
    };
    let (w, h) = (
        22.0 + amount_w + icon_w + name_w + 22.0,
        10.0 + content_h + 12.0,
    );
    let (x, bottom) = if warning {
        let x = layout.panel.x + layout.panel.w / 2.0;
        if layout.prompt_below {
            (x, layout.panel.y + layout.panel.h + 120.0)
        } else {
            (x, layout.panel.y - 70.0)
        }
    } else {
        (bubble.x, bubble.y)
    };
    let shape = Rect::new(x - w / 2.0, bottom - h, w, h);
    let pivot = (x, bottom - h / 2.0);
    let alpha = pose.opacity;
    posed(
        pivot,
        (pose.scale, pose.scale),
        pose.turn,
        (pose.dx, pose.dy),
        || {
            let (body, tail) = if warning {
                ("bubble_warning", "bubble_tail_warning")
            } else {
                ("bubble", "bubble_tail")
            };
            draw_piece(skin, body, shape, alpha);
            draw_piece(
                skin,
                tail,
                Rect::new(shape.x + 0.44 * w, bottom - 5.0, 34.0, 30.0),
                alpha,
            );
            let mut cursor = shape.x + 22.0;
            let middle = shape.y + 10.0 + content_h / 2.0;
            if let Some(amount) = amount.as_deref() {
                draw_label(
                    skin,
                    amount,
                    (cursor, middle - amount_size / 2.0),
                    amount_size,
                    rgb(skin.palette.red, alpha),
                    rgb(skin.palette.ink, alpha),
                    1.0,
                );
                cursor += amount_w;
            }
            if let Some(icon) = icon {
                draw_icon(
                    icon,
                    Rect::new(cursor, middle - icon_side / 2.0, icon_side, icon_side),
                    alpha,
                );
                cursor += icon_w;
            }
            let fill = if warning {
                Color::new(1.0, 1.0, 1.0, alpha)
            } else {
                rgb(skin.palette.ink, alpha)
            };
            draw_label(
                skin,
                name,
                (cursor, middle - size / 2.0),
                size,
                fill,
                ink,
                0.0,
            );
        },
    );
}

fn draw_flights(skin: &ClaySkin, hud: &ClayHud, layout: &HudLayout) {
    let ink = rgb(skin.palette.ink, 1.0);
    for flight in &hud.flights {
        let Some(slot) = layout.slots.get(flight.slot) else {
            continue;
        };
        let to = (slot.x + slot.w / 2.0, slot.y + slot.h / 2.0);
        let pose = motion::fly_pose(flight.age_ms, flight.from, to);
        if pose.opacity <= 0.0 {
            continue;
        }
        let text = format!("+{}", flight.amount);
        let size = 28.0;
        let icon_side = 40.0;
        let text_w = text_width(skin, &text, size);
        let w = text_w + 4.0 + icon_side;
        posed(
            (pose.x, pose.y),
            (pose.scale, pose.scale),
            pose.turn,
            (0.0, 0.0),
            || {
                let left = pose.x - w / 2.0;
                draw_label(
                    skin,
                    &text,
                    (left, pose.y - size / 2.0),
                    size,
                    WHITE,
                    ink,
                    3.0,
                );
                if let Some(icon) = skin.items.get(&flight.item) {
                    draw_icon(
                        icon,
                        Rect::new(
                            left + text_w + 4.0,
                            pose.y - icon_side / 2.0,
                            icon_side,
                            icon_side,
                        ),
                        1.0,
                    );
                }
            },
        );
    }
}

/// Paints the floating touch stick with the kit: the base, the knob (red while running) and,
/// when something is in reach, its tool on the knob, swinging while the held stick gathers.
pub(crate) fn draw_clay_stick(
    skin: &ClaySkin,
    view: &StickView,
    tool: Option<&str>,
    clock_ms: f64,
) {
    let (base_alpha, knob_alpha) = if view.active { (0.8, 1.0) } else { (0.45, 0.7) };
    let (cx, cy) = view.center;
    let r = view.radius;
    draw_piece(
        skin,
        "stick_base",
        Rect::new(cx - r, cy - r, 2.0 * r, 2.0 * r),
        base_alpha,
    );
    let knob = if view.run {
        "stick_knob_run"
    } else {
        "stick_knob"
    };
    let (kx, ky) = view.knob;
    let k = view.knob_radius;
    draw_piece(
        skin,
        knob,
        Rect::new(kx - k, ky - k, 2.0 * k, 2.0 * k),
        knob_alpha,
    );
    let Some(tool) = tool else {
        return;
    };
    let name = format!("tool_{tool}");
    let (Some(icon), Some(piece)) = (skin.pieces.get(&name), skin.manifest.pieces.get(&name))
    else {
        return;
    };
    let side = k * 1.3;
    let room = piece.pad / skin.manifest.scale * side / 48.0;
    let turn = if view.gathering {
        motion::chop_angle(clock_ms)
    } else {
        0.0
    };
    posed((kx, ky), (1.0, 1.0), turn, (0.0, 0.0), || {
        draw_icon(
            icon,
            Rect::new(
                kx - side / 2.0 - room,
                ky - side / 2.0 - room,
                side + 2.0 * room,
                side + 2.0 * room,
            ),
            knob_alpha,
        );
    });
}

/// Paints the whole HUD for `frame` with `skin`, as `hud` animates it.
pub(crate) fn draw_clay_hud(skin: &ClaySkin, hud: &ClayHud, frame: &UiFrame, layout: &HudLayout) {
    if !frame.visible {
        return;
    }
    if let Some(prompt) = frame.prompt.as_ref() {
        draw_prompt(skin, prompt, layout, frame.touch);
    }
    draw_piece(skin, "hotbar", layout.panel, 1.0);
    draw_slots(skin, hud, frame, layout);
    if let (Some(prompt), Some(rect)) = (
        frame.prompt.as_ref().filter(|prompt| !prompt.blocked),
        layout.action,
    ) {
        draw_action(skin, hud, prompt, rect);
    }
    draw_bubble(skin, hud, layout);
    draw_flights(skin, hud, layout);
}
