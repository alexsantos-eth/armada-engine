//! Tests for nine-slice and the screen rectangles the HUD draws with.

use super::*;

fn piece(slice: f32) -> Piece {
    Piece {
        file: "ui/x.png".into(),
        width: 200.0,
        height: 120.0,
        pad: 20.0,
        slice,
    }
}

#[test]
fn a_piece_without_slice_stretches_whole_around_the_shape() {
    let shape = Rect::new(100.0, 50.0, 80.0, 40.0);
    let parts = nine_slice(&piece(0.0), 2.0, shape);
    assert_eq!(parts.len(), 1);
    let (source, dest) = parts[0];
    assert_eq!(source, Rect::new(0.0, 0.0, 200.0, 120.0));
    assert_eq!(dest, Rect::new(90.0, 40.0, 100.0, 60.0));
}

#[test]
fn nine_slice_keeps_the_corners_at_their_natural_size() {
    let shape = Rect::new(0.0, 0.0, 300.0, 100.0);
    let parts = nine_slice(&piece(20.0), 2.0, shape);
    assert_eq!(parts.len(), 9);
    let (corner_source, corner_dest) = parts[0];
    assert_eq!(corner_source, Rect::new(0.0, 0.0, 40.0, 40.0));
    assert_eq!(corner_dest, Rect::new(-10.0, -10.0, 20.0, 20.0));
    let (_, last) = parts[8];
    assert_eq!(last.x + last.w, 310.0);
    assert_eq!(last.y + last.h, 110.0);
    let (centre_source, centre_dest) = parts[4];
    assert_eq!(centre_source, Rect::new(40.0, 40.0, 120.0, 40.0));
    assert_eq!(centre_dest, Rect::new(10.0, 10.0, 280.0, 80.0));
}

#[test]
fn a_shape_smaller_than_its_corners_shrinks_them() {
    let shape = Rect::new(0.0, 0.0, 10.0, 10.0);
    let parts = nine_slice(&piece(20.0), 2.0, shape);
    let total: f32 = parts[0..3].iter().map(|(_, dest)| dest.w).sum();
    assert!((total - 30.0).abs() < 1e-4, "{total}");
    assert!(parts.iter().all(|(_, dest)| dest.w >= 0.0 && dest.h >= 0.0));
}
