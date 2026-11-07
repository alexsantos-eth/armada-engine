use super::{
    MAX_REFLECTION_CELLS, ReflectedSprite, cell_top, lay_on_water, mirror_sprite,
    reflection_cells, reflection_piece, waterline,
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
/// high: that is the lift the TypeScript client applies before it mirrors.
#[test]
fn the_waterline_of_something_on_a_bank_is_the_water_under_its_cell() {
    // Screen `y` grows downwards and the water is lower, so its plane is further down.
    assert!((waterline(100.0, 3.0, 1.0, BOX_HEIGHT) - (100.0 + 2.0 * BOX_HEIGHT)).abs() < 1e-9);
}

/// The reflection is the same drawing, the same size, hanging from the waterline: a point `h`
/// above the water shows `h` below it, at the same screen `x`.
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
/// middle of its own run: a flip alone would reverse the diagonal its row lies along.
#[test]
fn a_long_sprite_is_turned_about_the_middle_of_its_run() {
    let layout = SpriteLayout { x: -40.0, y: 40.0, width: 160.0, height: 60.0 };
    let turned = mirror_sprite(layout, 100.0, Some(40.0));
    assert_eq!(turned.rect.x, 2.0 * 40.0 - (-40.0 + 160.0), "mirrored about x = 40");
    assert_eq!(turned.rect.width, layout.width);
    assert!(turned.flip_u && turned.flip_v, "a half turn is both");
}

/// An asset that carries its own reflection is placed where its generator put it: the client has
/// nothing to mirror and must not flip it.
#[test]
fn an_asset_drawn_as_the_water_shows_it_is_laid_where_it_is() {
    let layout = standing((0.0, 100.0), 60.0);
    let laid = lay_on_water(layout);
    assert_eq!(laid.rect, layout);
    assert!(!laid.flip_u && !laid.flip_v);
}

/// A cell's top face is its own diamond: a tile across, half a tile down, around the point the
/// projection puts its centre at.
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
    assert_eq!(corners[0], (0.0, 0.0), "the corner towards the camera comes first");
}

/// The reflection of something standing beside the water falls on the cells in front of it,
/// which is where the water is: towards `−x` and `−y`, down the screen.
#[test]
fn a_reflection_falls_on_the_cells_in_front_of_what_casts_it() {
    let projection = projection();
    // Standing on cell (2, 2) at elevation 1, over water at level 0.
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
    assert!(max_x <= 2 && max_y <= 2, "nothing behind the caster: {max_x}, {max_y}");
    assert!(min_x < 2 && min_y < 2, "and it reaches in front of it: {min_x}, {min_y}");
}

/// A sprite with no area reflects nothing, rather than a cell range around a point.
#[test]
fn a_sprite_with_no_area_has_no_cells() {
    let empty = ReflectedSprite {
        rect: SpriteLayout { x: 0.0, y: 0.0, width: 0.0, height: 10.0 },
        flip_u: false,
        flip_v: true,
    };
    assert_eq!(reflection_cells(&empty, 0.0, projection()), None);
    assert_eq!(reflection_piece(&empty, &cell_top((0, 0), 0.0, projection())), None);
}

/// However long the mirrored drawing is, one sprite only ever asks about so many cells.
#[test]
fn the_cell_range_is_bounded() {
    let huge = ReflectedSprite {
        rect: SpriteLayout { x: -1e6, y: -1e6, width: 2e6, height: 2e6 },
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
    let flat = ProjectionConfig { tile_width: 0.0, ..projection() };
    let sprite = mirror_sprite(standing((0.0, 0.0), 40.0), 0.0, None);
    assert_eq!(reflection_cells(&sprite, 0.0, flat), None);
    let thin = ProjectionConfig { tile_height: 0.0, ..projection() };
    assert_eq!(reflection_cells(&sprite, 0.0, thin), None);
}

/// A cell under the middle of the mirrored drawing takes a piece of it, and that piece reads the
/// artwork upside down: the part of it nearest the waterline is the top of the sprite.
#[test]
fn a_piece_reads_the_artwork_upside_down() {
    let projection = projection();
    let feet = (0.0, 0.0);
    let mirrored = mirror_sprite(standing(feet, 2.0 * TILE_HEIGHT), 0.0, None);
    // The cell the caster stands on, at the same level: the reflection starts on it.
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
    assert!(piece.uv.iter().all(|&(u, v)| (0.0..=1.0).contains(&u) && (0.0..=1.0).contains(&v)));
}

/// A cell the reflection does not reach takes nothing, so no mesh is queued for it.
#[test]
fn a_cell_the_reflection_misses_takes_nothing() {
    let projection = projection();
    let mirrored = mirror_sprite(standing((0.0, 0.0), 40.0), 0.0, None);
    assert_eq!(reflection_piece(&mirrored, &cell_top((20, 20), 0.0, projection)), None);
}

/// A cell the drawing only grazes is dropped: the sliver draws nothing and costs a mesh.
#[test]
fn a_cell_the_drawing_only_grazes_is_dropped() {
    let projection = projection();
    let mirrored = mirror_sprite(standing((0.0, 0.0), 40.0), 0.0, None);
    let ((min_x, min_y), (max_x, max_y)) =
        reflection_cells(&mirrored, 0.0, projection).expect("an area");
    // The corner cells of the range are the ones the rectangle's own corners only touch.
    let pieces = (min_x..=max_x)
        .flat_map(|x| (min_y..=max_y).map(move |y| (x, y)))
        .filter(|&cell| reflection_piece(&mirrored, &cell_top(cell, 0.0, projection)).is_some())
        .count();
    let cells = ((max_x - min_x + 1) * (max_y - min_y + 1)) as usize;
    assert!(pieces < cells, "{pieces} of {cells} cells take a piece");
    assert!(pieces > 0, "and the ones under it do");
}

/// The pieces a reflection is cut into tile it exactly: no cell takes a second copy of the same
/// pixels, and nothing is lost between two cells.
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
