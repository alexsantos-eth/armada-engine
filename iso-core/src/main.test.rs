use super::*;

#[test]
fn every_screen_direction_moves_the_marker_in_that_direction() {
    let projection = ProjectionConfig {
        tile_width: 80.0,
        tile_height: 40.0,
        elevation_step: None,
        origin_x: 0.0,
        origin_y: 0.0,
    };
    for (horizontal, vertical) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
        let world = movement_delta(horizontal, vertical, 1.0, projection);
        let screen = project_grid_point(world, projection);
        assert_eq!(screen.x, f64::from(horizontal) * projection.tile_width);
        assert_eq!(screen.y, f64::from(vertical) * projection.tile_height);
    }
}
