//! Screen culling and chunk selection on the fixed isometric axes.

use super::geometry::{Camera, ScreenSize, camera_transform, screen_to_ground};
use crate::grid::{ChunkCoord, WorldRect, chunk_rect, chunks_in_rect};
use crate::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_grid_point};

pub const CAMERA_CULL_MARGIN: f64 = 0.1;
pub const CHUNK_VIEW_MARGIN: f64 = 0.1;
pub const CHUNK_VIEW_RISE: f64 = 10.0;
pub const CHUNK_VIEW_DROP: f64 = 4.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScreenRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn cull_rect(viewport: ScreenSize, margin: f64) -> ScreenRect {
    let mx = viewport.width * margin;
    let my = viewport.height * margin;
    ScreenRect {
        x: -mx,
        y: -my,
        width: viewport.width + 2.0 * mx,
        height: viewport.height + 2.0 * my,
    }
}

pub fn needs_cull(
    previous: Option<Camera>,
    camera: Camera,
    viewport: ScreenSize,
    projection: ProjectionConfig,
    margin: f64,
) -> bool {
    let Some(previous) = previous else {
        return true;
    };
    if previous.zoom != camera.zoom {
        return true;
    }
    let from = project_grid_point(
        GridPoint {
            x: previous.x,
            y: previous.y,
        },
        projection,
    );
    let to = project_grid_point(
        GridPoint {
            x: camera.x,
            y: camera.y,
        },
        projection,
    );
    (to.x - from.x).abs() * camera.zoom > viewport.width * margin
        || (to.y - from.y).abs() * camera.zoom > viewport.height * margin
}

/// Chunks intersecting the view, including raised terrain/entities and low water.
pub fn visible_chunks(
    camera: Camera,
    viewport: ScreenSize,
    projection: ProjectionConfig,
    margin: f64,
) -> Vec<ChunkCoord> {
    let step = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    let cull = cull_rect(viewport, margin);
    let corners = [
        ScreenPoint {
            x: cull.x,
            y: cull.y,
        },
        ScreenPoint {
            x: cull.x + cull.width,
            y: cull.y,
        },
        ScreenPoint {
            x: cull.x,
            y: cull.y + cull.height,
        },
        ScreenPoint {
            x: cull.x + cull.width,
            y: cull.y + cull.height,
        },
    ]
    .map(|point| screen_to_ground(camera, viewport, point, projection));
    let shift = CHUNK_VIEW_RISE.max(CHUNK_VIEW_DROP) * step / projection.tile_height + 1.0;
    let bounds = WorldRect {
        min_x: (corners.iter().map(|p| p.x).fold(f64::INFINITY, f64::min) - shift).floor() as i32,
        min_y: (corners.iter().map(|p| p.y).fold(f64::INFINITY, f64::min) - shift).floor() as i32,
        max_x: (corners
            .iter()
            .map(|p| p.x)
            .fold(f64::NEG_INFINITY, f64::max)
            + shift)
            .ceil() as i32,
        max_y: (corners
            .iter()
            .map(|p| p.y)
            .fold(f64::NEG_INFINITY, f64::max)
            + shift)
            .ceil() as i32,
    };
    let transform = camera_transform(camera, viewport, projection);
    let to_screen = |point: GridPoint| {
        let scene = project_grid_point(point, projection);
        ScreenPoint {
            x: scene.x * transform.scale + transform.x,
            y: scene.y * transform.scale + transform.y,
        }
    };
    let centre_distance = |chunk: ChunkCoord| {
        let rect = chunk_rect(chunk);
        let x = (f64::from(rect.min_x) + f64::from(rect.max_x)) / 2.0 - camera.x;
        let y = (f64::from(rect.min_y) + f64::from(rect.max_y)) / 2.0 - camera.y;
        x * x + y * y
    };
    let mut chunks = chunks_in_rect(bounds);
    chunks.retain(|&chunk| {
        let WorldRect {
            min_x,
            min_y,
            max_x,
            max_y,
        } = chunk_rect(chunk);
        let ground = [
            GridPoint {
                x: f64::from(min_x) - 0.5,
                y: f64::from(min_y) - 0.5,
            },
            GridPoint {
                x: f64::from(max_x) + 0.5,
                y: f64::from(min_y) - 0.5,
            },
            GridPoint {
                x: f64::from(min_x) - 0.5,
                y: f64::from(max_y) + 0.5,
            },
            GridPoint {
                x: f64::from(max_x) + 0.5,
                y: f64::from(max_y) + 0.5,
            },
        ]
        .map(to_screen);
        let left = ground.iter().map(|p| p.x).fold(f64::INFINITY, f64::min);
        let right = ground.iter().map(|p| p.x).fold(f64::NEG_INFINITY, f64::max);
        let top = ground.iter().map(|p| p.y).fold(f64::INFINITY, f64::min)
            - CHUNK_VIEW_RISE * step * camera.zoom;
        let bottom = ground.iter().map(|p| p.y).fold(f64::NEG_INFINITY, f64::max)
            + CHUNK_VIEW_DROP * step * camera.zoom;
        left < cull.x + cull.width
            && right > cull.x
            && top < cull.y + cull.height
            && bottom > cull.y
    });
    chunks.sort_by(|a, b| {
        centre_distance(*a)
            .total_cmp(&centre_distance(*b))
            .then_with(|| a.cy.cmp(&b.cy))
            .then_with(|| a.cx.cmp(&b.cx))
    });
    chunks
}

#[cfg(test)]
#[path = "visibility.test.rs"]
mod tests;
