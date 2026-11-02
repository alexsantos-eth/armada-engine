//! Temporary coloured terrain view for checking elevation and material placement.

use armada_core::grid::WorldCoord;
use armada_core::projection::{GridPoint, ProjectionConfig, project_block};
use armada_core::terrain::{TerrainColumn, TerrainMaterial};
use macroquad::prelude::*;

fn top_color(material: TerrainMaterial) -> Color {
    match material {
        TerrainMaterial::Water => Color::from_rgba(54, 145, 208, 255),
        TerrainMaterial::Sand => Color::from_rgba(224, 197, 130, 255),
        TerrainMaterial::Ground => Color::from_rgba(142, 112, 83, 255),
        TerrainMaterial::Grass => Color::from_rgba(101, 169, 99, 255),
        TerrainMaterial::Path => Color::from_rgba(177, 151, 114, 255),
    }
}

fn quad(a: Vec2, b: Vec2, c: Vec2, d: Vec2, color: Color) {
    draw_triangle(a, b, c, color);
    draw_triangle(a, c, d, color);
}

fn centre(column: TerrainColumn, projection: ProjectionConfig) -> Vec2 {
    let point = project_block(
        GridPoint {
            x: f64::from(column.coord.x) + 0.5,
            y: f64::from(column.coord.y) + 0.5,
        },
        f64::from(column.elevation),
        projection,
    );
    vec2(point.screen_x as f32, point.screen_y as f32)
}

/// Draws the given columns in their supplied far-to-near order.
/// This geometry is for reviewing the generator; atlas-backed block sprites will replace it.
pub fn draw_terrain_preview(
    columns: &[TerrainColumn],
    projection: ProjectionConfig,
    height_at: impl Fn(WorldCoord) -> Option<i32>,
) {
    let half_width = projection.tile_width as f32 / 2.0;
    let half_height = projection.tile_height as f32 / 2.0;
    let step = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0) as f32;
    for &column in columns {
        let center = centre(column, projection);
        if center.x < -half_width - 40.0
            || center.x > screen_width() + half_width + 40.0
            || center.y < -half_height - 120.0
            || center.y > screen_height() + half_height + 120.0
        {
            continue;
        }
        let north = center + vec2(0.0, -half_height);
        let east = center + vec2(half_width, 0.0);
        let south = center + vec2(0.0, half_height);
        let west = center + vec2(-half_width, 0.0);
        let top = top_color(column.surface);
        let right_neighbour = WorldCoord {
            x: column.coord.x,
            y: column.coord.y.saturating_sub(1),
        };
        let left_neighbour = WorldCoord {
            x: column.coord.x.saturating_sub(1),
            y: column.coord.y,
        };
        let right_drop = (column.elevation - height_at(right_neighbour).unwrap_or(column.elevation))
            .max(0) as f32
            * step;
        let left_drop = (column.elevation - height_at(left_neighbour).unwrap_or(column.elevation))
            .max(0) as f32
            * step;
        let (right_color, left_color) = if column.surface == TerrainMaterial::Water {
            (
                Color::from_rgba(35, 104, 164, 255),
                Color::from_rgba(44, 120, 181, 255),
            )
        } else {
            (
                Color::from_rgba(107, 84, 66, 255),
                Color::from_rgba(121, 96, 72, 255),
            )
        };
        if right_drop > 0.0 {
            let drop = vec2(0.0, right_drop);
            quad(south, east, east + drop, south + drop, right_color);
        }
        if left_drop > 0.0 {
            let drop = vec2(0.0, left_drop);
            quad(west, south, south + drop, west + drop, left_color);
        }
        quad(north, east, south, west, top);
        let edge = Color::from_rgba(27, 45, 48, 100);
        draw_line(north.x, north.y, east.x, east.y, 1.0, edge);
        draw_line(east.x, east.y, south.x, south.y, 1.0, edge);
        draw_line(south.x, south.y, west.x, west.y, 1.0, edge);
        draw_line(west.x, west.y, north.x, north.y, 1.0, edge);
    }
}
