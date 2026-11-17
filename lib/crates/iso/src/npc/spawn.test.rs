use super::super::wander::tests::ground_from;
use super::*;

fn flat() -> impl PlayerGround {
    let row = "0".repeat(CHUNK_SIZE as usize);
    let rows: Vec<&str> = (0..CHUNK_SIZE).map(|_| row.as_str()).collect();
    ground_from(&rows)
}

const HOME: ChunkCoord = ChunkCoord { cx: 0, cy: 0 };

#[test]
fn a_village_chunk_is_born_with_its_villagers() {
    let born = spawn_npcs(1, HOME, &flat(), |_, _| true);
    assert_eq!(born.len(), NPC_VILLAGERS_PER_CHUNK);
    for npc in &born {
        assert_eq!(npc.cell, npc.home);
        assert_eq!(to_chunk(npc.home), HOME);
    }
}

fn to_chunk(cell: WorldCoord) -> ChunkCoord {
    crate::grid::to_chunk_coord(cell)
}

#[test]
fn the_wild_gives_a_wanderer_at_most() {
    let mut total = 0;
    for seed in 0..40 {
        let born = spawn_npcs(seed, HOME, &flat(), |_, _| false);
        assert!(born.len() <= NPC_WANDERERS_PER_CHUNK);
        total += born.len();
    }
    assert!(total > 0);
}

#[test]
fn nobody_is_born_on_water_or_without_ground() {
    let row = "~".repeat(CHUNK_SIZE as usize);
    let rows: Vec<&str> = (0..CHUNK_SIZE).map(|_| row.as_str()).collect();
    assert!(spawn_npcs(1, HOME, &ground_from(&rows), |_, _| true).is_empty());
    assert!(spawn_npcs(1, HOME, &ground_from(&[]), |_, _| true).is_empty());
}

#[test]
fn the_same_seed_and_chunk_give_the_same_characters() {
    let ids = |seed, chunk| -> Vec<u64> {
        spawn_npcs(seed, chunk, &flat(), |_, _| true)
            .iter()
            .map(|npc| npc.id)
            .collect()
    };
    assert_eq!(ids(9, HOME), ids(9, HOME));
    assert_ne!(ids(9, HOME), ids(10, HOME));
}
