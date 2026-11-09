use super::*;
use crate::lighting::phases::DAWN;

const TILE: f64 = 280.0;
const BOX: f64 = 280.0 * 341.0 / 1024.0;

/// A sun straight along world `-x`, so the arithmetic of a walk is readable: a shadow runs one
fn straight(stretch: f64) -> ShadowProjection {
    ShadowProjection {
        dir_x: -1.0,
        dir_y: 0.0,
        stretch,
        alpha: 0.34,
    }
}

/// Tiles of shadow one block of height throws under `light`.
fn per_block(light: &ShadowProjection) -> f64 {
    light.stretch * block_height_in_tiles(BOX, TILE)
}

fn flat(level: f64) -> impl Fn(i32, i32) -> Option<f64> {
    move |_, _| Some(level)
}

#[test]
fn open_ground_shades_nothing() {
    let field = HeightField::new(0, 0, 8, 8, flat(0.0));

    let horizon = field.horizon(4.5, 4.5, &straight(2.2), BOX, TILE);

    assert_eq!(
        horizon.coverage(0.0),
        0.0,
        "a flat field does not shade itself"
    );
}

#[test]
fn a_column_shades_the_ground_behind_it_and_not_in_front() {
    let field = HeightField::new(0, 0, 10, 2, |x, _| Some(if x == 5 { 4.0 } else { 0.0 }));
    let light = straight(2.2);

    let behind = field.horizon(4.5, 1.5, &light, BOX, TILE);
    let front = field.horizon(6.5, 1.5, &light, BOX, TILE);

    assert!(
        behind.coverage(0.0) > 0.0,
        "the column hides the sun one tile along the shadow"
    );
    assert_eq!(
        front.coverage(0.0),
        0.0,
        "and nothing on the sunlit side of it"
    );
}

#[test]
fn a_shadow_reaches_as_far_as_the_light_stretches_it() {
    let field = HeightField::new(-20, 0, 10, 2, |x, _| Some(if x == 5 { 1.0 } else { 0.0 }));
    let light = straight(2.2);
    let reach = per_block(&light);

    let inside = field.horizon(5.5 - reach * 0.5, 1.5, &light, BOX, TILE);
    let past = field.horizon(5.5 - reach * 1.5, 1.5, &light, BOX, TILE);

    assert!(
        inside.coverage(0.0) > 0.0,
        "half a block's reach away is in its shadow"
    );
    assert_eq!(
        past.coverage(0.0),
        0.0,
        "half again past its reach is back in the sun"
    );
}

/// The point of a horizon: one walk answers for every height at that place, which is how a tree
#[test]
fn a_horizon_answers_for_every_height_at_its_place() {
    let field = HeightField::new(0, 0, 10, 2, |x, _| Some(if x == 5 { 4.0 } else { 0.0 }));

    let horizon = field.horizon(4.5, 1.5, &straight(2.2), BOX, TILE);

    assert!(horizon.coverage(0.0) > 0.0, "the ground is shaded");
    assert_eq!(
        horizon.coverage(10.0),
        0.0,
        "ten blocks up is over the column and lit"
    );
    assert!(
        horizon.coverage(0.0) >= horizon.coverage(1.0),
        "and a shadow never deepens as a receiver rises"
    );
}

#[test]
fn ground_the_walk_never_finds_shades_nothing() {
    let field = HeightField::new(0, 0, 4, 4, |_, _| None);

    assert!(field.is_empty());
    assert_eq!(
        field
            .horizon(2.5, 2.5, &DAWN.shadow, BOX, TILE)
            .coverage(0.0),
        0.0
    );
}

#[test]
fn a_sun_straight_overhead_casts_nothing() {
    let field = HeightField::new(0, 0, 10, 2, |x, _| Some(if x == 5 { 9.0 } else { 0.0 }));
    let overhead = ShadowProjection {
        dir_x: -1.0,
        dir_y: 0.0,
        stretch: 0.0,
        alpha: 0.34,
    };

    assert_eq!(
        field.horizon(4.5, 1.5, &overhead, BOX, TILE).coverage(0.0),
        0.0
    );
}

/// The further the thing that hides the sun, the softer the edge it draws.
#[test]
fn a_far_occluder_has_a_softer_edge_than_a_near_one() {
    let near = HeightField::new(0, 0, 20, 2, |x, _| Some(if x == 5 { 9.0 } else { 0.0 }));
    let far = HeightField::new(0, 0, 20, 2, |x, _| Some(if x == 9 { 9.0 } else { 0.0 }));
    let light = straight(2.2);

    let close = near.horizon(4.0, 1.0, &light, BOX, TILE);
    let distant = far.horizon(4.0, 1.0, &light, BOX, TILE);

    assert!(
        distant.width > close.width,
        "{} should soften past {}",
        distant.width,
        close.width
    );
}

/// A shadow that goes through a corner must not jump: the walk crosses column boundaries, so a
#[test]
fn a_diagonal_ray_crosses_every_column_it_passes() {
    let light = ShadowProjection {
        dir_x: -std::f64::consts::FRAC_1_SQRT_2,
        dir_y: -std::f64::consts::FRAC_1_SQRT_2,
        stretch: 2.2,
        alpha: 0.34,
    };
    let field = HeightField::new(0, 0, 8, 8, |x, y| {
        Some(if x == 4 && y == 4 { 4.0 } else { 0.0 })
    });

    let under = field.horizon(2.5, 2.5, &light, BOX, TILE);
    let beside = field.horizon(2.5, 6.5, &light, BOX, TILE);

    assert!(
        under.coverage(0.0) > 0.0,
        "up the diagonal is behind the column"
    );
    assert_eq!(beside.coverage(0.0), 0.0, "across from it is not");
}

#[test]
fn a_receiver_point_rises_with_the_artwork_and_moves_across_the_light() {
    let foot = ShadowPoint {
        x: 4.5,
        y: 7.5,
        elevation: 2.0,
    };
    let light = DAWN.shadow;

    let above = receiver_point(
        foot,
        (100.0, 300.0),
        (100.0, 300.0 - BOX),
        &light,
        TILE,
        BOX,
    );
    let across = receiver_point(
        foot,
        (100.0, 300.0),
        (100.0 + TILE, 300.0),
        &light,
        TILE,
        BOX,
    );
    let under = receiver_point(
        foot,
        (100.0, 300.0),
        (100.0, 300.0 + BOX),
        &light,
        TILE,
        BOX,
    );

    assert!(
        (above.elevation - 3.0).abs() < 1e-12,
        "a box height up is a block up"
    );
    assert_eq!(
        (above.x, above.y),
        (foot.x, foot.y),
        "and straight up moves nowhere"
    );
    assert_eq!(
        under.elevation, foot.elevation,
        "artwork under the foot rests on the ground"
    );
    let (dx, dy) = (across.x - foot.x, across.y - foot.y);
    assert!((dx * light.dir_x + dy * light.dir_y).abs() < 1e-12);
    assert!(
        (dx.hypot(dy) - std::f64::consts::SQRT_2).abs() < 1e-12,
        "a tile of screen is √2 tiles across"
    );
}
