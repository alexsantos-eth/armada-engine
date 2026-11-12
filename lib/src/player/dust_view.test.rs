//! Tests for the pool of puffs: what raises dust, what reuses a slot, how a cube sorts and

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
    create_player(&Lawn, GridPoint { x, y })
}

fn react(dust: &mut DustPuffs, player: &PlayerState, moved: f64) {
    let at = DustGround {
        feet: GridPoint {
            x: player.x,
            y: player.y,
        },
        level: 2.0,
        ground: 2.0,
        moved,
        elapsed_ms: 16.0,
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

    player.feedback = PlayerFeedback {
        jumps: 1,
        ..PlayerFeedback::default()
    };
    react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 1, "a take-off puffs");

    player.feedback = PlayerFeedback {
        jumps: 1,
        landings: 1,
        impact: 0.4,
        ..PlayerFeedback::default()
    };
    react(&mut dust, &player, 0.0);
    assert_eq!(
        dust.live(),
        2,
        "and so does the landing, in a slot of its own"
    );
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
    assert_eq!(dust.live(), 0, "a small step down kicks up nothing");
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
    assert_eq!(
        dust.live(),
        2,
        "a skid puffs more often, into the next slot"
    );
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
    assert_eq!(
        dust.live(),
        RUN_PUFFS,
        "a long run keeps the pool's worth of puffs, no more"
    );
}

#[test]
fn a_puff_ends_when_its_life_is_over() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.feedback = PlayerFeedback {
        jumps: 1,
        ..PlayerFeedback::default()
    };
    react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 1);
    dust.advance(BURST_DUST.ms / 2.0);
    assert_eq!(dust.live(), 1, "halfway through it is still rising");
    dust.advance(BURST_DUST.ms);
    assert_eq!(
        dust.live(),
        0,
        "past its life it is gone, and its slot is free"
    );
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
    player.feedback = PlayerFeedback {
        jumps: 1,
        ..PlayerFeedback::default()
    };
    react(&mut dust, &player, 0.0);

    let mut draws = Vec::new();
    dust.collect(projection, &mut draws);
    assert_eq!(
        draws.len(),
        BURST_DUST.voxels,
        "one cube per voxel of the puff"
    );

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
    player.feedback = PlayerFeedback {
        jumps: 1,
        ..PlayerFeedback::default()
    };
    react(&mut dust, &player, 0.0);

    let mut draws = Vec::new();
    dust.collect(projection, &mut draws);
    let first = match &draws[0].kind {
        crate::assets::sprites::DrawKind::Voxel { colours, faces } => (*colours, *faces),
        _ => panic!("dust is queued as voxels"),
    };
    let (colours, faces) = first;
    for colour in colours {
        assert!(
            colour.r > 0.65 && colour.g > 0.65 && colour.b > 0.65,
            "dust is near white"
        );
    }
    assert!(
        colours[0].r > colours[1].r && colours[1].r > colours[2].r,
        "the top is the lit face"
    );
    assert!(colours[0].a > 0.5, "a fresh puff is nearly opaque");
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
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.feedback = PlayerFeedback {
        jumps: 1,
        ..PlayerFeedback::default()
    };
    react(&mut dust, &player, 0.0);

    let behind = crate::assets::sprites::scene_key(
        4.5,
        4.5,
        2.0,
        crate::game::config::PLAYER_BEHIND_LAYER,
        TILE / 2.0,
    );
    let front = crate::assets::sprites::scene_key(
        4.5,
        4.5,
        2.0,
        crate::game::config::PLAYER_FRONT_LAYER,
        TILE / 2.0,
    );
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
    assert!(
        under > 0,
        "the dust behind the feet is drawn before the figure"
    );
    assert!(over > 0, "and the dust in front of them after it");
    assert_eq!(
        under + over,
        draws.len(),
        "every cube is on one side or the other"
    );
}

#[test]
fn the_dust_layer_sits_between_the_ground_and_the_player() {
    use crate::terrain::terrain_view_blocks::TERRAIN_LAYER;
    const {
        assert!(DUST_BEHIND_LAYER > TERRAIN_LAYER);
        assert!(DUST_BEHIND_LAYER < crate::game::config::PLAYER_BEHIND_LAYER);
        assert!(DUST_BEHIND_LAYER < crate::game::config::ENTITY_LAYER);
    };
    const {
        assert!(
            DUST_FRONT_DEPTH < 0.001,
            "the nudge never jumps a cube to another column"
        );
    };
}

/// A swimmer in water topped at the ground level, sunk by its float depth, as the view sees it:
/// its feet are under the surface and its wake and splash break that surface.
fn swim_react(dust: &mut DustPuffs, player: &PlayerState, moved: f64) {
    let at = DustGround {
        feet: GridPoint {
            x: player.x,
            y: player.y,
        },
        level: 2.0 - 0.3,
        ground: 2.0,
        moved,
        elapsed_ms: 16.0,
        tile_height: TILE / 2.0,
    };
    dust.react(player, at, &flat);
}

#[test]
fn going_into_the_water_throws_up_a_splash() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.motion = PlayerMotionType::Sinking;
    swim_react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 0, "floating alone throws up nothing");

    player.feedback = PlayerFeedback {
        splashes: 1,
        splash_impact: 0.4,
        ..PlayerFeedback::default()
    };
    swim_react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 2, "the crown of water and the ring it leaves");

    swim_react(&mut dust, &player, 0.0);
    assert_eq!(dust.live(), 2, "the same entry does not splash twice");
}

/// The ring of a splash and the wake stay on the water: they never rise out of it.
#[test]
fn the_water_a_swimmer_leaves_on_the_surface_stays_flat() {
    assert_eq!(iso::player::RIPPLE_DUST.rise, 0.0);
    assert_eq!(iso::player::RIPPLE_DUST.lift, 0.0);
    let (wake, splash) = (WAKE_DUST.rise, iso::player::SPLASH_DUST.rise);
    assert!(wake < splash, "a crest barely rises: {wake} under {splash}");
}

#[test]
fn a_harder_entry_throws_the_water_further() {
    let soft = iso::player::splash_of(0.05);
    let hard = iso::player::splash_of(1.0);
    assert!(hard.drift.1 > soft.drift.1);
    assert!(hard.rise > soft.rise);
    assert!(hard.voxels == soft.voxels);
}

#[test]
fn swimming_along_leaves_a_wake_of_two_crests_behind() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.motion = PlayerMotionType::Swimming;
    player.velocity = GridPoint { x: 0.1, y: 0.0 };
    swim_react(&mut dust, &player, SWIM_WAKE_EVERY / 2.0);
    assert_eq!(dust.live(), 0, "half a stretch raises nothing yet");
    swim_react(&mut dust, &player, SWIM_WAKE_EVERY / 2.0);
    assert_eq!(dust.live(), 2, "one crest to each side");
    for _ in 0..RUN_PUFFS {
        swim_react(&mut dust, &player, SWIM_WAKE_EVERY);
    }
    assert_eq!(dust.live(), RUN_PUFFS, "the trail's slots are reused in turn");
}

/// The two crests of a wake run out to opposite sides of the way the swimmer came, and both
/// stay behind it.
#[test]
fn the_crests_of_a_wake_spread_to_both_sides() {
    let arms: Vec<GridPoint> = [-1.0, 1.0]
        .into_iter()
        .map(|side| turn(GridPoint { x: -1.0, y: 0.0 }, side * SWIM_WAKE_SPREAD))
        .collect();
    assert!(arms[0].y > 0.0 && arms[1].y < 0.0, "one to each side: {arms:?}");
    for arm in &arms {
        assert!(arm.x < 0.0, "both run backwards: {arm:?}");
        assert!((arm.x.hypot(arm.y) - 1.0).abs() < 1e-9, "and are unit long");
    }
}

/// Floating in place, the water rings around the swimmer every so often instead of leaving a
/// wake. Nothing of the sort happens on land.
#[test]
fn a_swimmer_floating_in_place_rings_the_water_around_it() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.motion = PlayerMotionType::Swimming;
    let frames = (SWIM_RIPPLE_MS / 16.0).ceil() as i32;
    for _ in 0..frames {
        swim_react(&mut dust, &player, 0.0);
    }
    assert_eq!(dust.live(), 1, "one ring after its while");
    for _ in 0..frames {
        swim_react(&mut dust, &player, 0.0);
    }
    assert_eq!(dust.live(), 1, "and it is the same slot every time");

    let mut walker = DustPuffs::new();
    let mut on_land = player_at(4.0, 4.0);
    on_land.motion = PlayerMotionType::Idle;
    for _ in 0..frames {
        react(&mut walker, &on_land, 0.0);
    }
    assert_eq!(walker.live(), 0, "standing on dry land rings nothing");
}

/// A swimmer on the move leaves its wake, not rings.
#[test]
fn a_swimmer_on_the_move_does_not_ring_the_water() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.motion = PlayerMotionType::Swimming;
    player.velocity = GridPoint { x: 0.1, y: 0.0 };
    let frames = (SWIM_RIPPLE_MS / 16.0).ceil() as i32;
    for _ in 0..frames {
        swim_react(&mut dust, &player, 0.0);
    }
    assert_eq!(dust.live(), 0);
}

#[test]
fn a_submerged_swimmer_leaves_no_wake_on_the_surface() {
    let mut dust = DustPuffs::new();
    let mut player = player_at(4.0, 4.0);
    player.motion = PlayerMotionType::Sinking;
    player.velocity = GridPoint { x: 0.1, y: 0.0 };
    for _ in 0..4 {
        swim_react(&mut dust, &player, SWIM_WAKE_EVERY);
    }
    assert_eq!(dust.live(), 0);
}

#[test]
fn the_water_a_swimmer_throws_up_is_blue_not_dust() {
    assert_ne!(iso::player::WATER_COLORS, iso::player::DUST_COLORS);
    assert_eq!(WAKE_DUST.colors, iso::player::WATER_COLORS);
    assert_eq!(iso::player::SPLASH_DUST.colors, iso::player::WATER_COLORS);
}
