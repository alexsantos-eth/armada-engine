use super::super::wander::tests::ground_from;
use super::*;

const A: ChunkCoord = ChunkCoord { cx: 0, cy: 0 };
const B: ChunkCoord = ChunkCoord { cx: 1, cy: 0 };

fn born_in(chunk: ChunkCoord) -> Vec<Npc> {
    let x = chunk.cx * crate::grid::CHUNK_SIZE;
    vec![
        Npc::new(
            u64::from(x.unsigned_abs()) + 2,
            WorldCoord { x: x + 1, y: 1 },
            0,
        ),
        Npc::new(
            u64::from(x.unsigned_abs()) + 1,
            WorldCoord { x: x + 3, y: 3 },
            0,
        ),
    ]
}

#[test]
fn chunks_bring_and_take_their_characters() {
    let mut npcs = Npcs::default();
    assert!(npcs.is_empty());
    assert!(npcs.sync(&[A, B], born_in));
    assert_eq!(npcs.len(), 4);
    let ids: Vec<u64> = npcs.iter().map(|npc| npc.id).collect();
    let mut sorted = ids.clone();
    sorted.sort_unstable();
    assert_eq!(ids, sorted);

    assert!(!npcs.sync(&[A, B], |_| panic!("a live chunk is not born twice")));
    assert!(npcs.sync(&[B], born_in));
    assert_eq!(npcs.len(), 2);
    assert!(npcs.iter().all(|npc| to_chunk_coord(npc.home) == B));
}

#[test]
fn nobody_shares_a_cell_nor_walks_onto_the_player() {
    let ground = ground_from(&["0000", "0000", "0000", "0000"]);
    let player = WorldCoord { x: 2, y: 2 };
    let mut npcs = Npcs::default();
    npcs.sync(&[A], |_| {
        (0..4)
            .map(|index| {
                Npc::new(
                    index + 1,
                    WorldCoord {
                        x: index as i32,
                        y: 0,
                    },
                    0,
                )
            })
            .collect()
    });
    for _ in 0..5_000 {
        npcs.step(&ground, player, 1);
        let all: Vec<&Npc> = npcs.iter().collect();
        for (index, npc) in all.iter().enumerate() {
            assert!(!npc.claims(player));
            for other in &all[index + 1..] {
                assert!(!other.claims(npc.cell));
                assert!(npc.target().is_none_or(|target| !other.claims(target)));
            }
        }
    }
    assert!(npcs.iter().any(|npc| npc.cell != npc.home));
}
