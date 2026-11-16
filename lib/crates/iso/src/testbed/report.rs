//! What a scripted run answers with: where the player ended, what stands in the world, and
//! every shot it wrote.
//!
//! The report is how a run is checked without looking at the pixels, so it carries the state
//! the scene asked for rather than a summary of it.

use serde::Serialize;

use crate::grid::ChunkCoord;
use crate::terrain::TerrainColumn;
use crate::world::ChunkManager;

/// Where the player ended, in world coordinates.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct ReportPlayer {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    /// The cell the player stands on, as the world counts cells.
    pub cell: [i32; 2],
}

/// One entity standing in the world when the run ended.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct ReportEntity {
    /// The blueprint it was built from.
    pub blueprint: String,
    /// The cell it is anchored on.
    pub cell: [i32; 2],
    pub elevation: i32,
}

/// Everything a run answers with.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    /// How many frames the run took.
    pub frames: u32,
    /// How many of its steps it got through.
    pub steps_taken: usize,
    /// How many steps the scene listed.
    pub steps: usize,
    /// The shots it wrote, in the order it wrote them.
    pub shots: Vec<String>,
    /// The phase the light was on when it ended.
    pub phase: String,
    /// Where the player ended; absent when the run ended before the player was placed.
    pub player: Option<ReportPlayer>,
    /// What stands in the chunks the run had loaded.
    pub entities: Vec<ReportEntity>,
    /// Anything worth knowing: an edit that changed nothing, a budget that ran out.
    pub notes: Vec<String>,
}

/// What a report says about an edit that changed nothing, with the state of the cell it was
/// asked on, so the scene can be corrected without opening the game.
pub fn refusal_note(at: [i32; 2], column: Option<TerrainColumn>, standing: Option<&str>) -> String {
    let [x, y] = at;
    let cell = match column {
        Some(column) => format!(
            "the cell is {:?} at elevation {}",
            column.surface, column.elevation
        ),
        None => "the cell is outside the loaded world".to_owned(),
    };
    let occupied = match standing {
        Some(blueprint) => format!(", and {blueprint} already stands on it"),
        None => String::new(),
    };
    format!("an edit on [{x}, {y}] changed nothing: {cell}{occupied}")
}

/// The player's own line of the report.
pub fn player_of(x: f64, y: f64, elevation: f64) -> ReportPlayer {
    ReportPlayer {
        x,
        y,
        elevation,
        cell: [x.floor() as i32, y.floor() as i32],
    }
}

/// What stands in `chunks`, sorted by cell so two runs of the same scene answer the same way.
pub fn entities_in(manager: &ChunkManager, chunks: &[ChunkCoord]) -> Vec<ReportEntity> {
    let mut standing: Vec<ReportEntity> = chunks
        .iter()
        .filter_map(|coord| manager.entities_chunk(*coord))
        .flatten()
        .map(|entity| ReportEntity {
            blueprint: entity.type_().to_owned(),
            cell: [entity.x(), entity.y()],
            elevation: entity.elevation(),
        })
        .collect();
    standing.sort_by(|left, right| {
        (left.cell, left.elevation, &left.blueprint).cmp(&(
            right.cell,
            right.elevation,
            &right.blueprint,
        ))
    });
    standing.dedup();
    standing
}

#[cfg(test)]
#[path = "report.test.rs"]
mod tests;
