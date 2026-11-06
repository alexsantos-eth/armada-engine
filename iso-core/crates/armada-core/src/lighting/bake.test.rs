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

/// A silhouette plane the whole of which is opaque, as a 2 x 2 window on it.
static OPAQUE: [u8; 4] = [255; 4];

fn window(plane: &'static [u8; 4]) -> impl Fn(u32) -> Option<Silhouette<'static>> {
    move |_| {
        Some(Silhouette { alpha: plane, stride: 2, rows: 2, left: 0.0, top: 0.0, right: 1.0, bottom: 1.0 })
    }
}

/// A silhouette that is opaque everywhere.
fn solid() -> impl Fn(u32) -> Option<Silhouette<'static>> {
    window(&OPAQUE)
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
fn the_horizon_is_asked_about_on_the_maps_own_grid() {
    const { assert!(TERRAIN_SAMPLES_PER_TILE > 0) };
    assert_eq!(
        SHADOW_MAP_PIXELS_PER_TILE % TERRAIN_SAMPLES_PER_TILE,
        0,
        "{TERRAIN_SAMPLES_PER_TILE} samples do not divide {SHADOW_MAP_PIXELS_PER_TILE} texels a \
         tile, so a column's own corners would not be asked about directly and the horizon \
         would be read across a column edge — the dark band down every sunny lip, again"
    );
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
        None,
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
    bake_ground_shadows(&mut short, &[post((0.5, 0.5), 0.0, 30.0)], None, &light, TILE, BOX, &flat(0.0), &solid());
    let mut tall = map_over(-2, 6);
    bake_ground_shadows(&mut tall, &[post((0.5, 0.5), 0.0, 120.0)], None, &light, TILE, BOX, &flat(0.0), &solid());

    assert_eq!(coverage_at(&short, far.0, far.1), 0);
    assert!(coverage_at(&tall, far.0, far.1) > 0);
}

#[test]
fn a_caster_standing_higher_lands_its_shadow_further_down_the_light() {
    let light = behind_the_camera();
    let mut level = map_over(-2, 8);
    bake_ground_shadows(&mut level, &[post((0.5, 0.5), 0.0, 60.0)], None, &light, TILE, BOX, &flat(0.0), &solid());
    let mut raised = map_over(-2, 8);
    // The same post two blocks up, shading ground still at zero.
    bake_ground_shadows(&mut raised, &[post((0.5, 0.5), 2.0, 60.0)], None, &light, TILE, BOX, &flat(0.0), &solid());

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
        None,
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
    bake_ground_shadows(&mut map, &[post((0.5, 0.5), 0.0, 60.0)], None, &light, TILE, BOX, &level, &solid());

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
    bake_ground_shadows(&mut one, &casters[..1], None, &light, TILE, BOX, &flat(0.0), &solid());
    let mut both = map_over(-2, 6);
    bake_ground_shadows(&mut both, &casters, None, &light, TILE, BOX, &flat(0.0), &solid());

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
    // Opaque only down its right half: a plane of two texels across, the far one solid.
    static RIGHT_HALF: [u8; 4] = [0, 255, 0, 255];
    let half = window(&RIGHT_HALF);
    bake_ground_shadows(&mut map, &[post((0.5, 0.5), 0.0, 60.0)], None, &light, TILE, BOX, &flat(0.0), &half);

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
        None,
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
    bake_ground_shadows(&mut map, &[flat_sprite], None, &light, TILE, BOX, &flat(0.0), &solid());

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
    bake_ground_shadows(&mut map, &[puddle], None, &light, TILE, BOX, &flat(0.0), &solid());

    assert!(map.is_empty());
}

#[test]
fn an_empty_world_bakes_nothing() {
    let light = behind_the_camera();
    let mut map = map_over(-2, 4);
    bake_ground_shadows(
        &mut map,
        &[post((0.5, 0.5), 0.0, 60.0)],
        None,
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

/// A cliff is a caster like any other, except that it is in the map rather than in front of it.
#[test]
fn a_step_in_the_ground_lays_its_own_shadow_down_the_light() {
    // Straight down `+x`, so a wall of columns at x = 3 shades the ground at x > 4 and nothing
    // else.
    let light = ShadowProjection { dir_x: 1.0, dir_y: 0.0, stretch: 1.0, alpha: 1.0 };
    let mut map = map_over(-2, 10);
    let steps = |x: i32, _: i32| Some(if x == 3 { 2.0 } else { 0.0 });
    let field = HeightField::new(-2, -2, 10, 10, steps);
    bake_ground_shadows(&mut map, &[], Some(&field), &light, TILE, BOX, &steps, &solid());

    assert_eq!(coverage_at(&map, 2.5, 0.5), 0, "the low ground towards the sun is lit");
    assert!(coverage_at(&map, 4.5, 0.5) > 0, "the low ground behind the step is shaded");
    assert!(
        coverage_at(&map, 4.5, 0.5) >= coverage_at(&map, 6.5, 0.5),
        "and the further from the step, the less of it is left above the horizon"
    );
    assert_eq!(coverage_at(&map, 9.5, 0.5), 0, "out of its reach there is sun again");
}

/// The blur must not reach across a step: it would lift the shadow off the wall that casts it.
#[test]
fn the_shadow_at_the_foot_of_a_step_is_as_solid_as_the_rest_of_it() {
    // The same wall at x = 3, with the sun at `-x`: the ground from x = 4 on is in its shadow
    // and the wall's own top is lit.
    let light = ShadowProjection { dir_x: 1.0, dir_y: 0.0, stretch: 1.0, alpha: 1.0 };
    let mut map = map_over(-2, 10);
    let steps = |x: i32, _: i32| Some(if x == 3 { 2.0 } else { 0.0 });
    let field = HeightField::new(-2, -2, 10, 10, steps);
    bake_ground_shadows(&mut map, &[], Some(&field), &light, TILE, BOX, &steps, &solid());

    let (at_the_foot, well_inside) = (coverage_at(&map, 4.01, 0.5), coverage_at(&map, 4.5, 0.5));
    assert!(at_the_foot > 0, "the texel against the wall is shaded at all");
    assert_eq!(
        at_the_foot, well_inside,
        "and as solid as the middle of its own column, instead of fading into the lit top above it"
    );
    assert_eq!(
        coverage_at(&map, 3.99, 0.5),
        0,
        "and the sunny lip of the wall's own top keeps its light"
    );
}

#[test]
fn level_ground_casts_nothing_on_itself() {
    let light = behind_the_camera();
    let mut map = map_over(-2, 6);
    let field = HeightField::new(-2, -2, 6, 6, |_, _| Some(1.0));
    bake_ground_shadows(&mut map, &[], Some(&field), &light, TILE, BOX, &flat(1.0), &solid());

    assert!(map.is_empty(), "a plain has no horizon to hide behind");
}

/// The ground layouts a blur is tested over: flush everywhere, and stepped everywhere.
type Layouts = [Box<dyn Fn(i32, i32) -> Option<f64>>; 2];

/// Ground that steps at every column edge on both axes, so the blur is cut everywhere it can be.
fn terraced() -> impl Fn(i32, i32) -> Option<f64> {
    move |x, y| Some(f64::from((x + y).rem_euclid(3)))
}

/// A map of pseudo-random texels, for comparing a blur against a mean worked out by hand.
///
/// The fast paths of the blur turn on runs of equal texels, so the noise is laid in runs of a
/// few texels: a map of pure noise would never take them and a map of flat ground would never
/// leave them.
fn noisy_map(area: MapArea, per_tile: u32) -> ShadowMap {
    let mut map = ShadowMap::new(area, per_tile);
    let mut seed = 0x2545_F491_4F6C_DD1Du64;
    let mut held = (0u8, 0usize);
    for texel in &mut map.alpha {
        if held.1 == 0 {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            let roll = (seed >> 11) as u32;
            held = (
                match roll % 5 {
                    0 => 0,
                    1 => 255,
                    other => (other * 61) as u8,
                },
                1 + (roll / 5) as usize % 7,
            );
        }
        *texel = held.0;
        held.1 -= 1;
    }
    map
}

/// The mean of `line` over `at ± span`, cut at `cut`: the plainest reading of the blur, one
/// texel at a time, for the fast paths to be measured against.
fn mean_cut_at(line: &[u8], at: usize, span: usize, per_tile: usize, cut: &dyn Fn(usize) -> bool) -> u8 {
    let mut from = at.saturating_sub(span);
    let mut to = (at + span).min(line.len() - 1);
    for edge in (per_tile..line.len()).step_by(per_tile) {
        if !cut(edge) {
            continue;
        }
        if edge <= at && edge > from {
            from = edge;
        }
        if edge > at && edge - 1 < to {
            to = edge - 1;
        }
    }
    let total: u32 = line[from..=to].iter().map(|&value| u32::from(value)).sum();
    (total / (to - from + 1) as u32) as u8
}

#[test]
fn the_blur_across_is_a_mean_of_its_window_texel_by_texel() {
    let area = MapArea { min_x: 0, min_y: 0, max_x: 3, max_y: 2 };
    let cases: Layouts = [Box::new(flat(0.0)), Box::new(terraced())];
    for levels in cases {
        let cache = LevelCache::new(area, levels.as_ref());
        let before = noisy_map(area, 12);
        let mut after = before.clone();
        blur_across_within_levels(&mut after, 1, &cache);

        let width = before.width as usize;
        for y in 0..before.height as usize {
            let row = &before.alpha[y * width..(y + 1) * width];
            let world_y = area.min_y + (y / 12) as i32;
            let cut = |edge: usize| {
                let x = area.min_x + (edge / 12) as i32;
                levels(x - 1, world_y) != levels(x, world_y)
            };
            for x in 0..width {
                assert_eq!(
                    after.alpha[y * width + x],
                    mean_cut_at(row, x, 1, 12, &cut),
                    "texel ({x}, {y})"
                );
            }
        }
    }
}

#[test]
fn the_blur_down_is_a_mean_of_its_window_texel_by_texel() {
    let area = MapArea { min_x: 0, min_y: 0, max_x: 3, max_y: 2 };
    let cases: Layouts = [Box::new(flat(0.0)), Box::new(terraced())];
    for levels in cases {
        let cache = LevelCache::new(area, levels.as_ref());
        let before = noisy_map(area, 12);
        let mut after = before.clone();
        blur_down_within_levels(&mut after, 1, &cache);

        let (width, height) = (before.width as usize, before.height as usize);
        for x in 0..width {
            let column: Vec<u8> = (0..height).map(|y| before.alpha[y * width + x]).collect();
            let world_x = area.min_x + (x / 12) as i32;
            let cut = |edge: usize| {
                let y = area.min_y + (edge / 12) as i32;
                levels(world_x, y - 1) != levels(world_x, y)
            };
            for y in 0..height {
                assert_eq!(
                    after.alpha[y * width + x],
                    mean_cut_at(&column, y, 1, 12, &cut),
                    "texel ({x}, {y})"
                );
            }
        }
    }
}
