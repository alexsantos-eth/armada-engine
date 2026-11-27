//! Tests for the fall: pieces land on the real height of the ground, in water and against walls.

use super::*;

fn fragment(velocity: [f64; 3]) -> Fragment {
    Fragment {
        part: 0,
        start: [0.0, 0.0, 1.0],
        velocity,
    }
}

fn flat(top: f64) -> impl Fn(i32, i32) -> Option<Floor> {
    move |_, _| Some(Floor { top, water: false })
}

#[test]
fn a_piece_comes_to_rest_on_flat_ground() {
    let body = settle(&fragment([1.0, 0.0, 3.0]), [0.5, 0.5], 4.0, &flat(4.0));
    assert!(body.resting && !body.afloat);
    assert!((body.at[2] - 4.0).abs() < 1e-9);
    assert!(body.at[0] > 0.5);
}

#[test]
fn a_piece_thrown_off_a_ledge_falls_to_the_level_below() {
    // Columns with x < 1 are at level 3, the rest at level 1.
    let ground = |x: i32, _| {
        Some(Floor {
            top: if x < 1 { 3.0 } else { 1.0 },
            water: false,
        })
    };
    let body = settle(&fragment([2.0, 0.0, 2.5]), [0.5, 0.5], 3.0, &ground);
    assert!(body.at[0] >= 1.0, "it left the ledge: {:?}", body.at);
    assert!((body.at[2] - 1.0).abs() < 1e-9, "{:?}", body.at);
}

#[test]
fn a_piece_that_lands_in_water_floats_there() {
    let ground = |x: i32, _| {
        Some(if x < 1 {
            Floor {
                top: 2.0,
                water: false,
            }
        } else {
            Floor {
                top: 0.0,
                water: true,
            }
        })
    };
    let body = settle(&fragment([2.0, 0.0, 2.5]), [0.5, 0.5], 2.0, &ground);
    assert!(body.afloat);
    assert!((body.at[2]).abs() < 1e-9);
}

#[test]
fn a_taller_column_turns_the_piece_back() {
    // A wall of columns from x = 1 on, two blocks above the floor.
    let ground = |x: i32, _| {
        Some(Floor {
            top: if x >= 1 { 3.0 } else { 1.0 },
            water: false,
        })
    };
    let body = settle(&fragment([3.0, 0.0, 1.0]), [0.5, 0.5], 1.0, &ground);
    assert!(body.at[0] < 1.0, "{:?}", body.at);
    assert!((body.at[2] - 1.0).abs() < 1e-9);
}

#[test]
fn the_same_throw_ends_the_same_way() {
    let first = settle(&fragment([1.3, -0.7, 3.1]), [0.5, 0.5], 2.0, &flat(2.0));
    let again = settle(&fragment([1.3, -0.7, 3.1]), [0.5, 0.5], 2.0, &flat(2.0));
    assert_eq!(first, again);
}
