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

/// How strongly the blob itself stretches along the phase's shadow direction, as a fraction of
/// the phase's own stretch: the cast direction stays exact, the squash is only a fraction of it.
const CAST_STRETCH_FACTOR: f64 = 0.3;

/// How wide and tall the blob is, as a fraction of the tile.
const CAST_WIDTH: f64 = 0.30;
const CAST_HEIGHT: f64 = 0.125;

/// The blob's core alpha when the body is on the ground.
const CAST_CORE_ALPHA: f64 = 0.28;

/// How much of the core alpha the blob loses while the body is in the air.
const CAST_AIR_FADE: f64 = 0.14;

/// The phase's strongest alpha, used to normalise how strongly the phase scales the blob.
const CAST_PHASE_REFERENCE: f64 = 0.34;

/// The screen-space anisotropy of the blob: the ground square sheared along the phase's shadow
/// direction by a damped share of the phase's stretch, then projected isometrically. Determinant
/// `1 + (stretch − 1) · CAST_STRETCH_FACTOR`, so a long-shadow phase grows the blob without
/// breaking it.
pub fn cast_matrix(light: PhaseLight, projection: ProjectionConfig) -> [[f64; 2]; 2] {
    let across = projection.tile_width / 2.0;
    let down = projection.tile_height / 2.0;
    let (wx, wy) = (light.shadow.dir_x, light.shadow.dir_y);
    let stretch = 1.0 + (light.shadow.stretch - 1.0) * CAST_STRETCH_FACTOR;
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

/// A small flattened cast shadow centred on the feet: it shears along the phase's shadow
/// direction, and it slides away from the feet and fades as the body rises.
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
    let width = projection.tile_width * (CAST_WIDTH - air * 0.1);
    let height = projection.tile_width * (CAST_HEIGHT - air * 0.04);
    let shear = cast_matrix(light, projection);
    let away = lift_reach(&light.shadow, rise, projection.tile_width, box_height) * px;
    PlayerShadow {
        centre: ScreenPoint {
            x: ground.x + ux * away,
            y: ground.y + uy * away,
        },
        width,
        height,
        alpha: ((CAST_CORE_ALPHA - air * CAST_AIR_FADE) * (light.opacity() / CAST_PHASE_REFERENCE))
            .max(0.0) as f32,
        shear,
    }
}

#[cfg(test)]
#[path = "player_shadow.test.rs"]
mod tests;
