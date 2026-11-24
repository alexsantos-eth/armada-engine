//! Tests for the kit's animation curves, ported from `armada-ui.css` and `armada-ui.js`.

use super::*;

fn close(a: f32, b: f32) -> bool {
    (a - b).abs() < 1e-3
}

#[test]
fn the_bubble_pops_in_from_small_and_settles() {
    let start = bubble_pose(0.0);
    assert!(close(start.scale, 0.2) && close(start.opacity, 0.0));
    let peak = bubble_pose(POP_MS * 0.35);
    assert!(close(peak.scale, 1.12) && close(peak.opacity, 1.0));
    let shaking = bubble_pose(POP_MS * 0.45);
    assert!(close(shaking.dx, -6.0));
    let rest = bubble_pose(POP_MS + 100.0);
    assert!(close(rest.scale, 1.0) && close(rest.dx, 0.0) && close(rest.opacity, 1.0));
}

#[test]
fn the_bubble_leaves_rising_and_fading() {
    let leaving = bubble_pose(BUBBLE_HOLD_MS + OUT_MS / 2.0);
    assert!(leaving.dy < 0.0 && leaving.opacity < 1.0 && leaving.scale < 1.0);
    assert!(bubble_done(BUBBLE_HOLD_MS + OUT_MS));
    assert!(!bubble_done(BUBBLE_HOLD_MS));
}

#[test]
fn a_bump_squashes_then_comes_back() {
    let squash = bump_pose(BUMP_MS * 0.25);
    assert!(close(squash.0, 1.22) && close(squash.1, 0.86) && close(squash.2, 5.0));
    assert_eq!(bump_pose(BUMP_MS), (1.0, 1.0, 0.0));
    assert_eq!(bump_pose(BUMP_MS * 3.0), (1.0, 1.0, 0.0));
}

#[test]
fn a_flight_starts_at_the_player_rises_and_lands_on_the_slot() {
    let from = (100.0, 400.0);
    let to = (500.0, 600.0);
    let start = fly_pose(0.0, from, to);
    assert!(close(start.x, 100.0) && close(start.y, 400.0));
    let middle = fly_pose(FLY_MS / 2.0, from, to);
    assert!(
        middle.y < 400.0,
        "the arc rises above both ends: {}",
        middle.y
    );
    let end = fly_pose(FLY_MS, from, to);
    assert!(close(end.x, 500.0) && close(end.y, 600.0) && close(end.opacity, 0.0));
}

#[test]
fn the_working_tool_chops_back_and_forth() {
    assert!(close(chop_angle(0.0), 0.0));
    assert!(close(chop_angle(CHOP_MS / 2.0), -22.0));
    assert!(close(chop_angle(CHOP_MS), 0.0));
}

#[test]
fn a_pose_turns_and_scales_around_its_pivot() {
    let screen = (800.0, 600.0);
    let matrix = pose_matrix(screen, (400.0, 300.0), (2.0, 2.0), 0.0, (0.0, 0.0));
    let pivot = matrix.project_point3(Vec3::new(400.0, 300.0, 0.0));
    assert!(pivot.x.abs() < 1e-5 && pivot.y.abs() < 1e-5);
    let right = matrix.project_point3(Vec3::new(500.0, 300.0, 0.0));
    assert!(
        (right.x - 0.5).abs() < 1e-5,
        "100 px doubled is a quarter of the width: {}",
        right.x
    );
    let moved = pose_matrix(screen, (0.0, 0.0), (1.0, 1.0), 0.0, (400.0, 300.0))
        .project_point3(Vec3::new(0.0, 0.0, 0.0));
    assert!(moved.x.abs() < 1e-5 && moved.y.abs() < 1e-5);
    let turned = pose_matrix(screen, (400.0, 300.0), (1.0, 1.0), 90.0, (0.0, 0.0))
        .project_point3(Vec3::new(500.0, 300.0, 0.0));
    assert!(
        turned.x.abs() < 1e-4 && turned.y < 0.0,
        "a quarter turn clockwise on screen points down: {turned:?}"
    );
}
