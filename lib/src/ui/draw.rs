//! Paints the native HUD from the exported kit: the bar and its slots, the small work progress
//! bar with the material it yields, just above the player, the desktop action
//! button, the warning bubble and the flying gains. Macroquad calls only; the layout, the slicing
//! and the motion are pure and tested next door, and the whole is checked by eye with
//! `scenes/pr-harvest.json`.

use macroquad::prelude::*;

use super::frame::{UiAction, UiFrame};
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

pub(super) fn rgb(value: [u8; 3], alpha: f32) -> Color {
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
pub(super) fn posed(
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

pub(super) fn draw_piece(skin: &ClaySkin, name: &str, shape: Rect, alpha: f32) {
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

pub(super) fn draw_icon(texture: &Texture2D, rect: Rect, alpha: f32) {
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

/// The largest font size up to `size` at which `text` fits in `room` pixels, never below a
/// readable minimum, so a long name shrinks instead of running under its neighbour.
pub(super) fn fit_size(skin: &ClaySkin, text: &str, size: f32, room: f32) -> f32 {
    let width = text_width(skin, text, size);
    if width <= room || width <= 0.0 {
        return size;
    }
    (size * room / width).floor().max(size * 0.6).max(10.0)
}

pub(super) fn text_width(skin: &ClaySkin, text: &str, size: f32) -> f32 {
    measure_text(text, Some(&skin.display), size as u16, 1.0).width
}

/// Writes `text` with its top-left at `(x, top)` in a line `size` tall, outlined `stroke` px.
pub(super) fn draw_label(
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
            let count = hud.shown_count(index, stack.count);
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

/// Paints the small work progress bar with the name of the entity it belongs to, just above the
/// player.
fn draw_progress(skin: &ClaySkin, share: f32, name: Option<&str>, at: (f32, f32)) {
    let (w, h) = (110.0, 9.0);
    let inset = 2.0;
    let top = at.1 - h / 2.0 + 40.0;
    let left = at.0 - w / 2.0;
    draw_piece(skin, "progress", Rect::new(left, top, w, h), 1.0);
    let filled = (w - 2.0 * inset) * share.clamp(0.0, 1.0);
    if filled > 0.0 {
        draw_piece(
            skin,
            "progress_fill",
            Rect::new(left + inset, top + inset, filled, h - 2.0 * inset),
            1.0,
        );
    }
    if let Some(name) = name {
        let size = 11.0;
        let text_w = text_width(skin, name, size);
        draw_label(
            skin,
            name,
            (at.0 - text_w / 2.0, top - 7.0 - size),
            size,
            WHITE,
            rgb(skin.palette.ink, 1.0),
            1.5,
        );
    }
}

/// The picture of a tool for the action button and the stick, and the room a drawing leaves
/// around its shape, as a share of its side: a tool's own icon by id (`flint_axe`), else the kit's
/// piece for it (the hand), whose padding hangs outside the square.
fn tool_art<'a>(skin: &'a ClaySkin, tool: &str) -> Option<(&'a Texture2D, f32)> {
    if let Some(texture) = skin.items.get(tool) {
        return Some((texture, 0.0));
    }
    let name = format!("tool_{tool}");
    let texture = skin.pieces.get(&name)?;
    let piece = skin.manifest.pieces.get(&name)?;
    Some((texture, piece.pad / skin.manifest.scale / 48.0))
}

fn draw_action(skin: &ClaySkin, hud: &ClayHud, action: &UiAction, frame: &UiFrame, rect: Rect) {
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
        if let Some((icon, room_share)) = tool_art(skin, &action.tool) {
            let side = size * 0.42;
            let label = size * 0.18;
            let block = side + 2.0 + label;
            let centre = (pivot.0, pivot.1 - block / 2.0 + side / 2.0);
            let turn = if frame.progress.is_some() {
                motion::chop_angle(hud.clock_ms)
            } else {
                0.0
            };
            let room = room_share * side;
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
            let w = text_width(skin, &action.verb, label);
            draw_label(
                skin,
                &action.verb,
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
    let BubbleContent::Warning(text) = &bubble.content;
    let ink = rgb(skin.palette.ink, 1.0);
    let pose = motion::bubble_pose(bubble.age_ms);
    let size = 28.0;
    let name_w = text_width(skin, text, size);
    let (w, h) = (22.0 + name_w + 22.0, 10.0 + size + 12.0);
    let x = layout.panel.x + layout.panel.w / 2.0;
    let bottom = if layout.prompt_below {
        layout.panel.y + layout.panel.h + 120.0
    } else {
        layout.panel.y - 70.0
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
            draw_piece(skin, "bubble_warning", shape, alpha);
            draw_piece(
                skin,
                "bubble_tail_warning",
                Rect::new(shape.x + 0.44 * w, bottom - 5.0, 34.0, 30.0),
                alpha,
            );
            let middle = shape.y + 10.0 + size / 2.0;
            draw_label(
                skin,
                text,
                (shape.x + 22.0, middle - size / 2.0),
                size,
                Color::new(1.0, 1.0, 1.0, alpha),
                ink,
                0.0,
            );
        },
    );
}

fn draw_flights(skin: &ClaySkin, hud: &ClayHud, layout: &HudLayout) {
    let ink = rgb(skin.palette.ink, 1.0);
    for flight in &hud.flights {
        let Some(to) = flight.destination(layout) else {
            continue;
        };
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

/// Paints the backpack icon with the current mobile inventory state.
fn draw_backpack(skin: &ClaySkin, hud: &ClayHud, layout: &HudLayout) {
    let Some(rect) = layout.backpack.as_ref() else {
        return;
    };
    let piece = if hud.inventory_open {
        "backpack_open"
    } else {
        "backpack_closed"
    };
    draw_piece(skin, piece, *rect, 1.0);
}

/// Paints the floating touch stick with the kit: the base, the knob (red while running) and,
/// when something is in reach, its tool on the knob, swinging while the held stick gathers.
/// Invisible while the stick rests idle: the player sees it once they touch it.
pub(crate) fn draw_clay_stick(
    skin: &ClaySkin,
    view: &StickView,
    tool: Option<&str>,
    clock_ms: f64,
) {
    if !view.active {
        return;
    }
    let (cx, cy) = view.center;
    let r = view.radius;
    draw_piece(
        skin,
        "stick_base",
        Rect::new(cx - r, cy - r, 2.0 * r, 2.0 * r),
        0.8,
    );
    let knob = if view.run {
        "stick_knob_run"
    } else {
        "stick_knob"
    };
    let (kx, ky) = view.knob;
    let k = view.knob_radius;
    draw_piece(skin, knob, Rect::new(kx - k, ky - k, 2.0 * k, 2.0 * k), 1.0);
    let Some(tool) = tool else {
        return;
    };
    let Some((icon, room_share)) = tool_art(skin, tool) else {
        return;
    };
    let side = k * 1.3;
    let room = room_share * side;
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
            1.0,
        );
    });
}

/// Paints the whole HUD for `frame` with `skin`, as `hud` animates it.
pub(crate) fn draw_clay_hud(skin: &ClaySkin, hud: &ClayHud, frame: &UiFrame, layout: &HudLayout) {
    if !frame.visible {
        return;
    }
    if let (Some(share), Some(at)) = (frame.progress, frame.progress_at) {
        draw_progress(skin, share, frame.progress_name.as_deref(), at);
    }
    // The inventory stays folded in the backpack icon until it is pressed (or its key), and then
    // opens as a panel in the middle of the screen, on every platform.
    let pack_open = hud.inventory_open;
    if pack_open {
        super::pack_draw::draw_pack(skin, hud, frame, layout, |slots| {
            draw_slots(skin, hud, frame, slots);
        });
    }
    if !pack_open
        && let Some(action) = frame.action.as_ref()
        && let Some(rect) = layout.action
    {
        draw_action(skin, hud, action, frame, rect);
    }
    if !pack_open {
        draw_backpack(skin, hud, layout);
    }
    draw_bubble(skin, hud, layout);
    draw_flights(skin, hud, layout);
}
