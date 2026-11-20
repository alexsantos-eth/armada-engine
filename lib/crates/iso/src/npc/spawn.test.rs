use super::super::wander::tests::ground_from;
use super::*;
use crate::ai::basic::{ID_BIT, PER_CHUNK};
use crate::grid::{CHUNK_SIZE, WorldCoord};

const HOME: ChunkCoord = ChunkCoord { cx: 0, cy: 0 };

fn flat() -> impl PlayerGround {
    let row = "0".repeat(CHUNK_SIZE as usize);
    let rows: Vec<&str> = (0..CHUNK_SIZE).map(|_| row.as_str()).collect();
    ground_from(&rows)
}

fn beach() -> impl PlayerGround {
    let row = ".".repeat(CHUNK_SIZE as usize);
    let rows: Vec<&str> = (0..CHUNK_SIZE).map(|_| row.as_str()).collect();
    ground_from(&rows)
}

fn to_chunk(cell: WorldCoord) -> ChunkCoord {
    crate::grid::to_chunk_coord(cell)
}

/// A catalog of a rock and a crab, the crab declaring `npc` when given one.
fn catalog(npc: Option<&str>) -> EntityCatalog {
    let entity = |id: &str, npc: Option<&str>| {
        let npc = npc.map_or(String::new(), |logic| format!(r#""npc": "{logic}","#));
        format!(
            r#"{{"id": "{id}", {npc} "asset": {{"sprite": "/a.png"}},
            "shape": {{"height": 1, "length": 1, "collision": [0]}},
            "placement": {{"surfaces": ["sand"]}}}}"#
        )
    };
    let json = format!(
        r#"{{"schemaVersion": 1, "entities": [{}, {}]}}"#,
        entity("rock", None),
        entity("crab", npc)
    );
    serde_json::from_str(&json).expect("a valid catalog")
}

#[test]
fn an_entity_with_the_basic_logic_is_born_on_the_sand_only() {
    let catalog = catalog(Some("basic"));
    let born = spawn_npcs(1, HOME, &beach(), &catalog);
    assert!(!born.is_empty() && born.len() <= PER_CHUNK);
    for npc in &born {
        assert_eq!(npc.logic, NpcLogic::Basic);
        assert_ne!(npc.id & ID_BIT, 0);
        assert_eq!(npc.cell, npc.home);
        assert_eq!(to_chunk(npc.home), HOME);
    }
    assert!(spawn_npcs(1, HOME, &flat(), &catalog).is_empty());
}

#[test]
fn without_the_npc_key_nobody_is_born() {
    assert!(spawn_npcs(1, HOME, &beach(), &catalog(None)).is_empty());
}

#[test]
fn a_logic_declared_twice_is_born_once() {
    let mut twice = catalog(Some("basic"));
    twice.entities[0].npc = Some(NpcLogic::Basic);
    assert_eq!(logics_in(&twice), vec![NpcLogic::Basic]);
    assert_eq!(
        spawn_npcs(1, HOME, &beach(), &twice).len(),
        spawn_npcs(1, HOME, &beach(), &catalog(Some("basic"))).len()
    );
}

#[test]
fn nobody_is_born_on_water_or_without_ground() {
    let row = "~".repeat(CHUNK_SIZE as usize);
    let rows: Vec<&str> = (0..CHUNK_SIZE).map(|_| row.as_str()).collect();
    let catalog = catalog(Some("basic"));
    assert!(spawn_npcs(1, HOME, &ground_from(&rows), &catalog).is_empty());
    assert!(spawn_npcs(1, HOME, &ground_from(&[]), &catalog).is_empty());
}

#[test]
fn the_same_seed_and_chunk_give_the_same_characters() {
    let catalog = catalog(Some("basic"));
    let ids = |seed, chunk| -> Vec<u64> {
        spawn_npcs(seed, chunk, &beach(), &catalog)
            .iter()
            .map(|npc| npc.id)
            .collect()
    };
    assert_eq!(ids(9, HOME), ids(9, HOME));
    assert_ne!(ids(9, HOME), ids(10, HOME));
}
