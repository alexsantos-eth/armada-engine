//! The simple ground shadow that follows the player: a soft blob that leans where the phase's
//! shadows are cast, and fades as the player rises above it.

use iso::lighting::{PhaseLight, lift_reach};
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_grid_point};

/// The shadow's screen-space ellipse: where it sits, how big it is, how visible, and the
/// screen-space anisotropy that shears the blob's unsheared ground-plane shape onto the screen,
/// stretched along the phase's shadow direction. The vertex falloff (soft edge) is built from
/// this shape at draw time.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlayerShadow {
    pub centre: ScreenPoint,
    pub width: f64,
    pub height: f64,
    pub alpha: f32,
    pub shear: [[f64; 2]; 2],
}

/// The direction shadows fall along on the ground at `light`, as a screen-space unit vector,
/// and how many screen pixels one world tile of shadow reaches in that direction.
pub fn shadow_direction(light: PhaseLight, projection: ProjectionConfig) -> (f64, f64, f64) {
    let origin = project_grid_point(GridPoint { x: 0.0, y: 0.0 }, projection);
    let toward = project_grid_point(
        GridPoint {
            x: light.shadow.dir_x,
            y: light.shadow.dir_y,
        },
        projection,
    );
    let across = toward.x - origin.x;
    let down = toward.y - origin.y;
    let length = across.hypot(down);
    if length == 0.0 {
        return (1.0, 0.0, 1.0);
    }
    (across / length, down / length, length)
}

/// The screen-space anisotropy of the blob: the ground square sheared along the phase's shadow
/// direction by the phase's stretch, then projected isometrically. Determinant `stretch`, so a
/// long-shadow phase grows the blob without breaking it.
pub fn cast_matrix(light: PhaseLight, projection: ProjectionConfig) -> [[f64; 2]; 2] {
    let across = projection.tile_width / 2.0;
    let down = projection.tile_height / 2.0;
    let (wx, wy) = (light.shadow.dir_x, light.shadow.dir_y);
    let stretch = light.shadow.stretch;
    let s = stretch - 1.0;
    let t = [
        [1.0 + s * wx * wx, s * wx * wy],
        [s * wx * wy, 1.0 + s * wy * wy],
    ];
    let det = -2.0 * across * down;
    let inverse_p = [[-down / det, across / det], [down / det, across / det]];
    let p = [[across, -across], [-down, -down]];
    let pt = [
        [
            p[0][0] * t[0][0] + p[0][1] * t[1][0],
            p[0][0] * t[0][1] + p[0][1] * t[1][1],
        ],
        [
            p[1][0] * t[0][0] + p[1][1] * t[1][0],
            p[1][0] * t[0][1] + p[1][1] * t[1][1],
        ],
    ];
    [
        [
            pt[0][0] * inverse_p[0][0] + pt[0][1] * inverse_p[1][0],
            pt[0][0] * inverse_p[0][1] + pt[0][1] * inverse_p[1][1],
        ],
        [
            pt[1][0] * inverse_p[0][0] + pt[1][1] * inverse_p[1][0],
            pt[1][0] * inverse_p[0][1] + pt[1][1] * inverse_p[1][1],
        ],
    ]
}

/// A small flattened shadow anchored to the player's supporting ground: sheared along the
/// phase's shadow direction, offset away from the feet as the body rises, and fading as the
/// player rises above it.
pub fn player_shadow(
    ground: ScreenPoint,
    height: f64,
    projection: ProjectionConfig,
    light: PhaseLight,
) -> PlayerShadow {
    let rise = height.max(0.0);
    let air = (rise / 3.0).clamp(0.0, 1.0);
    let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
    let (ux, uy, px) = shadow_direction(light, projection);
    let away = lift_reach(&light.shadow, rise, projection.tile_width, box_height) * px;
    PlayerShadow {
        centre: ScreenPoint {
            x: ground.x + ux * away,
            y: ground.y + uy * away,
        },
        width: projection.tile_width * (0.28 - air * 0.1),
        height: projection.tile_width * (0.09 - air * 0.03),
        alpha: ((0.28 - air * 0.14) * (light.opacity() / 0.34)).max(0.0) as f32,
        shear: cast_matrix(light, projection),
    }
}

#[cfg(test)]
#[path = "player_shadow.test.rs"]
mod tests;
