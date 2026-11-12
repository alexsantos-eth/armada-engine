//! The editing session: the brush in hand, the pointer over the chunk and the strokes taken.
//!
//! The session reads the pointer and the keyboard, asks the panel what was clicked and hands
//! every decision to `iso::maker`. What it cannot test without a window — the pointer, the
//! keyboard and the painting — is a thin pass over the rules checked in `session.test.rs` and
//! in the domain; it is looked at by hand with `scripts/run-native.sh run --locked -- --maker`.

use iso::entities::EntityCatalog;
use iso::grid::{CHUNK_SIZE, ChunkCoord, WorldCoord, to_chunk_coord, to_world_coord};
use iso::maker::{
    MAKER_MAX_ELEVATION, MAKER_MIN_ELEVATION, MakerBrush, MakerStroke, MakerTool, apply_brush,
    pick_column, restore, snapshot,
};
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_grid_point};
use iso::terrain::TerrainMaterial;
use iso::world::ChunkManager;
use macroquad::prelude::*;

use crate::maker::panel::{
    MakerAction, PanelButton, PanelCounts, button_at, draw_panel, panel_buttons, panel_contains,
    surface_label,
};
use crate::terrain::terrain_view_appearance::TerrainLook;

/// How many strokes can be taken back.
const HISTORY_STEPS: usize = 40;

/// Which tool a key press takes in hand: the number keys, in the order of the panel.
fn tool_for_key(pressed: impl Fn(KeyCode) -> bool) -> Option<MakerTool> {
    const KEYS: [(KeyCode, MakerTool); 7] = [
        (KeyCode::Key1, MakerTool::Raise),
        (KeyCode::Key2, MakerTool::Lower),
        (KeyCode::Key3, MakerTool::Surface),
        (KeyCode::Key4, MakerTool::Tint),
        (KeyCode::Key5, MakerTool::Top),
        (KeyCode::Key6, MakerTool::Place),
        (KeyCode::Key7, MakerTool::Erase),
    ];
    KEYS.into_iter()
        .find_map(|(key, tool)| pressed(key).then_some(tool))
}

/// The next of `len` choices after `current`, wrapping around; `current` when there are none.
fn cycled(current: usize, len: usize, forward: bool) -> usize {
    if len == 0 {
        return current;
    }
    let current = current.min(len - 1);
    if forward {
        (current + 1) % len
    } else {
        (current + len - 1) % len
    }
}

/// The next top after `current` out of `tops`, with the plain block as one more choice.
fn cycled_top(current: Option<usize>, tops: usize, forward: bool) -> Option<usize> {
    if tops == 0 {
        return None;
    }
    let at = current.map_or(0, |top| top.min(tops - 1) + 1);
    let next = cycled(at, tops + 1, forward);
    (next > 0).then(|| next - 1)
}

/// What to tell the maker after a stroke: nothing, unless a tool that can be refused was.
fn note_for(stroke: MakerStroke, tool: MakerTool) -> &'static str {
    match (stroke, tool) {
        (MakerStroke::Nothing, MakerTool::Place) => "Ahi no cabe",
        _ => "",
    }
}

/// The brush in hand, written for the panel's subtitle.
fn brush_title(brush: &MakerBrush, catalog: &EntityCatalog) -> String {
    match brush.tool {
        MakerTool::Raise => "Subir el terreno".to_owned(),
        MakerTool::Lower => "Bajar el terreno".to_owned(),
        MakerTool::Surface => format!("Pintar: {}", surface_label(brush.surface)),
        MakerTool::Tint => format!("Tinte: zona {}", brush.tint + 1),
        MakerTool::Top => match brush.top {
            Some(top) => format!("Hierba: variante {}", top + 1),
            None => "Hierba: bloque plano".to_owned(),
        },
        MakerTool::Place => match catalog.entities.get(brush.blueprint) {
            Some(blueprint) => format!("Poner: {}", blueprint.id),
            None => "Poner: sin catalogo".to_owned(),
        },
        MakerTool::Erase => "Borrar lo que haya".to_owned(),
    }
}

/// Everything one frame of editing reaches into.
pub(crate) struct MakerFrame<'a> {
    pub(crate) manager: &'a mut ChunkManager,
    pub(crate) look: &'a mut TerrainLook,
    pub(crate) projection: ProjectionConfig,
}

/// The editing session over one chunk.
pub(crate) struct MakerSession {
    /// The chunk this session edits; strokes outside it are refused.
    pub(crate) chunk: ChunkCoord,
    brush: MakerBrush,
    history: iso::maker::History,
    buttons: Vec<PanelButton>,
    hovered: Option<WorldCoord>,
    /// The cell this drag has already painted, so holding the button does not stack strokes.
    painted: Option<WorldCoord>,
    note: &'static str,
}

impl MakerSession {
    /// A session with the default brush over `chunk`.
    pub(crate) fn new(chunk: ChunkCoord) -> Self {
        Self {
            chunk,
            brush: MakerBrush::default(),
            history: iso::maker::History::new(HISTORY_STEPS),
            buttons: Vec::new(),
            hovered: None,
            painted: None,
            note: "",
        }
    }

    /// The centre cell of the edited chunk: where the panel reads how many choices the world
    /// offers, so the palettes it lists are the ones this chunk is painted from.
    fn centre(&self) -> WorldCoord {
        to_world_coord(
            self.chunk,
            iso::grid::LocalCoord {
                lx: CHUNK_SIZE / 2,
                ly: CHUNK_SIZE / 2,
            },
        )
    }

    /// Lays the panel out, reads the keyboard and the pointer, and applies at most one stroke.
    /// Answers with the chunk whose light has to be baked again, if the stroke changed it.
    pub(crate) fn update(&mut self, frame: MakerFrame<'_>) -> Option<ChunkCoord> {
        let centre = self.centre();
        let counts = PanelCounts {
            tints: frame
                .look
                .tint_zones(TerrainMaterial::Grass, centre.x, centre.y),
            tops: frame.look.top_count(),
        };
        self.buttons = panel_buttons(&self.brush, frame.manager.catalog(), counts, screen_width());

        if let Some(tool) = tool_for_key(is_key_pressed) {
            self.brush.tool = tool;
            self.note = "";
        }
        if is_key_pressed(KeyCode::R) {
            self.brush.turn(frame.manager.catalog());
        }
        for (key, forward) in [(KeyCode::RightBracket, true), (KeyCode::LeftBracket, false)] {
            if is_key_pressed(key) {
                self.brush.blueprint = cycled(
                    self.brush.blueprint,
                    frame.manager.catalog().entities.len(),
                    forward,
                );
            }
        }
        for (key, forward) in [(KeyCode::Period, true), (KeyCode::Comma, false)] {
            if is_key_pressed(key) {
                self.brush.top = cycled_top(self.brush.top, counts.tops, forward);
            }
        }
        for (key, forward) in [(KeyCode::Equal, true), (KeyCode::Minus, false)] {
            if is_key_pressed(key) {
                self.brush.tint = cycled(self.brush.tint, counts.tints, forward);
            }
        }
        if is_key_pressed(KeyCode::Z)
            && (is_key_down(KeyCode::LeftControl) || is_key_down(KeyCode::RightControl))
        {
            return self.undo(frame.manager, frame.look);
        }

        let (pointer_x, pointer_y) = mouse_position();
        if panel_contains(&self.buttons, pointer_x, pointer_y, screen_width()) {
            self.hovered = None;
            if is_mouse_button_pressed(MouseButton::Left)
                && let Some(action) =
                    button_at(&self.buttons, pointer_x, pointer_y).map(|button| button.action)
            {
                return self.take(action, frame.manager, frame.look);
            }
            return None;
        }

        self.hovered = pick_column(
            ScreenPoint {
                x: f64::from(pointer_x),
                y: f64::from(pointer_y),
            },
            frame.projection,
            MAKER_MIN_ELEVATION..=MAKER_MAX_ELEVATION,
            |cell| {
                frame
                    .manager
                    .column_at(cell.x, cell.y)
                    .map(|column| column.elevation)
            },
        );

        if !is_mouse_button_down(MouseButton::Left) {
            self.painted = None;
            return None;
        }
        let cell = self.hovered?;
        if to_chunk_coord(cell) != self.chunk {
            self.note = "Solo se edita este chunk";
            return None;
        }
        if is_mouse_button_pressed(MouseButton::Left)
            && let Some(step) = snapshot(frame.manager, frame.look.dressing_mut(), self.chunk)
        {
            self.history.record(step);
        }
        if self.painted == Some(cell) {
            return None;
        }
        self.painted = Some(cell);
        let stroke = apply_brush(frame.manager, frame.look.dressing_mut(), &self.brush, cell);
        self.note = note_for(stroke, self.brush.tool);
        matches!(stroke, MakerStroke::Terrain | MakerStroke::Entities).then_some(self.chunk)
    }

    /// Applies a click on the panel.
    fn take(
        &mut self,
        action: MakerAction,
        manager: &mut ChunkManager,
        look: &mut TerrainLook,
    ) -> Option<ChunkCoord> {
        self.note = "";
        match action {
            MakerAction::Tool(tool) => self.brush.tool = tool,
            MakerAction::Surface(material) => {
                self.brush.surface = material;
                self.brush.tool = MakerTool::Surface;
            }
            MakerAction::Tint(zone) => self.brush.tint = zone,
            MakerAction::Top(top) => self.brush.top = top,
            MakerAction::Blueprint(index) => self.brush.blueprint = index,
            MakerAction::Turn => {
                self.brush.turn(manager.catalog());
            }
            MakerAction::Undo => return self.undo(manager, look),
        }
        None
    }

    /// Takes the last stroke back, and says whether the light has to be baked again.
    fn undo(&mut self, manager: &mut ChunkManager, look: &mut TerrainLook) -> Option<ChunkCoord> {
        let Some(step) = self.history.undo() else {
            self.note = "No queda nada que deshacer";
            return None;
        };
        restore(manager, look.dressing_mut(), self.chunk, step);
        Some(self.chunk)
    }

    /// Paints the cell under the pointer and the panel, over the finished scene.
    pub(crate) fn draw(&self, manager: &ChunkManager, projection: ProjectionConfig) {
        if let Some(cell) = self.hovered
            && let Some(column) = manager.column_at(cell.x, cell.y)
        {
            let corner = |dx: f64, dy: f64| {
                let point = project_grid_point(
                    GridPoint {
                        x: f64::from(cell.x) + dx,
                        y: f64::from(cell.y) + dy,
                    },
                    projection,
                );
                let step = projection
                    .elevation_step
                    .unwrap_or(projection.tile_height / 2.0);
                vec2(
                    point.x as f32,
                    (point.y - f64::from(column.elevation) * step) as f32,
                )
            };
            let outline = [
                corner(0.0, 0.0),
                corner(1.0, 0.0),
                corner(1.0, 1.0),
                corner(0.0, 1.0),
            ];
            for index in 0..outline.len() {
                let from = outline[index];
                let to = outline[(index + 1) % outline.len()];
                draw_line(from.x, from.y, to.x, to.y, 2.0, GOLD);
            }
        }
        let title = brush_title(&self.brush, manager.catalog());
        draw_panel(
            &self.buttons,
            &title,
            self.note,
            Self::help_line(),
            screen_width(),
        );
    }

    /// The controls line the panel shows along the bottom of the window.
    fn help_line() -> &'static str {
        "1-7: herramienta | clic: aplicar | R: girar | [ ] , . - =: elegir | Ctrl+Z: deshacer"
    }
}

#[cfg(test)]
#[path = "session.test.rs"]
mod tests;
