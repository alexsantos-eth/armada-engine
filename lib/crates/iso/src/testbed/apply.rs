//! What a scene's edits do to the world: the same strokes the editor's brush takes.
//!
//! A scripted run builds with the maker's rules rather than rules of its own, so what a scene
//! describes and what a hand builds on the `/maker` route land the same way.

use crate::entities::EntityCatalog;
use crate::grid::WorldCoord;
use crate::maker::{Dressing, MakerBrush, MakerStroke, MakerTool, apply_brush, turned_blueprint};
use crate::testbed::scene::SceneEdit;
use crate::world::ChunkManager;

/// Where a blueprint stands in the catalog, by the name a scene calls it, turned a quarter turn
/// when the scene asks for it.
pub fn blueprint_index(catalog: &EntityCatalog, id: &str, turned: bool) -> Result<usize, String> {
    let wanted = if turned {
        turned_blueprint(id).ok_or_else(|| {
            format!("{id} has no axis in its name, so there is nothing to turn it to")
        })?
    } else {
        id.to_owned()
    };
    catalog
        .entities
        .iter()
        .position(|blueprint| blueprint.id == wanted)
        .ok_or_else(|| format!("the catalog has no blueprint named {wanted}"))
}

/// The brush that takes `edit`, for a catalog that holds its blueprint.
pub fn brush_for(catalog: &EntityCatalog, edit: &SceneEdit) -> Result<MakerBrush, String> {
    let mut brush = MakerBrush::default();
    match edit {
        SceneEdit::Raise { .. } => brush.tool = MakerTool::Raise,
        SceneEdit::Lower { .. } => brush.tool = MakerTool::Lower,
        SceneEdit::Surface { material, .. } => {
            brush.tool = MakerTool::Surface;
            brush.surface = *material;
        }
        SceneEdit::Tint { zone, .. } => {
            brush.tool = MakerTool::Tint;
            brush.tint = *zone;
        }
        SceneEdit::Top { variant, .. } => {
            brush.tool = MakerTool::Top;
            brush.top = *variant;
        }
        SceneEdit::Place {
            blueprint, turned, ..
        } => {
            brush.tool = MakerTool::Place;
            brush.blueprint = blueprint_index(catalog, blueprint, *turned)?;
        }
        SceneEdit::Erase { .. } => brush.tool = MakerTool::Erase,
    }
    Ok(brush)
}

/// The more telling of two strokes, so a repeated edit answers with what it managed to change
/// rather than with the last stroke that found nothing left to do.
fn stronger(left: MakerStroke, right: MakerStroke) -> MakerStroke {
    let rank = |stroke: MakerStroke| match stroke {
        MakerStroke::Nothing => 0,
        MakerStroke::Dressing => 1,
        MakerStroke::Entities => 2,
        MakerStroke::Terrain => 3,
    };
    if rank(right) > rank(left) {
        right
    } else {
        left
    }
}

/// Applies `edit` to the world, as many times as it asks, and answers with the most telling of
/// its strokes. `Nothing` means the world was already as the edit wanted it, or the cell refused
/// it; an `Err` means the scene itself is wrong.
pub fn apply_edit(
    manager: &mut ChunkManager,
    dressing: &mut Dressing,
    edit: &SceneEdit,
) -> Result<MakerStroke, String> {
    let brush = brush_for(manager.catalog(), edit)?;
    let [x, y] = edit.at();
    let at = WorldCoord { x, y };
    let mut taken = MakerStroke::Nothing;
    for _ in 0..edit.times() {
        taken = stronger(taken, apply_brush(manager, dressing, &brush, at));
    }
    Ok(taken)
}

#[cfg(test)]
#[path = "apply.test.rs"]
mod tests;
