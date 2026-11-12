//! The maker's panel: which buttons it offers, where they sit, and how it paints them.
//!
//! The layout is a pure function of the brush and the content, so the frame can lay the panel
//! out while it reads the pointer and paint it later from the same buttons.

use iso::entities::EntityCatalog;
use iso::maker::{MAKER_SURFACES, MAKER_TOOLS, MakerBrush, MakerTool};
use iso::terrain::TerrainMaterial;
use macroquad::prelude::*;

/// How wide the panel is drawn, in screen pixels.
pub(crate) const PANEL_WIDTH: f32 = 236.0;
/// Space between the panel and the edge of the window.
const MARGIN: f32 = 16.0;
/// Height of one button.
const BUTTON_HEIGHT: f32 = 24.0;
/// Space between two buttons.
const GAP: f32 = 4.0;
/// Where the first row of buttons starts, under the panel's title.
const FIRST_ROW_Y: f32 = 184.0;

/// What a click on the panel asks for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MakerAction {
    /// Takes a tool in hand.
    Tool(MakerTool),
    /// Chooses the material a surface stroke paints.
    Surface(TerrainMaterial),
    /// Chooses the colour zone a tint stroke writes.
    Tint(usize),
    /// Chooses what a grass stroke grows; `None` is the plain block.
    Top(Option<usize>),
    /// Chooses the blueprint a placing stroke puts down.
    Blueprint(usize),
    /// Turns the blueprint in hand a quarter turn.
    Turn,
    /// Takes the last stroke back.
    Undo,
}

/// One clickable button of the panel.
#[derive(Clone, Debug)]
pub(crate) struct PanelButton {
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) width: f32,
    pub(crate) height: f32,
    pub(crate) label: String,
    pub(crate) action: MakerAction,
    /// Whether this button is the choice the brush is holding.
    pub(crate) active: bool,
}

/// How many choices the world offers the brush right now.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PanelCounts {
    /// Colour zones in the palette of the cell the panel is laid out for.
    pub(crate) tints: usize,
    /// Tops the grass of that cell can grow.
    pub(crate) tops: usize,
}

/// The short name of a tool on the panel.
pub(crate) fn tool_label(tool: MakerTool) -> &'static str {
    match tool {
        MakerTool::Raise => "Subir",
        MakerTool::Lower => "Bajar",
        MakerTool::Surface => "Pintar",
        MakerTool::Tint => "Tinte",
        MakerTool::Top => "Hierba",
        MakerTool::Place => "Poner",
        MakerTool::Erase => "Borrar",
    }
}

/// The short name of a surface on the panel.
pub(crate) fn surface_label(material: TerrainMaterial) -> &'static str {
    match material {
        TerrainMaterial::Grass => "Hierba",
        TerrainMaterial::Sand => "Arena",
        TerrainMaterial::Ground => "Tierra",
        TerrainMaterial::Path => "Camino",
        TerrainMaterial::Stairs => "Gradas",
        TerrainMaterial::Water => "Agua",
    }
}

/// Lays buttons out in rows of a fixed number of columns inside the panel.
struct Rows {
    left: f32,
    y: f32,
    column: usize,
    columns: usize,
}

impl Rows {
    fn new(left: f32, y: f32) -> Self {
        Self {
            left,
            y,
            column: 0,
            columns: 1,
        }
    }

    /// Starts a new row of `columns` buttons per line.
    fn wrap(&mut self, columns: usize) {
        if self.column > 0 {
            self.y += BUTTON_HEIGHT + GAP;
        }
        self.column = 0;
        self.columns = columns.max(1);
    }

    /// Leaves a line of space, for a heading.
    fn heading(&mut self) {
        self.wrap(1);
        self.y += BUTTON_HEIGHT;
    }

    /// The next button's place, in order.
    fn next(&mut self) -> (f32, f32, f32) {
        let width = (PANEL_WIDTH - GAP * (self.columns as f32 - 1.0)) / self.columns as f32;
        let x = self.left + self.column as f32 * (width + GAP);
        let y = self.y;
        self.column += 1;
        if self.column == self.columns {
            self.column = 0;
            self.y += BUTTON_HEIGHT + GAP;
        }
        (x, y, width)
    }
}

/// A name cut to what fits on a button.
fn short(label: &str) -> String {
    const LIMIT: usize = 14;
    if label.chars().count() <= LIMIT {
        return label.to_owned();
    }
    label.chars().take(LIMIT - 1).chain(['.']).collect()
}

/// What the panel offers for `brush` on a window `width` wide: the tools, the two commands and
/// the choices of the tool in hand, in the order they are drawn.
pub(crate) fn panel_buttons(
    brush: &MakerBrush,
    catalog: &EntityCatalog,
    counts: PanelCounts,
    width: f32,
) -> Vec<PanelButton> {
    let left = width - PANEL_WIDTH - MARGIN;
    let mut rows = Rows::new(left, FIRST_ROW_Y);
    let mut buttons = Vec::new();
    let mut push = |rows: &mut Rows, label: String, action: MakerAction, active: bool| {
        let (x, y, button_width) = rows.next();
        buttons.push(PanelButton {
            x,
            y,
            width: button_width,
            height: BUTTON_HEIGHT,
            label,
            action,
            active,
        });
    };

    rows.wrap(2);
    for tool in MAKER_TOOLS {
        push(
            &mut rows,
            tool_label(tool).to_owned(),
            MakerAction::Tool(tool),
            tool == brush.tool,
        );
    }
    rows.wrap(2);
    push(&mut rows, "Girar (R)".to_owned(), MakerAction::Turn, false);
    push(
        &mut rows,
        "Deshacer (Z)".to_owned(),
        MakerAction::Undo,
        false,
    );

    match brush.tool {
        MakerTool::Surface => {
            rows.heading();
            rows.wrap(2);
            for material in MAKER_SURFACES {
                push(
                    &mut rows,
                    surface_label(material).to_owned(),
                    MakerAction::Surface(material),
                    material == brush.surface,
                );
            }
        }
        MakerTool::Tint => {
            rows.heading();
            rows.wrap(5);
            for zone in 0..counts.tints {
                push(
                    &mut rows,
                    format!("{}", zone + 1),
                    MakerAction::Tint(zone),
                    zone == brush.tint,
                );
            }
        }
        MakerTool::Top => {
            rows.heading();
            rows.wrap(5);
            push(
                &mut rows,
                "Plano".to_owned(),
                MakerAction::Top(None),
                brush.top.is_none(),
            );
            for top in 0..counts.tops {
                push(
                    &mut rows,
                    format!("{}", top + 1),
                    MakerAction::Top(Some(top)),
                    brush.top == Some(top),
                );
            }
        }
        MakerTool::Place => {
            rows.heading();
            rows.wrap(2);
            for (index, blueprint) in catalog.entities.iter().enumerate() {
                push(
                    &mut rows,
                    short(&blueprint.id),
                    MakerAction::Blueprint(index),
                    index == brush.blueprint,
                );
            }
        }
        MakerTool::Raise | MakerTool::Lower | MakerTool::Erase => {}
    }
    buttons
}

/// The rectangle the panel covers on screen: its backing, which reaches past its buttons.
fn panel_rect(buttons: &[PanelButton], width: f32) -> (f32, f32, f32, f32) {
    let left = width - PANEL_WIDTH - MARGIN;
    let bottom = buttons
        .iter()
        .map(|button| button.y + button.height)
        .fold(FIRST_ROW_Y, f32::max);
    (
        left - 8.0,
        FIRST_ROW_Y - 48.0,
        PANEL_WIDTH + 16.0,
        bottom - FIRST_ROW_Y + 80.0,
    )
}

/// Whether the pointer is over the panel at all, button or backing: what the world must not be
/// painted through, however long the button is held down.
pub(crate) fn panel_contains(buttons: &[PanelButton], x: f32, y: f32, width: f32) -> bool {
    let (left, top, panel_width, panel_height) = panel_rect(buttons, width);
    (left..=left + panel_width).contains(&x) && (top..=top + panel_height).contains(&y)
}

/// The button under `(x, y)`, if the pointer is over one.
pub(crate) fn button_at(buttons: &[PanelButton], x: f32, y: f32) -> Option<&PanelButton> {
    buttons.iter().find(|button| {
        (button.x..=button.x + button.width).contains(&x)
            && (button.y..=button.y + button.height).contains(&y)
    })
}

/// Paints the panel: its backing, its title, the brush in hand, every button, the last note
/// and, along the bottom of the window, the editor's controls.
pub(crate) fn draw_panel(buttons: &[PanelButton], title: &str, note: &str, help: &str, width: f32) {
    let left = width - PANEL_WIDTH - MARGIN;
    let bottom = buttons
        .iter()
        .map(|button| button.y + button.height)
        .fold(FIRST_ROW_Y, f32::max);
    let (backing_x, backing_y, backing_width, backing_height) = panel_rect(buttons, width);
    draw_rectangle(
        backing_x,
        backing_y,
        backing_width,
        backing_height,
        Color::from_rgba(21, 29, 42, 225),
    );
    draw_rectangle_lines(
        backing_x,
        backing_y,
        backing_width,
        backing_height,
        1.0,
        SKYBLUE,
    );
    draw_text("Editor de mundo", left, FIRST_ROW_Y - 26.0, 22.0, WHITE);
    draw_text(title, left, FIRST_ROW_Y - 8.0, 16.0, LIGHTGRAY);
    let (mouse_x, mouse_y) = mouse_position();
    for button in buttons {
        let hovered = (button.x..=button.x + button.width).contains(&mouse_x)
            && (button.y..=button.y + button.height).contains(&mouse_y);
        let fill = if button.active {
            Color::from_rgba(63, 116, 153, 235)
        } else if hovered {
            Color::from_rgba(52, 72, 98, 235)
        } else {
            Color::from_rgba(32, 44, 62, 215)
        };
        draw_rectangle(button.x, button.y, button.width, button.height, fill);
        draw_rectangle_lines(
            button.x,
            button.y,
            button.width,
            button.height,
            1.0,
            Color::from_rgba(96, 142, 161, 200),
        );
        draw_text(
            &button.label,
            button.x + 6.0,
            button.y + BUTTON_HEIGHT - 7.0,
            15.0,
            WHITE,
        );
    }
    draw_text(note, left, bottom + 22.0, 15.0, GOLD);
    draw_text(help, 32.0, screen_height() - 82.0, 15.0, LIGHTGRAY);
}

#[cfg(test)]
#[path = "panel.test.rs"]
mod tests;
