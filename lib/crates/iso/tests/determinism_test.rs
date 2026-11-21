//! Determinism contract: the same seed gives the same world and the same crowd, whatever the
//! thread timing, the `HashMap` iteration order of a run or the order chunks are asked for.
//! This is the base lockstep multiplayer builds on; the engine draws no number from the OS or the
//! clock, so every random thing must be a pure function of `(seed, coordinates, tick)`.

use iso::entities::EntityCatalog;
use iso::grid::{ChunkCoord, WorldCoord};
use iso::npc::{Npcs, spawn_npcs};
use iso::player::{PlayerGround, PlayerObstacle};
use iso::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator};
use iso::world::ChunkManager;

fn catalog() -> EntityCatalog {
    serde_json::from_str(include_str!("../../../content/json/entities.json"))
        .expect("the entity catalog is valid JSON")
}

/// A manager built the way the client builds it, with every shipped content layer.
fn manager(seed: u64) -> ChunkManager {
    let entities = catalog();
    let biomes =
        iso::biomes::parse_biomes(include_str!("../../../content/json/biomes.json"), &entities)
            .expect("biomes validate");
    let wfc = iso::entities::wfc::parse_wfc(
        include_str!("../../../content/json/wfc.json"),
        &entities,
        Some(&biomes),
    )
    .expect("wfc validates");
    let world_biomes = iso::biomes::WorldBiomes::new(seed, &biomes);
    let settlements = iso::settlements::parse_settlements(
        include_str!("../../../content/json/settlements.json"),
        &entities,
        &wfc,
    )
    .expect("settlements validate");
    let generator = TerrainGenerator::new(TerrainConfig {
        seed,
        ..TerrainConfig::default()
    })
    .expect("terrain config is valid");
    let world_settlements =
        iso::settlements::WorldSettlements::new(seed, &settlements).on_ground(generator.clone());
    let mut manager = ChunkManager::new(generator, entities);
    manager.set_biomes(world_biomes);
    manager.set_wfc(wfc);
    manager.set_settlements(world_settlements);
    manager
}

/// The whole streamed world around `focus`, serialised: terrain, entities and all.
fn world_around(seed: u64, focus: ChunkCoord) -> serde_json::Value {
    let mut manager = manager(seed);
    manager.set_single_focus(focus);
    for _ in 0..200 {
        manager.tick();
    }
    let chunks = manager.save_all();
    assert!(
        chunks.len() > 4,
        "the streamer discovered the neighbourhood"
    );
    serde_json::to_value(chunks).expect("chunks serialise")
}

fn chunk_at(world: &serde_json::Value, cx: i32, cy: i32) -> serde_json::Value {
    world
        .as_array()
        .expect("a list of chunks")
        .iter()
        .find(|chunk| chunk["cx"] == cx && chunk["cy"] == cy)
        .unwrap_or_else(|| panic!("chunk ({cx}, {cy}) was generated"))
        .clone()
}

#[test]
fn the_same_seed_streams_the_same_world_every_run() {
    let focus = ChunkCoord { cx: 0, cy: 0 };
    let first = world_around(42, focus);
    // Fresh managers hash with fresh `RandomState`s and race their placement threads anew.
    for _ in 0..3 {
        assert_eq!(first, world_around(42, focus));
    }
}

#[test]
fn another_seed_streams_another_world() {
    let focus = ChunkCoord { cx: 0, cy: 0 };
    assert_ne!(world_around(42, focus), world_around(43, focus));
}

#[test]
fn a_chunk_does_not_depend_on_where_the_player_came_from() {
    let from_here = world_around(42, ChunkCoord { cx: 0, cy: 0 });
    let from_there = world_around(42, ChunkCoord { cx: 1, cy: 1 });
    for (cx, cy) in [(0, 0), (1, 1), (1, 0), (0, 1)] {
        assert_eq!(
            chunk_at(&from_here, cx, cy),
            chunk_at(&from_there, cx, cy),
            "chunk ({cx}, {cy}) differs depending on the focus it was streamed from"
        );
    }
}

/// Bare ground over a manager's terrain: enough for the crowd to be born and to wander.
struct Ground<'a>(&'a ChunkManager);

impl PlayerGround for Ground<'_> {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn> {
        self.0.column_at(x, y)
    }
    fn occupancy_at(&self, _x: i32, _y: i32) -> Vec<PlayerObstacle> {
        Vec::new()
    }
    fn chunk_has(&self, coord: ChunkCoord) -> bool {
        self.0.is_discovered(coord)
    }
}

/// The crowd of the chunks around the origin after `ticks` ticks, as text.
fn crowd_after(seed: u64, ticks: u32, birth_order: &[ChunkCoord]) -> String {
    let mut manager = manager(seed);
    manager.set_single_focus(ChunkCoord { cx: 0, cy: 0 });
    for _ in 0..200 {
        manager.tick();
    }
    manager.settle();
    let ground = Ground(&manager);
    let entities = catalog();
    let mut crowd = Npcs::default();
    crowd.sync(birth_order, |chunk| {
        spawn_npcs(seed, chunk, &ground, &entities)
    });
    assert!(!crowd.is_empty(), "somebody was born in the neighbourhood");
    let player = WorldCoord { x: 0, y: 0 };
    // In two uneven bites: stepping must not depend on how the ticks are batched.
    crowd.step(&ground, player, ticks / 3);
    crowd.step(&ground, player, ticks - ticks / 3);
    crowd
        .iter()
        .map(|npc| format!("{npc:?}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn ring() -> Vec<ChunkCoord> {
    (-3..=3)
        .flat_map(|cy| (-3..=3).map(move |cx| ChunkCoord { cx, cy }))
        .collect()
}

#[test]
fn the_same_seed_walks_the_same_crowd() {
    let ring = ring();
    let first = crowd_after(42, 600, &ring);
    assert_eq!(first, crowd_after(42, 600, &ring));
}

#[test]
fn the_crowd_does_not_depend_on_the_order_chunks_arrive_in() {
    let ring = ring();
    let mut reversed = ring.clone();
    reversed.reverse();
    assert_eq!(
        crowd_after(42, 600, &ring),
        crowd_after(42, 600, &reversed),
        "ids order the crowd, so the order chunks are synced in must not matter"
    );
}

#[test]
fn another_seed_walks_another_crowd() {
    let ring = ring();
    assert_ne!(crowd_after(42, 600, &ring), crowd_after(43, 600, &ring));
}
