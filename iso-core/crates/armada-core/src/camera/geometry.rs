//! Pure camera geometry on the documented world axes; no rendering resources.

use crate::projection::{
    GridPoint, ProjectionConfig, ScreenPoint, project_grid_point, unproject_screen_delta,
};

pub const CAMERA_FOLLOW_HALF_LIFE_MS: f64 = 90.0;
const FOLLOW_SNAP_DISTANCE: f64 = 1e-3;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CameraBounds {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CameraLimits {
    pub min_zoom: f64,
    pub max_zoom: f64,
    pub bounds: CameraBounds,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScreenSize {
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CameraTransform {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InvalidCameraLimits;

impl CameraLimits {
    pub fn validate(self) -> Result<Self, InvalidCameraLimits> {
        let b = self.bounds;
        if [
            self.min_zoom,
            self.max_zoom,
            b.min_x,
            b.min_y,
            b.max_x,
            b.max_y,
        ]
        .iter()
        .all(|value| value.is_finite())
            && self.min_zoom > 0.0
            && self.min_zoom <= self.max_zoom
            && b.min_x <= b.max_x
            && b.min_y <= b.max_y
        {
            Ok(self)
        } else {
            Err(InvalidCameraLimits)
        }
    }
}

pub fn clamp_camera(camera: Camera, limits: CameraLimits) -> Camera {
    Camera {
        x: camera.x.clamp(limits.bounds.min_x, limits.bounds.max_x),
        y: camera.y.clamp(limits.bounds.min_y, limits.bounds.max_y),
        zoom: camera.zoom.clamp(limits.min_zoom, limits.max_zoom),
    }
}

pub fn create_camera(
    limits: CameraLimits,
    start: Option<Camera>,
) -> Result<Camera, InvalidCameraLimits> {
    let limits = limits.validate()?;
    let b = limits.bounds;
    let camera = start.unwrap_or(Camera {
        x: (b.min_x + b.max_x) / 2.0,
        y: (b.min_y + b.max_y) / 2.0,
        zoom: 7.0,
    });
    Ok(clamp_camera(camera, limits))
}

fn offset_on_ground(camera: Camera, delta: ScreenPoint, projection: ProjectionConfig) -> GridPoint {
    let point = unproject_screen_delta(
        ScreenPoint {
            x: delta.x / camera.zoom,
            y: delta.y / camera.zoom,
        },
        projection,
    );
    GridPoint {
        x: camera.x + point.x,
        y: camera.y + point.y,
    }
}

pub fn pan_camera(
    camera: Camera,
    delta: ScreenPoint,
    limits: CameraLimits,
    projection: ProjectionConfig,
) -> Camera {
    let centre = offset_on_ground(
        camera,
        ScreenPoint {
            x: -delta.x,
            y: -delta.y,
        },
        projection,
    );
    clamp_camera(
        Camera {
            x: centre.x,
            y: centre.y,
            zoom: camera.zoom,
        },
        limits,
    )
}

pub fn screen_to_ground(
    camera: Camera,
    viewport: ScreenSize,
    point: ScreenPoint,
    projection: ProjectionConfig,
) -> GridPoint {
    offset_on_ground(
        camera,
        ScreenPoint {
            x: point.x - viewport.width / 2.0,
            y: point.y - viewport.height / 2.0,
        },
        projection,
    )
}

pub fn zoom_camera_at(
    camera: Camera,
    factor: f64,
    anchor: ScreenPoint,
    viewport: ScreenSize,
    limits: CameraLimits,
    projection: ProjectionConfig,
) -> Camera {
    if !factor.is_finite() || factor <= 0.0 {
        return camera;
    }
    let focus = screen_to_ground(camera, viewport, anchor, projection);
    let zoom = (camera.zoom * factor).clamp(limits.min_zoom, limits.max_zoom);
    let centre = offset_on_ground(
        Camera {
            x: focus.x,
            y: focus.y,
            zoom,
        },
        ScreenPoint {
            x: viewport.width / 2.0 - anchor.x,
            y: viewport.height / 2.0 - anchor.y,
        },
        projection,
    );
    clamp_camera(
        Camera {
            x: centre.x,
            y: centre.y,
            zoom,
        },
        limits,
    )
}

pub fn camera_transform(
    camera: Camera,
    viewport: ScreenSize,
    projection: ProjectionConfig,
) -> CameraTransform {
    let centre = project_grid_point(
        GridPoint {
            x: camera.x,
            y: camera.y,
        },
        projection,
    );
    CameraTransform {
        x: viewport.width / 2.0 - centre.x * camera.zoom,
        y: viewport.height / 2.0 - centre.y * camera.zoom,
        scale: camera.zoom,
    }
}

/// Ground point shown at the same screen height as a point raised above elevation zero.
pub fn ground_point_below(
    point: GridPoint,
    elevation: f64,
    projection: ProjectionConfig,
) -> GridPoint {
    let lift = elevation
        * projection
            .elevation_step
            .unwrap_or(projection.tile_height / 2.0)
        / projection.tile_height;
    GridPoint {
        x: point.x + lift,
        y: point.y + lift,
    }
}

pub fn follow_camera(
    camera: Camera,
    target: GridPoint,
    elapsed_ms: f64,
    limits: CameraLimits,
    half_life_ms: f64,
) -> Camera {
    if !elapsed_ms.is_finite()
        || elapsed_ms <= 0.0
        || !half_life_ms.is_finite()
        || half_life_ms <= 0.0
    {
        return camera;
    }
    let t = 1.0 - 2.0_f64.powf(-elapsed_ms / half_life_ms);
    let distance = (target.x - camera.x).hypot(target.y - camera.y) * (1.0 - t);
    let (x, y) = if distance < FOLLOW_SNAP_DISTANCE {
        (target.x, target.y)
    } else {
        (
            camera.x + (target.x - camera.x) * t,
            camera.y + (target.y - camera.y) * t,
        )
    };
    clamp_camera(
        Camera {
            x,
            y,
            zoom: camera.zoom,
        },
        limits,
    )
}

#[cfg(test)]
#[path = "geometry.test.rs"]
mod tests;
