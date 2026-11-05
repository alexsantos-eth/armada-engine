use super::*;
use crate::lighting::shadow::{ShadowProjection, tiles_per_pixel_across, tiles_per_pixel_of_height};

const TILE: f64 = 100.0;
const BOX: f64 = 100.0 / 3.0;

/// Shadows straight up the screen, one tile of ground per tile of height: the easiest sun to
/// reason about on paper.
fn behind_the_camera() -> ShadowProjection {
    let half = std::f64::consts::FRAC_1_SQRT_2;
    ShadowProjection { dir_x: half, dir_y: half, stretch: 1.0, alpha: 1.0 }
}

/// A post one tile wide standing on its ground point, as tall as `height` screen pixels.
fn post(foot: (f64, f64), elevation: f64, height: f64) -> ShadowCaster {
    ShadowCaster {
        foot,
        elevation,
        extent: SpriteExtent { left: -TILE / 2.0, top: -height, width: TILE, height },
        silhouette: 0,
    }
}

/// A silhouette that is opaque everywhere.
fn solid() -> impl Fn(u32, f64, f64) -> f64 {
    |_, _, _| 1.0
}

fn flat(level: f64) -> impl Fn(i32, i32) -> Option<f64> {
    move |_, _| Some(level)
}

fn map_over(min: i32, max: i32) -> ShadowMap {
    ShadowMap::new(MapArea { min_x: min, min_y: min, max_x: max, max_y: max }, 4)
}

/// Coverage at a world point, for reading a map back the way the client samples it.
fn coverage_at(map: &ShadowMap, x: f64, y: f64) -> u8 {
    let per_tile = f64::from(map.pixels_per_tile);
    let texel_x = ((x - f64::from(map.area.min_x)) * per_tile).floor();
    let texel_y = ((y - f64::from(map.area.min_y)) * per_tile).floor();
    if texel_x < 0.0 || texel_y < 0.0 || texel_x >= f64::from(map.width) || texel_y >= f64::from(map.height) {
        return 0;
    }
    map.alpha[texel_y as usize * map.width as usize + texel_x as usize]
}

#[test]
fn the_area_takes_a_margin_around_the_chunk_and_sizes_the_map() {
    let area = MapArea::around(0, 0, 31, 31);

    assert_eq!(area.min_x, -SHADOW_MAP_MARGIN);
    assert_eq!(area.max_x, 31 + SHADOW_MAP_MARGIN);
    assert_eq!(area.columns(), 32 + 2 * SHADOW_MAP_MARGIN);

    let map = ShadowMap::new(area, SHADOW_MAP_PIXELS_PER_TILE);
    assert_eq!(map.width, area.columns() as u32 * SHADOW_MAP_PIXELS_PER_TILE);
    assert_eq!(map.alpha.len(), (map.width * map.height) as usize);
    assert!(map.is_empty(), "a fresh map carries no shadow");
}

#[test]
fn a_columns_square_is_its_own_corner_of_the_map() {
    let map = map_over(-1, 4);

    assert_eq!(map.square_of(-1, -1), Some((0, 0)));
    assert_eq!(map.square_of(0, -1), Some((4, 0)));
    assert_eq!(map.square_of(0, 0), Some((4, 4)));
    assert_eq!(map.square_of(5, 0), None, "outside the area");
}

#[test]
fn a_posts_shadow_falls_down_the_light_and_nowhere_else() {
    let light = behind_the_camera();
    let mut map = map_over(-2, 4);
    // 50 px tall, which at this sun reaches 50 px of height × √(5/2)/100 ≈ 0.79 tiles.
    bake_ground_shadows(
        &mut map,
        &[post((0.5, 0.5), 0.0, 50.0)],
        &light,
        TILE,
        BOX,
        &flat(0.0),
        &solid(),
    );

    // Up the shadow from the foot: shaded.
    let reach = 50.0 * tiles_per_pixel_of_height(TILE);
    let along = (0.5 + light.dir_x * reach * 0.5, 0.5 + light.dir_y * reach * 0.5);
    assert!(coverage_at(&map, along.0, along.1) > 0, "the shadow covers its own direction");
    // Past where it reaches, and the other way: clear.
    assert_eq!(
        coverage_at(&map, 0.5 + light.dir_x * (reach + 1.0), 0.5 + light.dir_y * (reach + 1.0)),
        0,
        "nothing past the end of the shadow"
    );
    assert_eq!(
        coverage_at(&map, 0.5 - light.dir_x * 1.5, 0.5 - light.dir_y * 1.5),
        0,
        "nothing towards the sun"
    );
}

#[test]
fn a_taller_caster_throws_a_longer_shadow() {
    let light = behind_the_camera();
    let far = (0.5 + light.dir_x * 1.2, 0.5 + light.dir_y * 1.2);

    let mut short = map_over(-2, 6);
    bake_ground_shadows(&mut short, &[post((0.5, 0.5), 0.0, 30.0)], &light, TILE, BOX, &flat(0.0), &solid());
    let mut tall = map_over(-2, 6);
    bake_ground_shadows(&mut tall, &[post((0.5, 0.5), 0.0, 120.0)], &light, TILE, BOX, &flat(0.0), &solid());

    assert_eq!(coverage_at(&short, far.0, far.1), 0);
    assert!(coverage_at(&tall, far.0, far.1) > 0);
}

#[test]
fn a_caster_standing_higher_lands_its_shadow_further_down_the_light() {
    let light = behind_the_camera();
    let mut level = map_over(-2, 8);
    bake_ground_shadows(&mut level, &[post((0.5, 0.5), 0.0, 60.0)], &light, TILE, BOX, &flat(0.0), &solid());
    let mut raised = map_over(-2, 8);
    // The same post two blocks up, shading ground still at zero.
    bake_ground_shadows(&mut raised, &[post((0.5, 0.5), 2.0, 60.0)], &light, TILE, BOX, &flat(0.0), &solid());

    let shift = lift_reach(&light, 2.0, TILE, BOX);
    let near = (0.5 + light.dir_x * 0.2, 0.5 + light.dir_y * 0.2);
    let moved = (near.0 + light.dir_x * shift, near.1 + light.dir_y * shift);

    assert!(coverage_at(&level, near.0, near.1) > 0);
    assert_eq!(coverage_at(&raised, near.0, near.1), 0, "the shadow has left the foot");
    assert!(coverage_at(&raised, moved.0, moved.1) > 0, "and travelled {shift} tiles");
}

#[test]
fn only_the_part_standing_above_the_receiving_ground_casts() {
    let light = behind_the_camera();
    // A post one block tall standing a block *below* the ground it would shade: nothing of it
    // rises above that plane, so it casts nothing.
    let mut map = map_over(-2, 6);
    bake_ground_shadows(
        &mut map,
        &[post((0.5, 0.5), -1.0, BOX)],
        &light,
        TILE,
        BOX,
        &flat(0.0),
        &solid(),
    );

    assert!(map.is_empty(), "a caster sunk below the plane shades nothing on it");
}

#[test]
fn a_hole_in_the_ground_receives_nothing() {
    let light = behind_the_camera();
    let mut map = map_over(-2, 6);
    // Only the caster's own column exists; everything down the shadow is empty space.
    let level = |x: i32, y: i32| (x == 0 && y == 0).then_some(0.0);
    bake_ground_shadows(&mut map, &[post((0.5, 0.5), 0.0, 60.0)], &light, TILE, BOX, &level, &solid());

    let reach = 60.0 * tiles_per_pixel_of_height(TILE);
    assert_eq!(
        coverage_at(&map, 0.5 + light.dir_x * reach * 0.9, 0.5 + light.dir_y * reach * 0.9),
        0,
        "no column, no shadow"
    );
    assert!(coverage_at(&map, 0.5, 0.5) > 0, "its own column still receives it");
}

#[test]
fn two_shadows_crossing_read_as_one() {
    let light = behind_the_camera();
    let casters = [post((0.5, 0.5), 0.0, 60.0), post((0.6, 0.4), 0.0, 60.0)];

    let mut one = map_over(-2, 6);
    bake_ground_shadows(&mut one, &casters[..1], &light, TILE, BOX, &flat(0.0), &solid());
    let mut both = map_over(-2, 6);
    bake_ground_shadows(&mut both, &casters, &light, TILE, BOX, &flat(0.0), &solid());

    // Coverage is the larger of the two, never their sum: an overlap would otherwise darken
    // twice and read as a blotch.
    assert_eq!(
        both.alpha.iter().copied().max(),
        one.alpha.iter().copied().max()
    );
}

#[test]
fn the_silhouette_is_sampled_over_its_own_artwork() {
    let light = behind_the_camera();
    let mut map = map_over(-4, 6);
    // Opaque only down the right-hand half of the drawing.
    let half = |_: u32, u: f64, _: f64| if u > 0.5 { 1.0 } else { 0.0 };
    bake_ground_shadows(&mut map, &[post((0.5, 0.5), 0.0, 60.0)], &light, TILE, BOX, &flat(0.0), &half);

    // Across the shadow is (dir_y, −dir_x); the sprite's right-hand side lands on that side.
    let reach = 60.0 * tiles_per_pixel_of_height(TILE) * 0.5;
    let middle = (0.5 + light.dir_x * reach, 0.5 + light.dir_y * reach);
    let across = tiles_per_pixel_across(TILE) * TILE * 0.3;
    let right = (middle.0 + light.dir_y * across, middle.1 - light.dir_x * across);
    let left = (middle.0 - light.dir_y * across, middle.1 + light.dir_x * across);

    assert!(coverage_at(&map, right.0, right.1) > coverage_at(&map, left.0, left.1));
}

#[test]
fn a_caster_whose_shadow_misses_the_map_costs_nothing() {
    let light = behind_the_camera();
    let mut map = map_over(0, 3);
    bake_ground_shadows(
        &mut map,
        &[post((-40.5, -40.5), 0.0, 60.0), post((80.5, 80.5), 0.0, 60.0)],
        &light,
        TILE,
        BOX,
        &flat(0.0),
        &solid(),
    );

    assert!(map.is_empty());
}

#[test]
fn an_artwork_with_no_size_casts_nothing() {
    let light = behind_the_camera();
    let mut map = map_over(-2, 4);
    let flat_sprite = ShadowCaster {
        extent: SpriteExtent { left: 0.0, top: 0.0, width: 0.0, height: 0.0 },
        ..post((0.5, 0.5), 0.0, 10.0)
    };
    bake_ground_shadows(&mut map, &[flat_sprite], &light, TILE, BOX, &flat(0.0), &solid());

    assert!(map.is_empty());
}

#[test]
fn a_caster_drawn_entirely_below_its_foot_casts_nothing() {
    let light = behind_the_camera();
    let mut map = map_over(-2, 4);
    // A drawing that starts at the ground point and goes down the screen: a puddle, not a post.
    let puddle = ShadowCaster {
        extent: SpriteExtent { left: -TILE / 2.0, top: 0.0, width: TILE, height: 20.0 },
        ..post((0.5, 0.5), 0.0, 10.0)
    };
    bake_ground_shadows(&mut map, &[puddle], &light, TILE, BOX, &flat(0.0), &solid());

    assert!(map.is_empty());
}

#[test]
fn an_empty_world_bakes_nothing() {
    let light = behind_the_camera();
    let mut map = map_over(-2, 4);
    bake_ground_shadows(
        &mut map,
        &[post((0.5, 0.5), 0.0, 60.0)],
        &light,
        TILE,
        BOX,
        &(|_, _| None),
        &solid(),
    );

    assert!(map.is_empty(), "no ground anywhere means no receiver anywhere");
}

#[test]
fn the_blur_softens_an_edge_and_keeps_the_middle() {
    let area = MapArea { min_x: 0, min_y: 0, max_x: 1, max_y: 1 };
    let mut map = ShadowMap::new(area, 4);
    // A solid block over the left half.
    for y in 0..map.height {
        for x in 0..map.width / 2 {
            map.alpha[(y * map.width + x) as usize] = 255;
        }
    }
    blur(&mut map, 1);

    let row = (map.height / 2 * map.width) as usize;
    let middle = map.width as usize / 2;
    assert_eq!(map.alpha[row], 255, "well inside the shadow it stays solid");
    assert!(
        (1..255).contains(&map.alpha[row + middle]),
        "the edge is a gradient, not a step: {}",
        map.alpha[row + middle]
    );
}

#[test]
fn a_blur_of_no_radius_changes_nothing() {
    let mut map = map_over(0, 1);
    map.alpha[0] = 200;
    blur(&mut map, 0);

    assert_eq!(map.alpha[0], 200);
}

#[test]
fn clearing_a_map_keeps_it_the_same_size() {
    let mut map = map_over(0, 1);
    let size = map.alpha.len();
    map.alpha[3] = 90;
    map.clear();

    assert_eq!(map.alpha.len(), size);
    assert!(map.is_empty());
}
