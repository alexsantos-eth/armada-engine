use super::*;
use armada_core::assets::InkBox;

#[test]
fn an_inks_extent_is_the_rectangle_the_sprite_is_drawn_into() {
    let ink = InkBox { x: -0.2, y: -0.5, width: 0.4, height: 0.6 };
    let extent = extent_of_ink(ink, 200.0);

    // The same numbers `ink_layout` draws with, measured from the ground point instead of from
    // the screen's origin: that is what a caster is.
    assert_eq!(extent.left, -40.0);
    assert_eq!(extent.top, -100.0);
    assert_eq!(extent.width, 80.0);
    assert_eq!(extent.height, 120.0);
}

#[test]
fn a_receiver_keeps_its_artwork_relative_to_its_feet() {
    let feet = ScreenPoint { x: 500.0, y: 300.0 };
    let layout = SpriteLayout { x: 460.0, y: 200.0, width: 80.0, height: 120.0 };
    let receiver = receiver_of(layout, feet, (4.5, 7.5), 2.0);

    assert_eq!(receiver.foot, (4.5, 7.5));
    assert_eq!(receiver.elevation, 2.0);
    assert_eq!(receiver.extent.left, -40.0);
    assert_eq!(receiver.extent.top, -100.0);
}

#[test]
fn the_nine_chunks_around_one_include_it_once() {
    let all = around(ChunkCoord { cx: 3, cy: -2 });

    assert_eq!(all.len(), 9);
    assert_eq!(all.iter().filter(|c| **c == ChunkCoord { cx: 3, cy: -2 }).count(), 1);
    assert!(all.contains(&ChunkCoord { cx: 2, cy: -3 }));
    assert!(all.contains(&ChunkCoord { cx: 4, cy: -1 }));
}

#[test]
fn a_columns_square_is_measured_from_the_areas_corner() {
    let area = MapArea::around(0, 0, 31, 31);

    assert_eq!(square_of(area, WorldCoord { x: -1, y: -1 }), Some((0, 0)));
    assert_eq!(
        square_of(area, WorldCoord { x: 0, y: 0 }),
        Some((SHADOW_MAP_PIXELS_PER_TILE, SHADOW_MAP_PIXELS_PER_TILE))
    );
    assert_eq!(square_of(area, WorldCoord { x: 40, y: 0 }), None);
}

#[test]
fn the_ground_shadow_lies_over_the_terrain_and_under_what_stands_on_it() {
    use crate::terrain_view::blocks::TERRAIN_LAYER;

    const { assert!(GROUND_SHADOW_LAYER > TERRAIN_LAYER) };
    const { assert!(GROUND_SHADOW_LAYER < crate::ENTITY_LAYER) };
    const { assert!(GROUND_SHADOW_LAYER < crate::PLAYER_BEHIND_LAYER) };
}

#[test]
fn a_clear_grid_asks_for_no_lattice() {
    use armada_core::lighting::{SHADE_COLUMNS, SHADE_ROWS, ShadowCaster, SpriteExtent, shade_grid};

    // A caster that covers the receiver, but is transparent everywhere.
    let receiver = ShadowReceiver {
        foot: (1.0, 1.0),
        elevation: 0.0,
        extent: SpriteExtent { left: -50.0, top: -100.0, width: 100.0, height: 100.0 },
    };
    let caster = ShadowCaster {
        foot: (0.0, 0.0),
        elevation: 0.0,
        extent: SpriteExtent { left: -50.0, top: -100.0, width: 100.0, height: 100.0 },
        silhouette: 0,
    };
    let light = armada_core::lighting::DAWN;
    let solid = shade_grid(
        &receiver,
        &[caster],
        &light.shadow,
        light.opacity(),
        280.0,
        93.0,
        &|_, _, _| 1.0,
        SHADE_COLUMNS,
        SHADE_ROWS,
    );

    // Dawn's light runs along −x, so a caster at the origin shades nothing at (1, 1).
    assert!(solid.is_none());
}

/// The quad is a whole cell wide but slid onto the face its block is drawn with, so that two
/// neighbours meet in the groove between them exactly once: cut instead, the groove stayed lit,
/// and left on the cell, each far corner laid a second shadow on the block behind it.
#[test]
fn a_quad_slides_onto_the_face_its_block_is_drawn_with() {
    // The manifest's measured widths, in tile widths: sand is the shallowest slab and the
    // narrowest block there is, grass a full one.
    let sand = drawn_margin(0.934_375);
    assert!((sand - 0.032_812_5).abs() < 1e-12, "sand's face falls three percent short of its cell on each side");
    assert!((drawn_margin(0.963_672) - 0.018_164).abs() < 1e-6, "grass, drawn wider, falls less short");
    assert_eq!(drawn_margin(1.0), 0.0, "a drawing that fills its cell does not move");
    assert_eq!(drawn_margin(1.4), 0.0, "and one wider than its cell is not allowed to move it");

    // Slid by its own margin, a quad's far corner lands on the far corner of its own face, and
    // its near corner on the far corner of the face in front: `0.5 + 0.5 * width` measured from
    // the cell's centre, one cell further along.
    assert!(((1.0 - sand) - (0.5 + 0.5 * 0.934_375)).abs() < 1e-12);
    assert!(((0.0 - sand) - ((0.5 + 0.5 * 0.934_375) - 1.0)).abs() < 1e-12);
}
