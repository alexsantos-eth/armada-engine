//! Tests for the faces of a box.

use super::*;
use crate::player::voxel_faces;

fn close(a: [(f64, f64); 4], b: [(f64, f64); 4]) {
    for (p, q) in a.iter().zip(&b) {
        assert!(
            (p.0 - q.0).abs() < 1e-9 && (p.1 - q.1).abs() < 1e-9,
            "{a:?} vs {b:?}"
        );
    }
}

#[test]
fn a_box_as_wide_and_deep_as_a_voxel_has_its_faces() {
    let voxel = voxel_faces(0.4, 64.0, 32.0, 40.0);
    let boxed = box_faces(0.4, 0.4, 0.4, 64.0, 32.0, 40.0);
    close(boxed.top, voxel.top);
    close(boxed.left, voxel.left);
    close(boxed.right, voxel.right);
}

#[test]
fn a_longer_box_is_wider_on_screen_and_a_taller_one_reaches_higher() {
    let long = box_faces(1.0, 0.5, 1.0, 64.0, 32.0, 40.0);
    let tall = box_faces(1.0, 0.5, 2.0, 64.0, 32.0, 40.0);
    assert!(tall.top[0].1 < long.top[0].1);
    // Along x the box runs towards the right: its right-hand corner is the far end of it.
    assert!(long.top[1].0 > long.top[3].0);
}
