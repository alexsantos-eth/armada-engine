use super::*;
use crate::assets::sprites::DrawKind;
use iso::lighting::{DAWN, ShadowProjection};

const TILE_WIDTH: f64 = 280.0;

fn projection() -> ProjectionConfig {
    ProjectionConfig {
        tile_width: TILE_WIDTH,
        tile_height: TILE_WIDTH / 2.0,
        elevation_step: Some(140.0),
        origin_x: 600.0,
        origin_y: 400.0,
    }
}

/// The player as the client draws it: feet at the ground point, about a block tall.
fn layout(feet: ScreenPoint) -> SpriteLayout {
    SpriteLayout {
        x: feet.x - 60.0,
        y: feet.y - 200.0,
        width: 120.0,
        height: 200.0,
    }
}

fn frame() -> SpriteFrame {
    SpriteFrame {
        x: 0,
        y: 0,
        width: 64,
        height: 64,
    }
}

fn collect(
    light: &PhaseLight,
    level: f64,
    ground_at: impl Fn(i32, i32) -> Option<CellGround>,
) -> Vec<SpriteDraw> {
    let mut out = Vec::new();
    let feet = ScreenPoint { x: 120.0, y: 300.0 };
    collect_moving_shadow(
        light,
        3,
        frame(),
        layout(feet),
        feet,
        (10.5, 20.5),
        level,
        projection(),
        ground_at,
        &mut out,
    );
    out
}

fn at(level: f64) -> CellGround {
    CellGround {
        level,
        elevation: level,
        material: TerrainMaterial::Grass,
    }
}

fn flat() -> impl Fn(i32, i32) -> Option<CellGround> {
    |_, _| Some(at(2.0))
}

#[test]
fn the_shadow_is_queued_a_piece_per_surface_it_lands_on() {
    let draws = collect(&DAWN, 2.0, flat());
    assert!(draws.len() > 1, "a figure a block tall crosses more than one cell at dawn");
    for draw in &draws {
        match &draw.kind {
            DrawKind::Silhouette { texture, points, uv, opacity, .. } => {
                assert_eq!(*texture, 3, "it is drawn from the caster's own texture");
                assert!(points.len() >= 3);
                assert_eq!(points.len(), uv.len());
                assert!((f64::from(*opacity) - DAWN.opacity()).abs() < 1e-6);
            }
            _ => panic!("a moving shadow is a silhouette"),
        }
        assert_eq!(draw.key.layer, GROUND_SHADOW_LAYER);
    }
}

#[test]
fn a_piece_is_projected_onto_the_level_its_cell_is_drawn_at() {
    // Sand: its top is drawn half a block under the elevation it sorts by, so the shadow on it
    // is drawn half an elevation step lower than the same shadow on a cell that is not sunken.
    let sunken = collect(&DAWN, 2.0, |_, _| {
        Some(CellGround {
            level: 1.5,
            elevation: 2.0,
            material: TerrainMaterial::Sand,
        })
    });
    let lowest = |draws: &[SpriteDraw]| {
        draws
            .iter()
            .filter_map(|draw| match &draw.kind {
                DrawKind::Silhouette { points, .. } => {
                    Some(points.iter().map(|point| point.1).fold(f64::NEG_INFINITY, f64::max))
                }
                _ => None,
            })
            .fold(f64::NEG_INFINITY, f64::max)
    };
    assert!(
        lowest(&sunken) > lowest(&collect(&DAWN, 2.0, flat())),
        "a sunken top puts the shadow lower on screen"
    );
}

#[test]
fn a_step_in_the_ground_takes_the_shadow_down_its_wall() {
    // A step up across the light's way: the wall between the two levels is one the camera sees,
    // and the shadow climbs it instead of jumping the gap.
    let draws = collect(&DAWN, 2.0, |_, y| {
        Some(at(if y >= 21 { 3.0 } else { 2.0 }))
    });
    // A wall piece is one whose corners span more than one level, which a flat cell's cannot.
    let projection = projection();
    let spans_a_wall = draws.iter().any(|draw| match &draw.kind {
        DrawKind::Silhouette { points, .. } => {
            let high = points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
            let low = points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);
            // A cell's own top is at most half a tile tall on screen; a wall is a whole block.
            low - high > projection.tile_height / 2.0 + 1.0
        }
        _ => false,
    });
    assert!(spans_a_wall, "the shadow is laid down the face of the step");
}

#[test]
fn a_cell_the_world_has_not_loaded_takes_no_piece() {
    let draws = collect(&DAWN, 2.0, |x, _| (x == 10).then_some(at(2.0)));
    assert!(!draws.is_empty());
    let projection = projection();
    let left = project_block(GridPoint { x: 10.0, y: 0.0 }, 0.0, projection).screen_x;
    for draw in &draws {
        let DrawKind::Silhouette { points, .. } = &draw.kind else {
            panic!("a moving shadow is a silhouette");
        };
        assert!(points.iter().all(|point| point.0 <= left + projection.tile_width * 6.0));
    }
}

#[test]
fn a_phase_whose_shadows_are_invisible_queues_nothing() {
    let dark = PhaseLight {
        shadow: ShadowProjection {
            alpha: 0.0,
            ..DAWN.shadow
        },
        shadow_strength: 0.0,
    };
    assert!(collect(&dark, 2.0, flat()).is_empty());
}

#[test]
fn a_sprite_with_no_artwork_above_its_feet_queues_nothing() {
    let mut out = Vec::new();
    let feet = ScreenPoint { x: 120.0, y: 300.0 };
    collect_moving_shadow(
        &DAWN,
        0,
        frame(),
        SpriteLayout {
            x: feet.x - 60.0,
            y: feet.y,
            width: 120.0,
            height: 200.0,
        },
        feet,
        (10.5, 20.5),
        2.0,
        projection(),
        flat(),
        &mut out,
    );
    assert!(out.is_empty());
}
