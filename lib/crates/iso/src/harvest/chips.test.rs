//! Tests for the chips a blow knocks off: their colours and how a felling outdoes a blow.

use super::*;

#[test]
fn chips_go_from_the_item_s_colour_to_a_darker_shade_of_it() {
    let shape = strike_chips(0xa0703c);
    assert_eq!(shape.colors.0, 0xa0703c);
    assert_eq!(shape.colors.1, darker(0xa0703c));
    let (r, g, b) = (0x60, 0x43, 0x24);
    assert_eq!(darker(0xa0703c), (r << 16) | (g << 8) | b);
}

#[test]
fn without_a_colour_the_chips_are_dust() {
    assert_eq!(strike_chips_of(None).colors, crate::player::DUST_COLORS);
}

#[test]
fn a_felling_throws_more_chips_wider_than_a_blow() {
    let blow = strike_chips(0x9c9a94);
    let fell = felled_chips(0x9c9a94);
    assert!(fell.voxels > blow.voxels);
    assert!(fell.drift.1 > blow.drift.1);
    assert!(fell.ms >= blow.ms);
}

#[test]
fn the_blow_lands_between_the_target_and_the_player() {
    let at = strike_point(
        crate::grid::WorldCoord { x: 2, y: 0 },
        crate::projection::GridPoint { x: 0.0, y: 0.0 },
    );
    assert!(at.x > 1.0 && at.x < 2.0, "{at:?}");
    assert_eq!(at.y, 0.0);
}
