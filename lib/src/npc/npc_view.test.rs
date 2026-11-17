//! Tests for the characters' animation bookkeeping.

use iso::grid::WorldCoord;

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

fn resting() -> Npc {
    Npc::new(3, WorldCoord { x: 4, y: 4 }, 0)
}

fn walking() -> Npc {
    let mut npc = resting();
    npc.heading = Some((1, 0));
    npc.direction = GridPoint { x: 1.0, y: 0.0 };
    npc
}

#[test]
fn a_character_only_ever_walks_or_stands() {
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
    assert!(sheets.climb_poses.is_none() && sheets.jump_poses.is_none());
    assert!(sheets.swim_poses.is_none() && sheets.flip_poses.is_none());
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
    let (one, other) = (resting(), Npc::new(9, WorldCoord { x: 1, y: 1 }, 0));
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
