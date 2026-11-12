use super::{
    BLUR_TAPS, MAX_REFLECTION_CELLS, ReflectedSprite, ReflectionPiece, blur_radius, blur_taps,
    cell_top, lay_on_water, mirror_sprite, piece_depth, reflection_cells, reflection_piece,
    smear_sprite, waterline,
};
use crate::assets::SpriteLayout;
use crate::projection::ProjectionConfig;

const TILE_WIDTH: f64 = 80.0;
const TILE_HEIGHT: f64 = 40.0;
const BOX_HEIGHT: f64 = 27.28;

fn projection() -> ProjectionConfig {
    ProjectionConfig {
        tile_width: TILE_WIDTH,
        tile_height: TILE_HEIGHT,
        elevation_step: Some(BOX_HEIGHT),
        origin_x: 0.0,
        origin_y: 0.0,
    }
}

/// A sprite a tile wide standing on a ground point, reaching `tall` pixels above it.
fn standing(feet: (f64, f64), tall: f64) -> SpriteLayout {
    SpriteLayout {
        x: feet.0 - TILE_WIDTH / 2.0,
        y: feet.1 - tall,
        width: TILE_WIDTH,
        height: tall,
    }
}

/// Something standing on the water's own level is mirrored about its own feet.
#[test]
fn the_waterline_of_something_in_the_water_is_where_it_stands() {
    assert_eq!(waterline(100.0, 2.0, 2.0, BOX_HEIGHT), 100.0);
}

/// On a bank the mirror hangs from the water, which is as far below the feet as the bank is
#[test]
fn the_waterline_of_something_on_a_bank_is_the_water_under_its_cell() {
    assert!((waterline(100.0, 3.0, 1.0, BOX_HEIGHT) - (100.0 + 2.0 * BOX_HEIGHT)).abs() < 1e-9);
}

/// The reflection is the same drawing, the same size, hanging from the waterline: a point `h`
#[test]
fn a_mirrored_sprite_hangs_from_the_waterline_at_its_own_width() {
    let layout = standing((0.0, 100.0), 60.0);
    let mirrored = mirror_sprite(layout, 100.0, None);
    assert_eq!(mirrored.rect.x, layout.x, "nothing moves sideways");
    assert_eq!(mirrored.rect.width, layout.width);
    assert_eq!(mirrored.rect.height, layout.height);
    assert_eq!(mirrored.rect.y, 100.0, "its top edge is the waterline");
    assert_eq!(
        mirrored.rect.y + mirrored.rect.height,
        100.0 + 60.0,
        "and it reaches as far below the water as the sprite reaches above it",
    );
    assert!(mirrored.flip_v, "upside down");
    assert!(!mirrored.flip_u, "and not turned round");
}

/// A footprint running over several cells is turned half a circle instead of flipped, about the
#[test]
fn a_long_sprite_is_turned_about_the_middle_of_its_run() {
    let layout = SpriteLayout {
        x: -40.0,
        y: 40.0,
        width: 160.0,
        height: 60.0,
    };
    let turned = mirror_sprite(layout, 100.0, Some(40.0));
    assert_eq!(
        turned.rect.x,
        2.0 * 40.0 - (-40.0 + 160.0),
        "mirrored about x = 40"
    );
    assert_eq!(turned.rect.width, layout.width);
    assert!(turned.flip_u && turned.flip_v, "a half turn is both");
}

/// An asset that carries its own reflection is placed where its generator put it: the client has
#[test]
fn an_asset_drawn_as_the_water_shows_it_is_laid_where_it_is() {
    let layout = standing((0.0, 100.0), 60.0);
    let laid = lay_on_water(layout);
    assert_eq!(laid.rect, layout);
    assert!(!laid.flip_u && !laid.flip_v);
}

/// A cell's top face is its own diamond: a tile across, half a tile down, around the point the
#[test]
fn a_cells_top_is_the_diamond_the_projection_draws_it_as() {
    let corners = cell_top((0, 0), 0.0, projection());
    let xs: Vec<f64> = corners.iter().map(|c| c.0).collect();
    let ys: Vec<f64> = corners.iter().map(|c| c.1).collect();
    let span = |values: &[f64]| {
        values.iter().copied().fold(f64::NEG_INFINITY, f64::max)
            - values.iter().copied().fold(f64::INFINITY, f64::min)
    };
    assert_eq!(span(&xs), TILE_WIDTH);
    assert_eq!(span(&ys), TILE_HEIGHT);
    assert_eq!(
        corners[0],
        (0.0, 0.0),
        "the corner towards the camera comes first"
    );
}

/// The reflection of something standing beside the water falls on the cells in front of it,
#[test]
fn a_reflection_falls_on_the_cells_in_front_of_what_casts_it() {
    let projection = projection();
    let feet = {
        let at = crate::projection::project_block(
            crate::projection::GridPoint { x: 2.5, y: 2.5 },
            1.0,
            projection,
        );
        (at.screen_x, at.screen_y)
    };
    let line = waterline(feet.1, 1.0, 0.0, BOX_HEIGHT);
    let mirrored = mirror_sprite(standing(feet, 2.0 * BOX_HEIGHT), line, None);
    let ((min_x, min_y), (max_x, max_y)) =
        reflection_cells(&mirrored, 0.0, projection).expect("a reflection with an area");
    assert!(
        max_x <= 2 && max_y <= 2,
        "nothing behind the caster: {max_x}, {max_y}"
    );
    assert!(
        min_x < 2 && min_y < 2,
        "and it reaches in front of it: {min_x}, {min_y}"
    );
}

/// A sprite with no area reflects nothing, rather than a cell range around a point.
#[test]
fn a_sprite_with_no_area_has_no_cells() {
    let empty = ReflectedSprite {
        rect: SpriteLayout {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 10.0,
        },
        flip_u: false,
        flip_v: true,
    };
    assert_eq!(reflection_cells(&empty, 0.0, projection()), None);
    assert_eq!(
        reflection_piece(&empty, &cell_top((0, 0), 0.0, projection())),
        None
    );
}

/// However long the mirrored drawing is, one sprite only ever asks about so many cells.
#[test]
fn the_cell_range_is_bounded() {
    let huge = ReflectedSprite {
        rect: SpriteLayout {
            x: -1e6,
            y: -1e6,
            width: 2e6,
            height: 2e6,
        },
        flip_u: false,
        flip_v: true,
    };
    let ((min_x, min_y), (max_x, max_y)) =
        reflection_cells(&huge, 0.0, projection()).expect("an area");
    assert_eq!(max_x - min_x, MAX_REFLECTION_CELLS);
    assert_eq!(max_y - min_y, MAX_REFLECTION_CELLS);
}

/// A projection with no tile has no cells to answer with, rather than dividing by zero.
#[test]
fn a_projection_with_no_tile_has_no_cells() {
    let flat = ProjectionConfig {
        tile_width: 0.0,
        ..projection()
    };
    let sprite = mirror_sprite(standing((0.0, 0.0), 40.0), 0.0, None);
    assert_eq!(reflection_cells(&sprite, 0.0, flat), None);
    let thin = ProjectionConfig {
        tile_height: 0.0,
        ..projection()
    };
    assert_eq!(reflection_cells(&sprite, 0.0, thin), None);
}

/// A cell under the middle of the mirrored drawing takes a piece of it, and that piece reads the
#[test]
fn a_piece_reads_the_artwork_upside_down() {
    let projection = projection();
    let feet = (0.0, 0.0);
    let mirrored = mirror_sprite(standing(feet, 2.0 * TILE_HEIGHT), 0.0, None);
    let piece = reflection_piece(&mirrored, &cell_top((-1, -1), 0.0, projection))
        .expect("the first cell under the waterline takes a piece");
    assert_eq!(piece.points.len(), piece.uv.len());
    let highest = piece
        .points
        .iter()
        .zip(&piece.uv)
        .min_by(|(a, _), (b, _)| a.1.total_cmp(&b.1))
        .expect("a corner");
    let lowest = piece
        .points
        .iter()
        .zip(&piece.uv)
        .max_by(|(a, _), (b, _)| a.1.total_cmp(&b.1))
        .expect("a corner");
    assert!(
        highest.1.1 > lowest.1.1,
        "the corner nearest the water reads higher up the artwork: {:?} vs {:?}",
        highest,
        lowest,
    );
    assert!(
        piece
            .uv
            .iter()
            .all(|&(u, v)| (0.0..=1.0).contains(&u) && (0.0..=1.0).contains(&v))
    );
}

/// A cell the reflection does not reach takes nothing, so no mesh is queued for it.
#[test]
fn a_cell_the_reflection_misses_takes_nothing() {
    let projection = projection();
    let mirrored = mirror_sprite(standing((0.0, 0.0), 40.0), 0.0, None);
    assert_eq!(
        reflection_piece(&mirrored, &cell_top((20, 20), 0.0, projection)),
        None
    );
}

/// A cell the drawing only grazes is dropped: the sliver draws nothing and costs a mesh.
#[test]
fn a_cell_the_drawing_only_grazes_is_dropped() {
    let projection = projection();
    let mirrored = mirror_sprite(standing((0.0, 0.0), 40.0), 0.0, None);
    let ((min_x, min_y), (max_x, max_y)) =
        reflection_cells(&mirrored, 0.0, projection).expect("an area");
    let pieces = (min_x..=max_x)
        .flat_map(|x| (min_y..=max_y).map(move |y| (x, y)))
        .filter(|&cell| reflection_piece(&mirrored, &cell_top(cell, 0.0, projection)).is_some())
        .count();
    let cells = ((max_x - min_x + 1) * (max_y - min_y + 1)) as usize;
    assert!(pieces < cells, "{pieces} of {cells} cells take a piece");
    assert!(pieces > 0, "and the ones under it do");
}

/// The pieces a reflection is cut into tile it exactly: no cell takes a second copy of the same
#[test]
fn the_pieces_add_up_to_the_whole_reflection() {
    let projection = projection();
    let mirrored = mirror_sprite(standing((13.0, 7.0), 3.0 * TILE_HEIGHT), 7.0, None);
    let ((min_x, min_y), (max_x, max_y)) =
        reflection_cells(&mirrored, 0.0, projection).expect("an area");
    let mut total = 0.0;
    for x in min_x..=max_x {
        for y in min_y..=max_y {
            if let Some(piece) = reflection_piece(&mirrored, &cell_top((x, y), 0.0, projection)) {
                total += super::area(&piece.points).abs();
            }
        }
    }
    let whole = mirrored.rect.width * mirrored.rect.height;
    assert!(
        (total - whole).abs() < 1e-6 * whole,
        "the cut pieces cover the rectangle once: {total} of {whole}",
    );
}

/// The cut does not depend on which way the projection winds its diamonds.
#[test]
fn the_cut_is_the_same_whichever_way_a_cell_is_wound() {
    let projection = projection();
    let mirrored = mirror_sprite(standing((0.0, 0.0), 40.0), 0.0, None);
    let cell = cell_top((-1, -1), 0.0, projection);
    let mut reversed = cell;
    reversed.reverse();
    let one = reflection_piece(&mirrored, &cell).expect("a piece");
    let other = reflection_piece(&mirrored, &reversed).expect("the same piece");
    assert!(
        (super::area(&one.points).abs() - super::area(&other.points).abs()).abs() < 1e-9,
        "the same area either way",
    );
}

/// At the surface the water still breaks a reflection up a little: the blur never vanishes.
#[test]
fn the_water_smears_a_reflection_even_at_its_surface() {
    assert!(blur_radius(0.0) > 0.0);
}

/// Depth is what blurs a reflection: the deeper the mirrored artwork hangs, the wider it smears.
#[test]
fn a_deeper_reflection_smears_wider() {
    assert!(blur_radius(40.0) > blur_radius(0.0));
    assert!(blur_radius(200.0) > blur_radius(40.0));
}

/// Nothing above the surface is mirrored, so a negative depth reads as the surface itself.
#[test]
fn a_depth_above_the_surface_smears_like_the_surface() {
    assert_eq!(blur_radius(-50.0), blur_radius(0.0));
}

/// The smear stops growing, so a reflection running far into the water stays a reflection.
#[test]
fn the_smear_stops_growing() {
    assert_eq!(blur_radius(100_000.0), blur_radius(10_000.0));
    assert!(blur_radius(100_000.0).is_finite());
}

/// The copies a reflection is drawn as: the first is the reflection itself, at full strength and
/// in its own place, and the rest hang below it, each a little fainter over what came before.
#[test]
fn the_first_copy_of_a_smear_is_the_reflection_itself() {
    let taps = blur_taps(12.0);
    assert_eq!(taps[0].offset, 0.0);
    assert_eq!(taps[0].alpha, 1.0);
}

/// The copies walk down from the reflection to the far end of the smear, never above it.
#[test]
fn the_copies_of_a_smear_walk_down_to_its_far_end() {
    let radius = 12.0;
    let taps = blur_taps(radius);
    let drawn: Vec<f64> = taps
        .iter()
        .filter(|tap| tap.alpha > 0.0)
        .map(|tap| tap.offset)
        .collect();
    assert!(drawn.len() > 1, "a wide smear takes several copies");
    assert!(
        drawn.windows(2).all(|pair| pair[1] > pair[0]),
        "each copy is deeper than the one before: {drawn:?}",
    );
    assert_eq!(
        drawn.last().copied(),
        Some(radius),
        "and the last reaches the far end",
    );
    assert!(drawn.iter().all(|&offset| offset >= 0.0));
}

/// Laid one over another, the copies weigh the artwork like a blur does: most of what is seen is
/// the reflection itself, and each copy below it counts for less than the one above.
#[test]
fn the_copies_of_a_smear_weigh_like_a_blur() {
    let taps = blur_taps(16.0);
    let mut weights = Vec::new();
    for (index, tap) in taps.iter().enumerate() {
        if tap.alpha <= 0.0 {
            continue;
        }
        let covered: f64 = taps[index + 1..]
            .iter()
            .map(|later| 1.0 - later.alpha)
            .product();
        weights.push(tap.alpha * covered);
    }
    let total: f64 = weights.iter().sum();
    assert!(
        (total - 1.0).abs() < 1e-9,
        "the copies together are one reflection: {total}",
    );
    assert!(
        weights.windows(2).all(|pair| pair[1] < pair[0]),
        "and each one weighs less than the one above it: {weights:?}",
    );
}

/// A smear only as wide as the surface's own blur is drawn with fewer copies than a deep one:
/// the water pays for the blur only where it shows.
#[test]
fn a_narrow_smear_takes_fewer_copies_than_a_wide_one() {
    let drawn = |radius: f64| {
        blur_taps(radius)
            .iter()
            .filter(|tap| tap.alpha > 0.0)
            .count()
    };
    assert!(drawn(blur_radius(0.0)) < drawn(blur_radius(400.0)));
    assert!(drawn(blur_radius(400.0)) <= BLUR_TAPS);
    assert_eq!(drawn(0.0), 1, "no smear at all is one copy");
}

/// A copy is the same drawing read the same way, moved deeper into the water.
#[test]
fn a_smeared_copy_is_the_same_drawing_deeper_down() {
    let mirrored = mirror_sprite(standing((0.0, 100.0), 60.0), 100.0, None);
    let deeper = smear_sprite(&mirrored, 7.0);
    assert_eq!(deeper.rect.x, mirrored.rect.x);
    assert_eq!(deeper.rect.width, mirrored.rect.width);
    assert_eq!(deeper.rect.height, mirrored.rect.height);
    assert_eq!(deeper.rect.y, mirrored.rect.y + 7.0);
    assert_eq!(deeper.flip_u, mirrored.flip_u);
    assert_eq!(deeper.flip_v, mirrored.flip_v);
}

/// How deep a piece hangs is read from the piece itself, so each cell of water blurs by what it
/// shows there rather than by where the caster stands.
#[test]
fn a_pieces_depth_is_how_far_below_the_surface_it_hangs() {
    let piece = ReflectionPiece {
        points: vec![(0.0, 100.0), (10.0, 100.0), (10.0, 140.0), (0.0, 140.0)],
        uv: vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)],
    };
    assert_eq!(piece_depth(&piece, 100.0), 20.0);
    assert_eq!(piece_depth(&piece, 160.0), 0.0, "never above the surface");
}
