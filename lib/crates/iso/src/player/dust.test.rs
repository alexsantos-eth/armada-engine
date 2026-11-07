//! Tests for the puffs of dust, against the behaviour of the TypeScript client's
//! `player-view/feedback.ts`: the fade, the scatter, the easing, the depth and the geometry.

use super::*;

const ZERO: GridPoint = GridPoint { x: 0.0, y: 0.0 };

#[test]
fn a_puff_fades_over_its_life_and_then_is_gone() {
    let fresh = get_dust(0.0, DUST_MS, DUST_ALPHA).expect("a puff just raised is visible");
    assert_eq!(fresh.progress, 0.0);
    assert!((fresh.alpha - DUST_ALPHA).abs() < 1e-12, "it starts at its shape's own opacity");

    let half = get_dust(DUST_MS / 2.0, DUST_MS, DUST_ALPHA).expect("halfway through it is visible");
    assert!((half.progress - 0.5).abs() < 1e-12);
    assert!((half.alpha - DUST_ALPHA / 2.0).abs() < 1e-12, "it fades in step with its life");

    assert!(get_dust(DUST_MS, DUST_MS, DUST_ALPHA).is_none(), "at its end it is gone");
    assert!(get_dust(DUST_MS * 2.0, DUST_MS, DUST_ALPHA).is_none(), "and stays gone after it");
}

#[test]
fn a_burst_scatters_its_voxels_round_the_feet() {
    let voxels = get_dust_voxels(BURST_DUST, 7, ZERO, ZERO);
    assert_eq!(voxels.len(), BURST_DUST.voxels, "a puff has its shape's voxels");
    for voxel in &voxels {
        let radius = voxel.x.hypot(voxel.y);
        assert!(
            radius >= BURST_DUST.radius.0 - 1e-9 && radius <= BURST_DUST.radius.1 + 1e-9,
            "every voxel starts within its shape's ring, not at {radius}"
        );
        assert!(
            voxel.size >= BURST_DUST.size.0 && voxel.size <= BURST_DUST.size.1,
            "and within its shape's sizes"
        );
        assert!(voxel.rise > 0.0, "a burst of dust rises");
    }
    // Even angles: the twelve voxels of a burst are spread round the feet rather than bunched.
    let mut angles: Vec<f64> = voxels.iter().map(|voxel| voxel.y.atan2(voxel.x)).collect();
    angles.sort_by(f64::total_cmp);
    for pair in angles.windows(2) {
        assert!(pair[1] - pair[0] > 0.05, "two voxels of one puff do not sit on each other");
    }
}

#[test]
fn two_puffs_raised_in_turn_do_not_look_alike() {
    let first = get_dust_voxels(BURST_DUST, 1, ZERO, ZERO);
    let second = get_dust_voxels(BURST_DUST, 2, ZERO, ZERO);
    assert!(
        first.iter().zip(&second).any(|(a, b)| (a.x - b.x).abs() > 1e-6),
        "the next puff is scattered differently"
    );
    let again = get_dust_voxels(BURST_DUST, 1, ZERO, ZERO);
    assert!(
        first.iter().zip(&again).all(|(a, b)| (a.x - b.x).abs() < 1e-12 && a.shade == b.shade),
        "the same seed scatters the same way, so a frame drawn twice draws the same dust"
    );
}

#[test]
fn a_kick_pushes_the_puff_away_from_where_the_player_runs() {
    // Running towards +x: the kick points back, so the dust leaves behind the feet.
    let kick = GridPoint { x: -1.0, y: 0.0 };
    let voxels = get_dust_voxels(KICK_DUST, 3, kick, ZERO);
    let middle: f64 = voxels.iter().map(|voxel| voxel.x).sum::<f64>() / voxels.len() as f64;
    assert!(middle < 0.0, "the puff sits behind the feet, not under them");
    let drifted: f64 = voxels
        .iter()
        .map(|voxel| get_dust_voxel_at(*voxel, 1.0).x)
        .sum::<f64>()
        / voxels.len() as f64;
    assert!(drifted < middle, "and keeps going that way as it drifts");
}

#[test]
fn every_shade_of_dust_is_near_white() {
    for voxel in get_dust_voxels(BURST_DUST, 11, ZERO, ZERO) {
        for shift in [16u32, 8, 0] {
            let channel = (voxel.shade >> shift) & 0xff;
            assert!(channel >= 0xdb, "dust is white to a light grey, not {:#08x}", voxel.shade);
        }
    }
    assert_eq!(mix_color(DUST_COLORS, 0.0), DUST_COLORS.0, "one end of the mix is one colour");
    assert_eq!(mix_color(DUST_COLORS, 1.0), DUST_COLORS.1, "and the other the other");
}

#[test]
fn a_voxel_drifts_and_rises_fast_at_first_and_shrinks_as_it_fades() {
    let voxel = DustVoxel {
        x: 0.0,
        y: 0.0,
        drift_x: 0.2,
        drift_y: 0.0,
        lift: 0.05,
        rise: 0.1,
        size: 0.06,
        shade: 0xffffff,
    };
    let early = get_dust_voxel_at(voxel, 0.25);
    let late = get_dust_voxel_at(voxel, 0.75);
    assert!(
        early.x / 0.25 > (late.x - early.x) / 0.5,
        "it slows down: the first quarter of its life covers more ground than the next half"
    );
    let start = get_dust_voxel_at(voxel, 0.0);
    assert_eq!(start.height, voxel.lift, "it starts at its lift above the feet");
    assert_eq!(start.size, voxel.size);
    let end = get_dust_voxel_at(voxel, 1.0);
    assert!((end.height - (voxel.lift + voxel.rise)).abs() < 1e-12, "and ends at its full rise");
    assert!(end.size < start.size, "and smaller than it started");
}

#[test]
fn dust_over_the_far_half_of_a_column_is_drawn_behind_what_stands_there() {
    let feet = GridPoint { x: 4.0, y: 4.0 };
    let flat = |_: i32, _: i32| Some(2.0);

    let far = get_dust_column(GridPoint { x: 4.2, y: 4.0 }, feet, 2.0, flat);
    assert_eq!((far.x, far.y), (4, 4), "it is still over the feet's own column");
    assert!(far.behind, "past the feet it belongs behind the tree that grows there");

    let near = get_dust_column(GridPoint { x: 3.8, y: 4.0 }, feet, 2.0, flat);
    assert!(!near.behind, "before them it belongs in front of it");
}

#[test]
fn dust_that_drifts_onto_a_neighbour_takes_that_column_and_its_top() {
    let feet = GridPoint { x: 4.0, y: 4.0 };
    // A step up to the east: the dust that drifts onto it is drawn on its own higher top.
    let stepped = |x: i32, _y: i32| Some(if x >= 5 { 3.0 } else { 2.0 });
    let onto = get_dust_column(GridPoint { x: 4.6, y: 4.0 }, feet, 2.0, stepped);
    assert_eq!((onto.x, onto.y), (5, 4), "it is over the neighbour now");
    assert_eq!(
        onto.elevation, 2.0,
        "a top above the feet is cut to the block the feet are level with, so the wall hides it"
    );

    // Dust that drifts off the edge of the loaded world keeps the feet's own column.
    let edge = |x: i32, _y: i32| (x < 5).then_some(2.0);
    let off = get_dust_column(GridPoint { x: 4.6, y: 4.0 }, feet, 2.0, edge);
    assert_eq!((off.x, off.y), (4, 4), "with no column there it stays with the feet");
    assert_eq!(off.elevation, 2.0);
}

#[test]
fn a_voxel_is_drawn_as_the_three_faces_of_a_block() {
    let faces = voxel_faces(0.5, 280.0, 140.0, 160.0);
    let (w, t, v) = (0.5 * 280.0 / 2.0, 0.5 * 140.0 / 2.0, 0.5 * 160.0);
    assert_eq!(faces.top[0], (0.0, -v - t), "the top's far corner is a block's body above");
    assert_eq!(faces.top[1], (w, -v), "and its sides are half a tile across");
    assert_eq!(faces.left[2], (0.0, t), "the left face reaches down to the near corner");
    assert_eq!(faces.right[2], (w, 0.0), "and the right one to the cell's east corner");
    // The two side faces meet along the voxel's front edge, so there is no seam between them.
    assert_eq!(faces.left[1], faces.right[0]);
    assert_eq!(faces.left[2], faces.right[3]);
    // The top's near corner is the top of that shared edge.
    assert_eq!(faces.top[2], faces.left[1]);

    let bigger = voxel_faces(1.0, 280.0, 140.0, 160.0);
    assert_eq!(bigger.top[1].0, faces.top[1].0 * 2.0, "size scales the whole voxel");
}
