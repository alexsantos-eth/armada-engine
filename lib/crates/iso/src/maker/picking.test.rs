use super::*;
use crate::grid::WorldCoord;
use crate::projection::{GridPoint, ProjectionConfig, project_block};

const PROJECTION: ProjectionConfig = ProjectionConfig {
    tile_width: 280.0,
    tile_height: 140.0,
    elevation_step: Some(100.0),
    origin_x: 480.0,
    origin_y: 300.0,
};

fn centre_of(cell: WorldCoord, elevation: i32) -> ScreenPoint {
    let block = project_block(
        GridPoint {
            x: f64::from(cell.x) + 0.5,
            y: f64::from(cell.y) + 0.5,
        },
        f64::from(elevation),
        PROJECTION,
    );
    ScreenPoint {
        x: block.screen_x,
        y: block.screen_y,
    }
}

#[test]
fn the_centre_of_a_flat_cell_picks_that_cell() {
    let cell = WorldCoord { x: 2, y: -3 };
    let picked = pick_column(centre_of(cell, 0), PROJECTION, -3..=8, |_| Some(0));
    assert_eq!(picked, Some(cell));
}

#[test]
fn a_raised_cell_is_picked_at_its_own_top() {
    let cell = WorldCoord { x: 1, y: 1 };
    let at = |coord: WorldCoord| Some(if coord == cell { 3 } else { 0 });
    assert_eq!(
        pick_column(centre_of(cell, 3), PROJECTION, -3..=8, at),
        Some(cell)
    );
}

#[test]
fn the_nearer_top_wins_over_the_flat_ground_behind_it() {
    let raised = WorldCoord { x: 0, y: 0 };
    let behind = WorldCoord { x: 0, y: 1 };
    let at = |coord: WorldCoord| Some(if coord == raised { 2 } else { 0 });
    let point = centre_of(raised, 2);
    assert_eq!(pick_column(point, PROJECTION, -3..=8, at), Some(raised));
    assert_ne!(pick_column(point, PROJECTION, -3..=8, at), Some(behind));
}

#[test]
fn a_point_over_a_cell_with_no_column_picks_nothing() {
    let picked = pick_column(
        centre_of(WorldCoord { x: 4, y: 4 }, 0),
        PROJECTION,
        -3..=8,
        |_| None,
    );
    assert_eq!(picked, None);
}

#[test]
fn a_level_outside_the_searched_range_is_not_picked() {
    let cell = WorldCoord { x: 0, y: 0 };
    let at = |coord: WorldCoord| (coord == cell).then_some(9);
    assert_eq!(
        pick_column(centre_of(cell, 9), PROJECTION, -3..=8, at),
        None
    );
}

#[test]
fn a_projection_without_an_elevation_step_falls_back_to_half_a_tile() {
    let flat = ProjectionConfig {
        elevation_step: None,
        ..PROJECTION
    };
    let cell = WorldCoord { x: -2, y: 5 };
    let block = project_block(
        GridPoint {
            x: f64::from(cell.x) + 0.5,
            y: f64::from(cell.y) + 0.5,
        },
        1.0,
        flat,
    );
    let picked = pick_column(
        ScreenPoint {
            x: block.screen_x,
            y: block.screen_y,
        },
        flat,
        0..=4,
        |coord| (coord == cell).then_some(1),
    );
    assert_eq!(picked, Some(cell));
}
