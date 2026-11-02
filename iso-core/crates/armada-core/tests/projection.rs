use armada_core::projection::{
    GridPoint, ProjectionConfig, ScreenPoint, project_block, project_grid_point,
    unproject_screen_delta,
};

fn config() -> ProjectionConfig {
    ProjectionConfig {
        tile_width: 40.0,
        tile_height: 20.0,
        elevation_step: Some(10.0),
        origin_x: 0.0,
        origin_y: 0.0,
    }
}

#[test]
fn projected_axes_and_elevation_match_the_documented_world() {
    let samples = [
        (GridPoint { x: 0.0, y: 0.0 }, 0.0, (0.0, 0.0, 0.0)),
        (GridPoint { x: 1.0, y: 0.0 }, 0.0, (20.0, -10.0, -10.0)),
        (GridPoint { x: 0.0, y: 1.0 }, 0.0, (-20.0, -10.0, -10.0)),
        (GridPoint { x: 1.0, y: 1.0 }, 0.0, (0.0, -20.0, -20.0)),
        (GridPoint { x: 1.0, y: -1.0 }, 0.0, (40.0, 0.0, 0.0)),
        (GridPoint { x: 0.0, y: 0.0 }, 1.0, (0.0, 0.0, -10.0)),
    ];
    for (point, height, expected) in samples {
        let actual = project_block(point, height, config());
        assert_eq!(
            (actual.screen_x, actual.base_screen_y, actual.screen_y),
            expected
        );
    }
}

#[test]
fn ground_projection_and_inverse_handle_fractional_points() {
    let config = ProjectionConfig {
        origin_x: 100.0,
        origin_y: 50.0,
        ..config()
    };
    assert_eq!(
        project_grid_point(GridPoint { x: 0.5, y: 0.5 }, config),
        ScreenPoint { x: 100.0, y: 40.0 }
    );
    let from = project_grid_point(GridPoint { x: 2.0, y: 5.0 }, config);
    let to = project_grid_point(GridPoint { x: -1.25, y: 7.5 }, config);
    let delta = unproject_screen_delta(
        ScreenPoint {
            x: to.x - from.x,
            y: to.y - from.y,
        },
        config,
    );
    assert_eq!(delta, GridPoint { x: -3.25, y: 2.5 });
    assert_eq!(
        unproject_screen_delta(ScreenPoint { x: 40.0, y: 0.0 }, config),
        GridPoint { x: 1.0, y: -1.0 }
    );
    assert_eq!(
        unproject_screen_delta(ScreenPoint { x: 0.0, y: -20.0 }, config),
        GridPoint { x: 1.0, y: 1.0 }
    );
}

#[test]
fn elevation_step_defaults_to_half_tile_height() {
    let config = ProjectionConfig {
        elevation_step: None,
        ..config()
    };
    assert_eq!(
        project_block(GridPoint { x: 0.0, y: 0.0 }, 2.0, config).screen_y,
        -20.0
    );
}
