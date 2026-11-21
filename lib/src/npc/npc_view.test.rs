//! Tests for the characters' animation bookkeeping.

use iso::grid::WorldCoord;
use iso::npc::{NpcGait, NpcKind, NpcMove, NpcStep};

use super::*;
use crate::player::player_view::{IDLE_DELAY_MS, WALK_STRIDE};

const SHEETS: PlayerSheets = PlayerSheets {
    walk_poses: Some(8),
    idle_poses: Some(8),
    climb_poses: Some(9),
    jump_poses: Some([0, 1, 2, 3, 4]),
    swim_poses: Some(10),
    flip_poses: Some(12),
};

/// A character that walks and climbs: the one the sheets of these tests are drawn for.
fn walker(id: u64, home: WorldCoord, elevation: i32) -> Npc {
    Npc::new(NpcKind::Crab, id, home, elevation).with_gait(NpcGait {
        step: 0.02,
        leash: 6,
        rest_ticks: (40, 160),
        stroll_cells: (1, 4),
        climbs: true,
        drops: true,
        sideways: false,
        turns_back: false,
        hop: None,
    })
}

fn resting() -> Npc {
    walker(3, WorldCoord { x: 4, y: 4 }, 0)
}

fn walking() -> Npc {
    let mut npc = resting();
    npc.step = Some(NpcStep {
        heading: (1, 0),
        kind: NpcMove::Walk,
        rise: 0,
        hop: false,
    });
    npc.direction = GridPoint { x: 1.0, y: 0.0 };
    npc
}

#[test]
fn a_character_walks_or_stands_and_never_swims_or_flips() {
    let moment = npc_moment(&walking(), 0.1, 16.0);
    assert_eq!(moment.motion, PlayerMotionType::Walking);
    assert_eq!(moment.moved, 0.1);
    assert_eq!(moment.jump_phase, PlayerJumpPhase::Ground);
    assert!(moment.climbing.is_none() && moment.flip.is_none());

    let moment = npc_moment(&resting(), 0.1, 16.0);
    assert_eq!(moment.motion, PlayerMotionType::Idle);
    assert_eq!(moment.moved, 0.0);

    let sheets = npc_sheets(SHEETS);
    assert_eq!(sheets.walk_poses, Some(8));
    assert_eq!(sheets.idle_poses, Some(8));
    assert_eq!(sheets.climb_poses, Some(9));
    assert!(sheets.jump_poses.is_some());
    assert!(sheets.swim_poses.is_none() && sheets.flip_poses.is_none());
}

fn stepping(kind: NpcMove, rise: i32, progress: f64) -> Npc {
    let mut npc = walker(3, WorldCoord { x: 4, y: 4 }, 1);
    npc.step = Some(NpcStep {
        heading: (1, 0),
        kind,
        rise,
        hop: false,
    });
    npc.direction = GridPoint { x: 1.0, y: 0.0 };
    npc.progress = progress;
    npc
}

#[test]
fn the_pull_over_a_ledge_plays_the_climb_sheet() {
    let npc = stepping(NpcMove::Climb, 1, 0.5);
    let moment = npc_moment(&npc, 0.1, 16.0);
    assert_eq!(moment.motion, PlayerMotionType::Climbing);
    assert!(moment.climbing.is_some());
    let mut views = NpcViews::default();
    let at = GridPoint { x: 4.4, y: 4.0 };
    assert_eq!(
        views.advance(&npc, at, 16.0, SHEETS).sheet,
        PlayerSheet::Climb
    );
}

#[test]
fn the_fall_off_a_block_plays_the_falling_pose() {
    let npc = stepping(NpcMove::Drop, -1, 0.7);
    let moment = npc_moment(&npc, 0.1, 16.0);
    assert_eq!(moment.motion, PlayerMotionType::Falling);
    assert_eq!(moment.jump_phase, PlayerJumpPhase::Fall);
    let mut views = NpcViews::default();
    let at = GridPoint { x: 4.7, y: 4.0 };
    let pose = views.advance(&npc, at, 16.0, SHEETS);
    assert_eq!((pose.sheet, pose.pose), (PlayerSheet::Jump, 3));

    let before_the_edge = stepping(NpcMove::Drop, -1, 0.2);
    assert_eq!(
        npc_moment(&before_the_edge, 0.1, 16.0).motion,
        PlayerMotionType::Walking
    );
}

#[test]
fn a_flight_of_stairs_is_walked() {
    let npc = stepping(NpcMove::Stairs, 1, 0.5);
    let moment = npc_moment(&npc, 0.1, 16.0);
    assert_eq!(moment.motion, PlayerMotionType::Walking);
    assert!(moment.climbing.is_none());
}

#[test]
fn walking_cycles_the_walk_sheet_with_the_distance_drawn() {
    let mut views = NpcViews::default();
    let npc = walking();
    let first = views.advance(&npc, GridPoint { x: 4.0, y: 4.0 }, 16.0, SHEETS);
    assert_eq!(first.sheet, PlayerSheet::Walk);
    let next = views.advance(
        &npc,
        GridPoint {
            x: 4.0 + WALK_STRIDE / 2.0,
            y: 4.0,
        },
        16.0,
        SHEETS,
    );
    assert_eq!(next.sheet, PlayerSheet::Walk);
    assert_ne!(next.pose, first.pose);
}

#[test]
fn standing_plays_the_idle_sheet() {
    let mut views = NpcViews::default();
    let npc = resting();
    let at = GridPoint { x: 4.0, y: 4.0 };
    views.advance(&npc, at, 16.0, SHEETS);
    let pose = views.advance(&npc, at, IDLE_DELAY_MS + 200.0, SHEETS);
    assert_eq!(pose.sheet, PlayerSheet::Idle);
}

#[test]
fn whoever_is_not_drawn_is_forgotten() {
    let mut views = NpcViews::default();
    let at = GridPoint { x: 4.0, y: 4.0 };
    let (one, other) = (resting(), walker(9, WorldCoord { x: 1, y: 1 }, 0));
    views.begin();
    views.advance(&one, at, 16.0, SHEETS);
    views.advance(&other, at, 16.0, SHEETS);
    views.finish();
    assert_eq!(views.len(), 2);
    views.begin();
    views.advance(&one, at, 16.0, SHEETS);
    views.finish();
    assert_eq!(views.len(), 1);
}

#[test]
fn a_coat_is_its_three_channels_opaque() {
    let color = coat_color(0xff_80_00);
    assert_eq!((color.r, color.b, color.a), (1.0, 0.0, 1.0));
    assert!((color.g - 128.0 / 255.0).abs() < 1e-6);
    assert_eq!(coat_color(0xff_ff_ff), macroquad::color::WHITE);
}

#[test]
fn a_bigger_character_casts_a_bigger_shadow_from_the_same_spot() {
    let shadow = PlayerShadow {
        centre: iso::projection::ScreenPoint { x: 10.0, y: 20.0 },
        width: 30.0,
        height: 12.0,
        alpha: 0.25,
        shear: [[1.0, 0.0], [0.0, 1.0]],
    };
    let big = scaled_shadow(shadow, 1.5);
    assert_eq!((big.width, big.height), (45.0, 18.0));
    assert_eq!(
        (big.centre, big.alpha, big.shear),
        (shadow.centre, shadow.alpha, shadow.shear)
    );
}

#[test]
fn a_hop_plays_the_jump_sheet_through_its_five_phases() {
    let mut rabbit = Npc::new(NpcKind::Rabbit, 5, WorldCoord { x: 4, y: 4 }, 0);
    rabbit.step = Some(NpcStep {
        heading: (1, 0),
        kind: NpcMove::Walk,
        rise: 0,
        hop: true,
    });
    let mut phases = Vec::new();
    for at in [0.05, 0.3, 0.5, 0.7, 0.95] {
        rabbit.progress = at / 2.0;
        let moment = npc_moment(&rabbit, 0.02, 16.0);
        assert_eq!(moment.motion, PlayerMotionType::Jumping);
        let pose = NpcViews::default().advance(
            &rabbit,
            GridPoint {
                x: 4.0 + at,
                y: 4.0,
            },
            16.0,
            SHEETS,
        );
        assert_eq!(pose.sheet, PlayerSheet::Jump);
        phases.push(pose.pose);
    }
    assert_eq!(phases, vec![0, 1, 2, 3, 4]);

    rabbit.step = rabbit.step.map(|step| NpcStep { hop: false, ..step });
    assert_eq!(
        npc_moment(&rabbit, 0.02, 16.0).jump_phase,
        PlayerJumpPhase::Ground
    );
}
