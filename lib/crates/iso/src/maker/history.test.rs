use crate::grid::{ChunkCoord, WorldCoord};
use crate::maker::dressing::Dressing;
use crate::maker::history::{History, restore, snapshot};
use crate::terrain::{TerrainMaterial, flat_chunk};
use crate::world::ChunkManager;

const CHUNK: ChunkCoord = ChunkCoord { cx: 0, cy: 0 };

fn maker_world() -> (ChunkManager, Dressing) {
    let mut manager = ChunkManager::default();
    manager.load_columns(CHUNK, flat_chunk(CHUNK, 0, TerrainMaterial::Grass));
    (manager, Dressing::default())
}

#[test]
fn an_undo_puts_the_terrain_and_the_dressing_back() {
    let (mut manager, mut dressing) = maker_world();
    let mut history = History::new(8);
    history.record(snapshot(&manager, &dressing, CHUNK).expect("the chunk is loaded"));
    manager
        .edit_column(WorldCoord { x: 3, y: 3 }, 4, TerrainMaterial::Path)
        .expect("the chunk is loaded");
    dressing.set_tint(WorldCoord { x: 3, y: 3 }, Some(2));
    let step = history.undo().expect("one step was recorded");
    assert!(restore(&mut manager, &mut dressing, CHUNK, step));
    let column = manager.column_at(3, 3).expect("the chunk is loaded");
    assert_eq!(column.elevation, 0);
    assert_eq!(column.surface, TerrainMaterial::Grass);
    assert_eq!(dressing.tint(WorldCoord { x: 3, y: 3 }), None);
}

#[test]
fn an_empty_history_has_nothing_to_undo() {
    let mut history = History::new(4);
    assert_eq!(history.len(), 0);
    assert!(history.undo().is_none());
}

#[test]
fn the_history_forgets_its_oldest_step_past_the_limit() {
    let (manager, dressing) = maker_world();
    let mut history = History::new(2);
    for _ in 0..5 {
        history.record(snapshot(&manager, &dressing, CHUNK).expect("the chunk is loaded"));
    }
    assert_eq!(history.len(), 2);
    assert!(history.undo().is_some());
    assert!(history.undo().is_some());
    assert!(history.undo().is_none());
}

#[test]
fn a_snapshot_of_a_chunk_that_was_never_loaded_is_none() {
    let (manager, dressing) = maker_world();
    assert!(snapshot(&manager, &dressing, ChunkCoord { cx: 9, cy: 9 }).is_none());
}

#[test]
fn restoring_into_a_chunk_that_was_never_loaded_is_refused() {
    let (mut manager, mut dressing) = maker_world();
    let step = snapshot(&manager, &dressing, CHUNK).expect("the chunk is loaded");
    assert!(!restore(
        &mut manager,
        &mut dressing,
        ChunkCoord { cx: 9, cy: 9 },
        step
    ));
}

#[test]
fn a_history_with_no_room_keeps_nothing() {
    let (manager, dressing) = maker_world();
    let mut history = History::new(0);
    history.record(snapshot(&manager, &dressing, CHUNK).expect("the chunk is loaded"));
    assert_eq!(history.len(), 0);
}
