//! Isometric projection using `f64`, matching JavaScript's numeric precision.

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GridPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScreenPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ProjectionConfig {
    pub tile_width: f64,
    pub tile_height: f64,
    pub elevation_step: Option<f64>,
    pub origin_x: f64,
    pub origin_y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ProjectedBlock {
    pub screen_x: f64,
    pub base_screen_y: f64,
    pub screen_y: f64,
}

pub fn project_block(point: GridPoint, elevation: f64, config: ProjectionConfig) -> ProjectedBlock {
    let base_screen_y = config.origin_y - (point.x + point.y) * (config.tile_height / 2.0);
    ProjectedBlock {
        screen_x: config.origin_x + (point.x - point.y) * (config.tile_width / 2.0),
        base_screen_y,
        screen_y: base_screen_y
            - elevation * config.elevation_step.unwrap_or(config.tile_height / 2.0),
    }
}

pub fn project_grid_point(point: GridPoint, config: ProjectionConfig) -> ScreenPoint {
    ScreenPoint {
        x: config.origin_x + (point.x - point.y) * (config.tile_width / 2.0),
        y: config.origin_y - (point.x + point.y) * (config.tile_height / 2.0),
    }
}

pub fn unproject_screen_delta(delta: ScreenPoint, config: ProjectionConfig) -> GridPoint {
    let across = delta.x / config.tile_width;
    let up = delta.y / config.tile_height;
    GridPoint {
        x: across - up,
        y: -across - up,
    }
}

#[cfg(test)]
#[path = "geometry.test.rs"]
mod tests;
