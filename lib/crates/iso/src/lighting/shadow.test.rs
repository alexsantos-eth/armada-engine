use super::*;

/// A sun straight behind the camera: shadows run up the screen along `+x +y`, which is the one
fn behind_the_camera() -> ShadowProjection {
    let half = std::f64::consts::FRAC_1_SQRT_2;
    ShadowProjection { dir_x: half, dir_y: half, stretch: 1.0, alpha: 0.5 }
}

const TILE: f64 = 100.0;
const BOX: f64 = 100.0 / 3.0;

#[test]
fn a_pixel_of_height_is_the_same_length_either_way_round() {
    assert!((tiles_per_pixel_of_height(TILE) - 2.5_f64.sqrt() / TILE).abs() < 1e-15);
    assert!((tiles_per_pixel_across(TILE) - std::f64::consts::SQRT_2 / TILE).abs() < 1e-15);
    assert!(tiles_per_pixel_across(TILE) < tiles_per_pixel_of_height(TILE));
}

#[test]
fn a_block_is_about_half_a_tile_of_world_length() {
    assert!((block_height_in_tiles(BOX, TILE) - 0.527_046_276_694_73).abs() < 1e-12);
}

#[test]
fn the_silhouette_stands_on_its_foot() {
    let light = behind_the_camera();
    let matrix = silhouette_matrix(&light, (4.0, 7.0), 0.0, TILE, BOX);

    let at_foot = matrix.apply((0.0, 0.0));
    assert!((at_foot.0 - 4.0).abs() < 1e-12);
    assert!((at_foot.1 - 7.0).abs() < 1e-12);
}

#[test]
fn height_is_laid_down_the_shadow_and_width_across_it() {
    let light = behind_the_camera();
    let matrix = silhouette_matrix(&light, (0.0, 0.0), 0.0, TILE, BOX);

    let up = matrix.apply((0.0, -10.0));
    let reach = 10.0 * tiles_per_pixel_of_height(TILE);
    assert!((up.0 - reach * light.dir_x).abs() < 1e-12);
    assert!((up.1 - reach * light.dir_y).abs() < 1e-12);

    let right = matrix.apply((10.0, 0.0));
    let across = 10.0 * tiles_per_pixel_across(TILE);
    assert!((right.0 - across * light.dir_y).abs() < 1e-12);
    assert!((right.1 + across * light.dir_x).abs() < 1e-12);
    assert!((right.0 * light.dir_x + right.1 * light.dir_y).abs() < 1e-12);
}

#[test]
fn a_lower_receiving_plane_pushes_the_whole_shadow_further_away() {
    let light = behind_the_camera();
    let own = silhouette_matrix(&light, (0.0, 0.0), 0.0, TILE, BOX);
    let lower = silhouette_matrix(&light, (0.0, 0.0), 2.0, TILE, BOX);

    assert!((lower.a - own.a).abs() < 1e-15 && (lower.d - own.d).abs() < 1e-15);
    let expected = lift_reach(&light, 2.0, TILE, BOX);
    assert!((lower.tx - own.tx - expected * light.dir_x).abs() < 1e-12);
    assert!((lower.ty - own.ty - expected * light.dir_y).abs() < 1e-12);
    assert!(expected > 0.0, "a plane further below is further down the shadow");
}

#[test]
fn stretch_scales_how_far_height_reaches() {
    let mut light = behind_the_camera();
    light.stretch = 3.0;
    let matrix = silhouette_matrix(&light, (0.0, 0.0), 0.0, TILE, BOX);
    let reach = matrix.apply((0.0, -10.0));
    let distance = (reach.0 * reach.0 + reach.1 * reach.1).sqrt();

    assert!((distance - 3.0 * 10.0 * tiles_per_pixel_of_height(TILE)).abs() < 1e-12);
}

#[test]
fn the_silhouette_matrix_inverts_back_to_the_sprite() {
    let light = ShadowProjection { dir_x: -0.92, dir_y: 0.391_918_358_845_308_46, stretch: 2.2, alpha: 0.34 };
    let matrix = silhouette_matrix(&light, (12.5, -3.5), 1.0, TILE, BOX);
    let back = matrix.inverse().expect("a shadow with any length is invertible");

    for point in [(0.0, 0.0), (17.0, -40.0), (-9.5, 3.25)] {
        let round_trip = back.apply(matrix.apply(point));
        assert!((round_trip.0 - point.0).abs() < 1e-9, "{round_trip:?} from {point:?}");
        assert!((round_trip.1 - point.1).abs() < 1e-9, "{round_trip:?} from {point:?}");
    }
}

#[test]
fn a_sun_straight_overhead_has_no_shadow_to_invert() {
    let light = ShadowProjection { dir_x: 1.0, dir_y: 0.0, stretch: 0.0, alpha: 0.0 };
    let matrix = silhouette_matrix(&light, (0.0, 0.0), 0.0, TILE, BOX);

    assert_eq!(matrix.inverse(), None);
}

#[test]
fn nothing_beside_or_towards_the_sun_is_shaded() {
    let light = behind_the_camera();
    let caster = (0.0, 0.0);

    assert_eq!(
        cast_shadow_offset(&light, caster, (-2.0, -2.0), 0.0, TILE, BOX),
        None
    );
    assert_eq!(
        cast_shadow_offset(&light, caster, (1.0, -1.0), 0.0, TILE, BOX),
        None
    );
    let overhead = ShadowProjection { stretch: 0.0, ..light };
    assert_eq!(
        cast_shadow_offset(&overhead, caster, (2.0, 2.0), 0.0, TILE, BOX),
        None
    );
}

#[test]
fn a_receiver_down_the_shadow_is_offset_along_it_and_not_across() {
    let light = behind_the_camera();
    let along = 2.0;
    let receiver = (light.dir_x * along, light.dir_y * along);
    let (x, y) = cast_shadow_offset(&light, (0.0, 0.0), receiver, 0.0, TILE, BOX)
        .expect("a receiver down the shadow is shaded");

    assert!(x.abs() < 1e-9, "nothing across the shadow: {x}");
    assert!((y - along / (light.stretch * tiles_per_pixel_of_height(TILE))).abs() < 1e-9);
    assert!(y > 0.0, "the silhouette slides down the receiver as it travels");
}

#[test]
fn standing_higher_than_the_receiver_lifts_the_shadow_up_it() {
    let light = behind_the_camera();
    let receiver = (light.dir_x * 2.0, light.dir_y * 2.0);
    let level = cast_shadow_offset(&light, (0.0, 0.0), receiver, 0.0, TILE, BOX).unwrap();
    let above = cast_shadow_offset(&light, (0.0, 0.0), receiver, 1.0, TILE, BOX).unwrap();

    assert!((level.0 - above.0).abs() < 1e-12, "a lift moves nothing across the shadow");
    assert!((level.1 - above.1 - BOX).abs() < 1e-12, "one block higher is one block up");
}

#[test]
fn reach_grows_with_height_and_with_the_lift_and_is_never_negative() {
    let short = shadow_reach(10.0, 0.0, TILE, BOX);
    let tall = shadow_reach(40.0, 0.0, TILE, BOX);
    let lifted = shadow_reach(10.0, 3.0, TILE, BOX);

    assert!(tall > short && lifted > short);
    assert!((tall - MAX_SHADOW_STRETCH * tiles_per_pixel_of_height(TILE) * 40.0).abs() < 1e-12);
    assert_eq!(shadow_reach(10.0, -10.0, TILE, BOX), 0.0);
}
