use super::*;
use crate::lighting::Silhouette;
use crate::lighting::bake::{ShadowCaster, SpriteExtent};
use crate::lighting::shadow::ShadowProjection;

const TILE: f64 = 100.0;
const BOX: f64 = 100.0 / 3.0;

fn behind_the_camera() -> ShadowProjection {
    let half = std::f64::consts::FRAC_1_SQRT_2;
    ShadowProjection {
        dir_x: half,
        dir_y: half,
        stretch: 1.0,
        alpha: 1.0,
    }
}

/// A sprite one tile wide and `height` px tall standing on `foot`.
fn standing(foot: (f64, f64), elevation: f64, height: f64) -> SpriteExtent {
    let _ = (foot, elevation);
    SpriteExtent {
        left: -TILE / 2.0,
        top: -height,
        width: TILE,
        height,
    }
}

fn caster(foot: (f64, f64), elevation: f64, height: f64) -> ShadowCaster {
    ShadowCaster {
        foot,
        elevation,
        extent: standing(foot, elevation, height),
        silhouette: 0,
    }
}

fn receiver(foot: (f64, f64), elevation: f64, height: f64) -> ShadowReceiver {
    ShadowReceiver {
        foot,
        elevation,
        extent: standing(foot, elevation, height),
    }
}

static OPAQUE: [u8; 4] = [255; 4];
static CLEAR: [u8; 4] = [0; 4];

fn window(plane: &'static [u8; 4]) -> impl Fn(u32) -> Option<Silhouette<'static>> {
    move |_| {
        Some(Silhouette {
            alpha: plane,
            stride: 2,
            rows: 2,
            left: 0.0,
            top: 0.0,
            right: 1.0,
            bottom: 1.0,
        })
    }
}

/// A silhouette that is opaque everywhere.
fn solid() -> impl Fn(u32) -> Option<Silhouette<'static>> {
    window(&OPAQUE)
}

#[allow(clippy::too_many_arguments)]
fn grid_of(
    receiver: &ShadowReceiver,
    casters: &[ShadowCaster],
    light: &ShadowProjection,
    alpha: &dyn Fn(u32) -> Option<Silhouette<'static>>,
) -> Option<ShadeGrid> {
    shade_grid(
        receiver,
        casters,
        light,
        1.0,
        TILE,
        BOX,
        alpha,
        None,
        SHADE_COLUMNS,
        SHADE_ROWS,
    )
}

#[test]
fn nothing_up_light_of_a_receiver_shades_it() {
    let light = behind_the_camera();
    let it = receiver((0.0, 0.0), 0.0, 80.0);
    let behind = caster((light.dir_x * 2.0, light.dir_y * 2.0), 0.0, 80.0);

    assert_eq!(grid_of(&it, &[behind], &light, &solid()), None);
}

#[test]
fn a_caster_just_up_light_shades_the_receiver() {
    let light = behind_the_camera();
    let it = receiver((light.dir_x, light.dir_y), 0.0, 80.0);
    let post = caster((0.0, 0.0), 0.0, 80.0);

    let grid = grid_of(&it, &[post], &light, &solid()).expect("a shadow lands on it");
    assert_eq!(grid.columns(), SHADE_COLUMNS);
    assert_eq!(grid.rows(), SHADE_ROWS);
    assert!(!grid.is_clear());
    assert!(grid.at(SHADE_COLUMNS / 2, SHADE_ROWS) >= grid.at(SHADE_COLUMNS / 2, 0));
}

#[test]
fn the_opacity_of_the_phase_is_already_in_the_grid() {
    let light = behind_the_camera();
    let it = receiver((light.dir_x * 0.5, light.dir_y * 0.5), 0.0, 80.0);
    let post = caster((0.0, 0.0), 0.0, 80.0);

    let full = grid_of(&it, &[post], &light, &solid()).unwrap();
    let half = shade_grid(
        &it,
        &[post],
        &light,
        0.5,
        TILE,
        BOX,
        &solid(),
        None,
        SHADE_COLUMNS,
        SHADE_ROWS,
    )
    .unwrap();

    let brightest = |grid: &ShadeGrid| {
        (0..=SHADE_ROWS)
            .flat_map(|row| (0..=SHADE_COLUMNS).map(move |column| (column, row)))
            .map(|(column, row)| grid.at(column, row))
            .fold(0.0_f32, f32::max)
    };
    assert!((brightest(&full) * 0.5 - brightest(&half)).abs() < 1e-6);
    assert!(brightest(&full) <= 1.0);
}

#[test]
fn a_caster_far_down_the_light_misses_the_receiver_altogether() {
    let light = behind_the_camera();
    let it = receiver((light.dir_x * 40.0, light.dir_y * 40.0), 0.0, 80.0);
    let post = caster((0.0, 0.0), 0.0, 80.0);

    assert_eq!(grid_of(&it, &[post], &light, &solid()), None);
}

#[test]
fn a_transparent_caster_shades_nothing() {
    let light = behind_the_camera();
    let it = receiver((light.dir_x, light.dir_y), 0.0, 80.0);
    let post = caster((0.0, 0.0), 0.0, 80.0);

    assert_eq!(grid_of(&it, &[post], &light, &window(&CLEAR)), None);
}

#[test]
fn only_the_part_of_a_caster_above_its_own_foot_is_cast() {
    let light = behind_the_camera();
    let it = receiver((light.dir_x, light.dir_y), 0.0, 80.0);
    let puddle = ShadowCaster {
        extent: SpriteExtent {
            left: -50.0,
            top: 0.0,
            width: TILE,
            height: 30.0,
        },
        ..caster((0.0, 0.0), 0.0, 30.0)
    };

    assert_eq!(grid_of(&it, &[puddle], &light, &solid()), None);
}

#[test]
fn a_receiver_with_no_artwork_has_no_grid() {
    let light = behind_the_camera();
    let nothing = ShadowReceiver {
        extent: SpriteExtent {
            left: 0.0,
            top: 0.0,
            width: 0.0,
            height: 0.0,
        },
        ..receiver((light.dir_x, light.dir_y), 0.0, 0.0)
    };

    assert_eq!(
        grid_of(&nothing, &[caster((0.0, 0.0), 0.0, 80.0)], &light, &solid()),
        None
    );
}

#[test]
fn two_casters_on_one_receiver_read_as_one_shadow() {
    let light = behind_the_camera();
    let it = receiver((light.dir_x, light.dir_y), 0.0, 80.0);
    let one = caster((0.0, 0.0), 0.0, 80.0);
    let two = caster((0.05, -0.05), 0.0, 80.0);

    let single = grid_of(&it, &[one], &light, &solid()).unwrap();
    let pair = grid_of(&it, &[one, two], &light, &solid()).unwrap();

    let darkest = |grid: &ShadeGrid| {
        (0..=SHADE_ROWS)
            .flat_map(|row| (0..=SHADE_COLUMNS).map(move |column| (column, row)))
            .map(|(column, row)| grid.at(column, row))
            .fold(0.0_f32, f32::max)
    };
    assert_eq!(darkest(&single), darkest(&pair));
}

#[test]
fn reading_past_the_edge_of_a_grid_gives_its_edge() {
    let light = behind_the_camera();
    let it = receiver((light.dir_x, light.dir_y), 0.0, 80.0);
    let grid = grid_of(&it, &[caster((0.0, 0.0), 0.0, 80.0)], &light, &solid()).unwrap();

    assert_eq!(
        grid.at(SHADE_COLUMNS + 5, SHADE_ROWS + 5),
        grid.at(SHADE_COLUMNS, SHADE_ROWS)
    );
}

/// A point of a wall is shaded by the same cut-out that shades the ground around it.
#[test]
fn a_point_is_shaded_by_a_caster_standing_up_the_light_from_it() {
    let light = ShadowProjection {
        dir_x: -1.0,
        dir_y: 0.0,
        stretch: 2.2,
        alpha: 0.34,
    };
    let post = ShadowCaster {
        foot: (5.5, 2.5),
        elevation: 0.0,
        extent: SpriteExtent {
            left: -20.0,
            top: -120.0,
            width: 40.0,
            height: 120.0,
        },
        silhouette: 0,
    };
    let under = ShadowPoint {
        x: 4.5,
        y: 2.5,
        elevation: 0.0,
    };
    let beside = ShadowPoint {
        x: 4.5,
        y: 9.5,
        elevation: 0.0,
    };

    assert!(shaded_at(under, &[post], &light, TILE, BOX, &solid(), None) > 0.0);
    assert_eq!(
        shaded_at(beside, &[post], &light, TILE, BOX, &solid(), None),
        0.0
    );
    assert_eq!(
        shaded_at(under, &[], &light, TILE, BOX, &solid(), None),
        0.0,
        "and nothing casts nothing"
    );
}

/// The ground reaches a point with no caster at all, which is what shades a cliff standing in
#[test]
fn a_point_is_shaded_by_the_ground_alone() {
    let light = ShadowProjection {
        dir_x: -1.0,
        dir_y: 0.0,
        stretch: 2.2,
        alpha: 0.34,
    };
    let field = HeightField::new(0, 0, 10, 4, |x, _| Some(if x == 5 { 4.0 } else { 0.0 }));
    let behind = ShadowPoint {
        x: 4.5,
        y: 2.5,
        elevation: 0.0,
    };

    assert!(shaded_at(behind, &[], &light, TILE, BOX, &solid(), Some(&field)) > 0.0);
    assert_eq!(
        shaded_at(
            ShadowPoint {
                elevation: 9.0,
                ..behind
            },
            &[],
            &light,
            TILE,
            BOX,
            &solid(),
            Some(&field)
        ),
        0.0,
        "over the top of it there is sun again"
    );
}
