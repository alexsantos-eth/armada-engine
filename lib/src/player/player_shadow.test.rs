use iso::lighting::{DAWN, DAY, NIGHT, SUNSET};
use iso::projection::{GridPoint, project_block};

use super::*;

const PROJECTION: ProjectionConfig = ProjectionConfig {
    tile_width: 280.0,
    tile_height: 140.0,
    elevation_step: Some(70.0),
    origin_x: 400.0,
    origin_y: 300.0,
};

fn ground() -> ScreenPoint {
    let point = project_block(GridPoint { x: 5.5, y: 5.5 }, 2.0, PROJECTION);
    ScreenPoint {
        x: point.screen_x,
        y: point.screen_y,
    }
}

#[test]
fn shadow_stays_at_ground_contact_and_shrinks_in_the_air() {
    let ground = ground();
    let grounded = player_shadow(ground, 0.0, PROJECTION, DAY);
    let airborne = player_shadow(ground, 2.0, PROJECTION, DAY);

    assert_eq!(grounded.centre, ground);
    assert_ne!(airborne.centre, ground);
    assert!(airborne.width < grounded.width);
    assert!(airborne.alpha < grounded.alpha);
}

#[test]
fn shadow_uses_an_isometric_flattening() {
    let shadow = player_shadow(ground(), 0.0, PROJECTION, DAY);

    assert!(shadow.width > shadow.height);
    assert!(shadow.width < 280.0);
}

#[test]
fn the_shadow_leans_where_the_phase_casts_its_shadows() {
    let origin = project_grid_point(GridPoint { x: 0.0, y: 0.0 }, PROJECTION);
    for (light, expected) in [
        (DAWN, (-1.0f64, 1.0f64)),
        (DAY, (-1.0f64, -1.0f64)),
        (SUNSET, (1.0f64, -1.0f64)),
        (NIGHT, (-1.0f64, -1.0f64)),
    ] {
        let (ux, uy, px) = shadow_direction(light, PROJECTION);
        let toward = project_grid_point(
            GridPoint {
                x: light.shadow.dir_x,
                y: light.shadow.dir_y,
            },
            PROJECTION,
        );
        let (dx, dy) = (toward.x - origin.x, toward.y - origin.y);
        assert!(
            (px - dx.hypot(dy)).abs() < 1e-9
                && (ux - dx / px).abs() < 1e-9
                && (uy - dy / px).abs() < 1e-9,
            "the screen direction is the projection of the world shadow direction"
        );
        assert_eq!(ux.signum(), expected.0.signum());
        assert_eq!(uy.signum(), expected.1.signum());
        assert!((ux.hypot(uy) - 1.0).abs() < 1e-12);
    }
}

#[test]
fn a_body_above_the_ground_pushes_its_shadow_down_the_sun() {
    let ground = ground();
    let (ux, uy, _) = shadow_direction(DAWN, PROJECTION);

    let lifted = player_shadow(ground, 2.0, PROJECTION, DAWN);

    let along = (lifted.centre.x - ground.x) * ux + (lifted.centre.y - ground.y) * uy;
    let across = (lifted.centre.x - ground.x) * -uy + (lifted.centre.y - ground.y) * ux;
    assert!(
        along > 0.0,
        "the shadow must move down the sun when the body rises"
    );
    assert!(across.abs() < 1e-9, "and only along the shadow direction");
}

#[test]
fn the_shear_stretches_the_blob_by_the_phases_stretch() {
    let dawn = player_shadow(ground(), 0.0, PROJECTION, DAWN);
    let night = player_shadow(ground(), 0.0, PROJECTION, NIGHT);

    let area = |shear: [[f64; 2]; 2]| shear[0][0] * shear[1][1] - shear[0][1] * shear[1][0];
    assert!(
        (area(dawn.shear).abs() / area(night.shear).abs()
            - DAWN.shadow.stretch / NIGHT.shadow.stretch)
            .abs()
            < 1e-9,
        "the shear's area scales with the phase's stretch"
    );
    assert!(area(dawn.shear).abs() > area(night.shear).abs());
}

#[test]
fn the_phases_own_light_dims_the_blob() {
    let day = player_shadow(ground(), 0.0, PROJECTION, DAY);
    let night = player_shadow(ground(), 0.0, PROJECTION, NIGHT);

    assert!(
        day.alpha > night.alpha,
        "the dim phase casts a fainter shadow"
    );
    assert!(day.alpha <= 0.28);
}
