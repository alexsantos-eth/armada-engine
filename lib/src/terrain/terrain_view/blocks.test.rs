use super::{MAX_EXPOSED_BLOCKS, drawn_lift, exposed_floor};
use iso::grid::WorldCoord;
use iso::terrain::{TerrainColumn, TerrainMaterial};

fn sand_at(elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x: 0, y: 0 },
        elevation,
        surface: TerrainMaterial::Sand,
        walkable: true,
    }
}

#[test]
fn level_ground_draws_only_its_surface() {
    assert_eq!(exposed_floor(3, [Some(3), Some(3), Some(3)]), 3);
    assert_eq!(exposed_floor(3, [None, None, None]), 3);
}

/// The corner case: both columns in front are level, and only the one across the corner is
/// lower. The blocks are clay with rounded corners, so that corner is open and the
/// background showed through it until the diagonal counted here too.
#[test]
fn a_lower_column_across_the_corner_opens_the_stack() {
    assert_eq!(exposed_floor(3, [Some(3), Some(3), Some(1)]), 1);
}

#[test]
fn a_drop_is_only_ever_followed_down_so_far() {
    assert_eq!(
        exposed_floor(3, [Some(-40), Some(3), Some(3)]),
        3 - MAX_EXPOSED_BLOCKS
    );
}

/// Sand's top face is drawn under its cell's plane, so a buried sand slab is lifted to meet the
/// base of the block above it; the column's own surface keeps its sunken top.
#[test]
fn only_a_buried_slab_is_lifted_to_its_plane() {
    assert_eq!(drawn_lift(2, sand_at(3), false, 0.2, 280.0), 56.0);
    assert_eq!(drawn_lift(3, sand_at(3), false, 0.2, 280.0), 0.0);
}

#[test]
fn a_block_whose_artwork_fills_its_cell_is_never_lifted() {
    assert_eq!(drawn_lift(1, sand_at(3), false, 0.0, 280.0), 0.0);
}

/// The terrace row against a step up is the one column whose own top rises too, so the climb
/// from the beach is two small steps instead of one and a half blocks.
#[test]
fn the_terrace_rows_own_top_is_lifted_as_well() {
    assert_eq!(drawn_lift(3, sand_at(3), true, 0.2, 280.0), 56.0);
}
