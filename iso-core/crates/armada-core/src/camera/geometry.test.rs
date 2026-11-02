use crate::camera::{
    Camera, CameraBounds, CameraLimits, ScreenSize, camera_transform, create_camera, follow_camera,
    ground_point_below, pan_camera, screen_to_ground, zoom_camera_at,
};
use crate::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_grid_point};

const PROJECTION: ProjectionConfig = ProjectionConfig {
    tile_width: 40.0,
    tile_height: 20.0,
    elevation_step: None,
    origin_x: 0.0,
    origin_y: 0.0,
};
const VIEWPORT: ScreenSize = ScreenSize {
    width: 800.0,
    height: 600.0,
};
const LIMITS: CameraLimits = CameraLimits {
    min_zoom: 1.0,
    max_zoom: 8.0,
    bounds: CameraBounds {
        min_x: -1_000.0,
        min_y: -1_000.0,
        max_x: 1_000.0,
        max_y: 1_000.0,
    },
};

fn screen(camera: Camera, ground: GridPoint) -> ScreenPoint {
    let transform = camera_transform(camera, VIEWPORT, PROJECTION);
    let point = project_grid_point(ground, PROJECTION);
    ScreenPoint {
        x: transform.x + point.x * transform.scale,
        y: transform.y + point.y * transform.scale,
    }
}

#[test]
fn documented_axes_govern_pan_and_screen_conversion() {
    let camera = Camera {
        x: 10.0,
        y: 10.0,
        zoom: 1.0,
    };
    let panned = pan_camera(camera, ScreenPoint { x: 40.0, y: 0.0 }, LIMITS, PROJECTION);
    assert_eq!(
        panned,
        Camera {
            x: 9.0,
            y: 11.0,
            zoom: 1.0
        }
    );
    let point = ScreenPoint { x: 123.0, y: 456.0 };
    let ground = screen_to_ground(camera, VIEWPORT, point, PROJECTION);
    let back = screen(camera, ground);
    assert!((back.x - point.x).abs() < 1e-9);
    assert!((back.y - point.y).abs() < 1e-9);
}

#[test]
fn zoom_preserves_ground_below_anchor() {
    let camera = Camera {
        x: 10.0,
        y: 12.0,
        zoom: 2.0,
    };
    let anchor = ScreenPoint { x: 700.0, y: 100.0 };
    let ground = screen_to_ground(camera, VIEWPORT, anchor, PROJECTION);
    let zoomed = zoom_camera_at(camera, 1.5, anchor, VIEWPORT, LIMITS, PROJECTION);
    assert_eq!(zoomed.zoom, 3.0);
    let back = screen(zoomed, ground);
    assert!((back.x - anchor.x).abs() < 1e-9);
    assert!((back.y - anchor.y).abs() < 1e-9);
}

#[test]
fn elevation_and_follow_match_the_ground_contract() {
    assert_eq!(
        ground_point_below(GridPoint { x: 1.0, y: 2.0 }, 2.0, PROJECTION),
        GridPoint { x: 2.0, y: 3.0 }
    );
    let start = Camera {
        x: 0.0,
        y: 0.0,
        zoom: 2.0,
    };
    let half = follow_camera(start, GridPoint { x: 8.0, y: -4.0 }, 100.0, LIMITS, 100.0);
    assert_eq!(
        half,
        Camera {
            x: 4.0,
            y: -2.0,
            zoom: 2.0
        }
    );
    assert_eq!(
        follow_camera(start, GridPoint { x: 5.0, y: 5.0 }, f64::NAN, LIMITS, 100.0),
        start
    );
    assert!(
        create_camera(
            CameraLimits {
                min_zoom: 0.0,
                ..LIMITS
            },
            None
        )
        .is_err()
    );
}
