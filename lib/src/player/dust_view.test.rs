//! Tests for the pool of puffs: what raises dust, what reuses a slot, how a cube sorts and
//! what it is drawn in.

use super::*;
use iso::grid::WorldCoord;
use iso::player::physics::{PlayerGround, PlayerObstacle};
use iso::player::{PlayerFeedback, create_player};
use iso::scene_order::compare_draw_keys;
use iso::terrain::{TerrainColumn, TerrainMaterial};

const TILE: f64 = 280.0;

/// Flat ground at elevation two, everywhere.
fn flat(_x: i32, _y: i32) -> Option<f64> {
    Some(2.0)
}

/// Grass at elevation two as far as the player can walk, so nothing it does is blocked.
struct Lawn;

impl PlayerGround for Lawn {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn> {
        Some(TerrainColumn {
            coord: WorldCoord { x, y },
            elevation: 2,
            surface: TerrainMaterial::Grass,
            walkable: true,
        })
    }
    fn occupancy_at(&self, _x: i32, _y: i32) -> Vec<PlayerObstacle> {
        Vec::new()
    }
}

fn player_at(x: f64, y: f64) -> PlayerState {
    let mut player = create_player(&Lawn, GridPoint { x, y });
    player.inset = 0.0;
    player
}

fn react(dust: &mut DustPuffs, player: &PlayerState, moved: f64) {
    let at = DustGround {
        feet: GridPoint { x: player.x, y: player.y },
        level: 2.0,
        ground: 2.0,
        moved,
        tile_height: TILE / 2.0,
    };
    dust.react(player, at, &flat);
}

#[test]
fn a_take_off_and_a_hard_landing_each_raise_a_puff() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 0, "standing still raises nothing");

    player.feedback = PlayerFeedback { jumps: 1, ..PlayerFeedback::default() };
    react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 1, "a take-off puffs");

    player.feedback = PlayerFeedback { jumps: 1, landings: 1, impact: 0.4, ..PlayerFeedback::default() };
    react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 2, "and so does the landing, in a slot of its own");
}

#[test]
fn a_landing_too_soft_to_feel_raises_none() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.feedback = PlayerFeedback {
        landings: 1,
        impact: DUST_MIN_IMPACT / 2.0,
        ..PlayerFeedback::default()
    };
    react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 0, "a step down onto sand kicks up nothing");
}

#[test]
fn only_running_and_skidding_leave_a_trail() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.velocity = GridPoint { x: 1.0, y: 0.0 };

    player.motion = PlayerMotionType::Walking;
    react(&mut dust, &player, 5.0);
    assert_eq!(dust.live(), 0, "a walk raises no dust, however far it goes");

    player.motion = PlayerMotionType::Running;
    react(&mut dust, &player, RUN_DUST_EVERY / 2.0);
    assert_eq!(dust.live(), 0, "half a stretch is not enough");
    react(&mut dust, &player, RUN_DUST_EVERY / 2.0);
    assert_eq!(dust.live(), 1, "the whole stretch puffs once");

    player.motion = PlayerMotionType::Skidding;
    react(&mut dust, &player, SKID_DUST_EVERY);
    assert_eq!(dust.live(), 2, "a skid puffs more often, into the next slot");
}

#[test]
fn the_trail_reuses_its_slots_in_turn_and_never_grows() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.motion = PlayerMotionType::Running;
    player.velocity = GridPoint { x: 1.0, y: 0.0 };
    for _ in 0..RUN_PUFFS * 3 {
        react(&mut dust, &player, RUN_DUST_EVERY);
    }
    assert_eq!(dust.live(), RUN_PUFFS, "a long run keeps the pool's worth of puffs, no more");
}

#[test]
fn a_puff_ends_when_its_life_is_over() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.feedback = PlayerFeedback { jumps: 1, ..PlayerFeedback::default() };
    react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 1);
    dust.advance(BURST_DUST.ms / 2.0);
    assert_eq!(dust.live(), 1, "halfway through it is still rising");
    dust.advance(BURST_DUST.ms);
    assert_eq!(dust.live(), 0, "past its life it is gone, and its slot is free");
}

#[test]
fn a_live_puff_queues_one_cube_per_voxel_and_a_dead_one_queues_none() {
    let projection = ProjectionConfig {
        tile_width: TILE,
        tile_height: TILE / 2.0,
        elevation_step: Some(160.0),
        origin_x: 480.0,
        origin_y: 300.0,
    };
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.feedback = PlayerFeedback { jumps: 1, ..PlayerFeedback::default() };
    react(&mut dust, &player, 0.0);

    let mut draws = Vec::new();
    dust.collect(projection, &mut draws);
    assert_eq!(draws.len(), BURST_DUST.voxels, "one cube per voxel of the puff");

    dust.advance(BURST_DUST.ms * 2.0);
    draws.clear();
    dust.collect(projection, &mut draws);
    assert!(draws.is_empty(), "a puff that is over draws nothing");
}

#[test]
fn a_cube_is_drawn_white_and_fades_with_its_puff() {
    let projection = ProjectionConfig {
        tile_width: TILE,
        tile_height: TILE / 2.0,
        elevation_step: Some(160.0),
        origin_x: 0.0,
        origin_y: 0.0,
    };
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.feedback = PlayerFeedback { jumps: 1, ..PlayerFeedback::default() };
    react(&mut dust, &player, 0.0);

    let mut draws = Vec::new();
    dust.collect(projection, &mut draws);
    let first = match &draws[0].kind {
        crate::assets::sprites::DrawKind::Voxel { colours, faces } => (*colours, *faces),
        _ => panic!("dust is queued as voxels"),
    };
    let (colours, faces) = first;
    for colour in colours {
        assert!(colour.r > 0.65 && colour.g > 0.65 && colour.b > 0.65, "dust is near white");
    }
    assert!(colours[0].r > colours[1].r && colours[1].r > colours[2].r, "the top is the lit face");
    assert!(colours[0].a > 0.5, "a fresh puff is nearly opaque");
    // The three faces meet along the cube's near vertical edge, so it reads as one block.
    assert_eq!(faces.left[1], faces.right[0]);
    assert_eq!(faces.top[2], faces.left[1]);

    dust.advance(BURST_DUST.ms * 0.75);
    draws.clear();
    dust.collect(projection, &mut draws);
    let faded = match &draws[0].kind {
        crate::assets::sprites::DrawKind::Voxel { colours, .. } => colours[0].a,
        _ => unreachable!(),
    };
    assert!(faded < colours[0].a, "it fades as it rises");
}

#[test]
fn dust_behind_the_feet_sorts_under_the_player_and_dust_in_front_over_it() {
    // One puff of dust round the feet: its voxels spread all the way round, so some belong
    // behind what stands on the column and some in front of it.
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.feedback = PlayerFeedback { jumps: 1, ..PlayerFeedback::default() };
    react(&mut dust, &player, 0.0);

    let behind = crate::assets::sprites::scene_key(4.5, 4.5, 2.0, crate::PLAYER_BEHIND_LAYER, TILE / 2.0);
    let front = crate::assets::sprites::scene_key(4.5, 4.5, 2.0, crate::PLAYER_FRONT_LAYER, TILE / 2.0);
    let projection = ProjectionConfig {
        tile_width: TILE,
        tile_height: TILE / 2.0,
        elevation_step: Some(160.0),
        origin_x: 0.0,
        origin_y: 0.0,
    };
    let mut draws = Vec::new();
    dust.collect(projection, &mut draws);

    let under = draws
        .iter()
        .filter(|draw| compare_draw_keys(&draw.key, &behind) == std::cmp::Ordering::Less)
        .count();
    let over = draws
        .iter()
        .filter(|draw| compare_draw_keys(&draw.key, &front) == std::cmp::Ordering::Greater)
        .count();
    assert!(under > 0, "the dust behind the feet is drawn before the figure");
    assert!(over > 0, "and the dust in front of them after it");
    assert_eq!(under + over, draws.len(), "every cube is on one side or the other");
}

#[test]
fn the_dust_layer_sits_between_the_ground_and_the_player() {
    use crate::terrain::terrain_view_blocks::TERRAIN_LAYER;
    const {
        assert!(DUST_BEHIND_LAYER > TERRAIN_LAYER);
        assert!(DUST_BEHIND_LAYER < crate::PLAYER_BEHIND_LAYER);
        assert!(DUST_BEHIND_LAYER < crate::ENTITY_LAYER);
    };
    // The nudge that puts a cube in front can only reorder things sharing one cell: it is far
    // below what a block of elevation adds to a depth, let alone a row of columns.
    const {
        assert!(DUST_FRONT_DEPTH < 0.001, "the nudge never jumps a cube to another column");
    };
}
