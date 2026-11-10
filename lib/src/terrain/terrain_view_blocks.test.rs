use super::{MAX_EXPOSED_BLOCKS, TerrainFrames, collect_terrain_sprites, exposed_floor};
use iso::grid::WorldCoord;
use iso::terrain::{TerrainColumn, TerrainMaterial};

use crate::assets::sprites::DrawKind;
use crate::terrain::terrain_view_appearance::TerrainLook;
use crate::water::reflection_view::WaterCell;

#[test]
fn level_ground_draws_only_its_surface() {
    assert_eq!(exposed_floor(3, [Some(3), Some(3), Some(3)]), 3);
    assert_eq!(exposed_floor(3, [None, None, None]), 3);
}

/// The corner case: both columns in front are level, and only the one across the corner is
#[test]
fn a_lower_column_across_the_corner_opens_the_stack() {
    assert_eq!(exposed_floor(3, [Some(3), Some(3), Some(1)]), 1);
}

#[test]
fn a_drop_is_only_ever_followed_down_so_far() {
    assert_eq!(
        exposed_floor(3, [Some(-40), Some(3), Some(3)]),
        3 - MAX_EXPOSED_BLOCKS
    );
}

const TILE_WIDTH: f64 = 280.0;
const BOX_HEIGHT: f64 = 95.5;

fn projection() -> iso::projection::ProjectionConfig {
    iso::projection::ProjectionConfig {
        tile_width: TILE_WIDTH,
        tile_height: TILE_WIDTH / 2.0,
        elevation_step: Some(BOX_HEIGHT),
        origin_x: 600.0,
        origin_y: 400.0,
    }
}

fn grass_column(elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x: 0, y: 0 },
        elevation,
        surface: TerrainMaterial::Grass,
        walkable: true,
    }
}

fn column(x: i32, y: i32, elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x, y },
        elevation,
        surface: TerrainMaterial::Grass,
        walkable: true,
    }
}

/// Polygon area of a reflection piece.
fn piece_area(draw: &crate::assets::sprites::SpriteDraw) -> f64 {
    let crate::assets::sprites::DrawKind::Reflection { points, .. } = &draw.kind else {
        return 0.0;
    };
    let mut sum = 0.0;
    for index in 0..points.len() {
        let (a, b) = (points[index], points[(index + 1) % points.len()]);
        sum += a.0 * b.1 - b.0 * a.1;
    }
    sum / 2.0
}

/// A straight run of wall: the two blocks cast on the same water cell in front of them.
/// The block in front paints over the sliver of the block behind, so the behind's piece
/// queues first, whatever order the columns arrived in.
#[test]
fn the_back_block_reflects_before_the_front_block_on_their_shared_cell() {
    let back = column(1, 0, 1);
    let front = column(0, 0, 1);
    for columns in [&[back, front][..], &[front, back][..]] {
        let draws = shore(columns);
        let depth = crate::assets::sprites::ground_key(
            0.5,
            -0.5,
            0.0,
            crate::water::reflection_view::REFLECTION_LAYER,
            projection().tile_height,
        )
        .depth;
        let shared: Vec<&crate::assets::sprites::SpriteDraw> = draws
            .iter()
            .filter(|draw| {
                matches!(&draw.kind, DrawKind::Reflection { .. }) && draw.key.depth == depth
            })
            .collect();
        assert_eq!(shared.len(), 2, "the two blocks share this cell");
        let areas: Vec<f64> = shared.iter().map(|draw| piece_area(draw).abs()).collect();
        assert!(
            areas[0] < areas[1],
            "the sliver of the back block paints before the front block's band"
        );
    }
}

/// A shore: `columns` rise above a sea at level `0.0`; every other cell is water, one
/// block under the shore, as the world generates it.
fn shore(columns: &[TerrainColumn]) -> Vec<crate::assets::sprites::SpriteDraw> {
    use std::collections::HashMap;
    let elevations: HashMap<(i32, i32), i32> = columns
        .iter()
        .map(|column| ((column.coord.x, column.coord.y), column.elevation))
        .collect();
    let frames = TerrainFrames::for_test();
    let (look, _) = TerrainLook::new(7, |_| None);
    let mut out = Vec::new();
    collect_terrain_sprites(
        columns,
        projection(),
        &frames,
        &look,
        |coord| Some(elevations.get(&(coord.x, coord.y)).copied().unwrap_or(-1)),
        |x, y| {
            (!elevations.contains_key(&(x, y))).then_some(WaterCell {
                level: 0.0,
                elevation: 0.0,
            })
        },
        (4000.0, 4000.0),
        &mut out,
    );
    out
}

/// A sea at one level: every cell of it is water, and nothing else is.
fn sea(level: f64) -> impl Fn(i32, i32) -> Option<WaterCell> {
    move |_, _| {
        Some(WaterCell {
            level,
            elevation: level,
        })
    }
}

/// The draws of `columns` over a sea at `level`, split by kind of sprite.
fn collected(
    columns: &[TerrainColumn],
    water_at: impl Fn(i32, i32) -> Option<WaterCell>,
) -> Vec<crate::assets::sprites::SpriteDraw> {
    let frames = TerrainFrames::for_test();
    let (look, _) = TerrainLook::new(7, |_| None);
    let mut out = Vec::new();
    collect_terrain_sprites(
        columns,
        projection(),
        &frames,
        &look,
        |_| Some(0),
        water_at,
        (4000.0, 4000.0),
        &mut out,
    );
    out
}

fn reflections(draws: &[crate::assets::sprites::SpriteDraw]) -> usize {
    draws
        .iter()
        .filter(|draw| matches!(&draw.kind, DrawKind::Reflection { .. }))
        .count()
}

/// Reflection draws keyed to one water cell, by its depth: the wings cast there whether or
/// not the middle column exists, so this counts what that cell shows without the middle's share.
fn reflections_on(draws: &[crate::assets::sprites::SpriteDraw], cell: (i32, i32)) -> usize {
    let depth = crate::assets::sprites::ground_key(
        f64::from(cell.0) + 0.5,
        f64::from(cell.1) + 0.5,
        0.0,
        crate::water::reflection_view::REFLECTION_LAYER,
        projection().tile_height,
    )
    .depth;
    draws
        .iter()
        .filter(|draw| matches!(&draw.kind, DrawKind::Reflection { .. }) && draw.key.depth == depth)
        .count()
}

/// A rise above the water reflects in it, so the shore does not look pasted onto the sea.
#[test]
fn a_rise_above_the_water_reflects_in_it() {
    let draws = collected(&[grass_column(2)], sea(0.0));
    assert!(
        reflections(&draws) > 0,
        "the water shows the blocks of the shore"
    );
}

/// A column set one cell back between two columns of the same height is hemmed in: the
/// wings cover the wedge of water its reflection would fall on, so the water shows nothing
/// of it — the sliver it leaves drags on screen as a stray triangle at the inside corner.
#[test]
fn a_hemmed_in_middle_column_reflects_nothing() {
    let middle = column(1, 1, 1);
    let wings = [column(0, 1, 1), column(1, 0, 1)];
    let formation = shore(&[middle, wings[0], wings[1]]);
    let wings_only = shore(&wings);
    let wedge = (0, 0);
    assert!(
        reflections_on(&wings_only, wedge) > 0,
        "the wings cast on the wedge of water"
    );
    assert!(
        reflections_on(&shore(&[middle]), wedge) > 0,
        "a lone middle column casts on the wedge of water"
    );
    assert_eq!(
        reflections_on(&formation, wedge),
        reflections_on(&wings_only, wedge),
        "a recessed middle column adds no reflection between same-height wings"
    );
}

/// Only both flanks together hem a column in: with one side open to the water, its
/// reflection reaches the open sea and is drawn.
#[test]
fn one_open_flank_keeps_the_middle_reflection() {
    let middle = column(1, 1, 1);
    let wing = column(1, 0, 1);
    let formation = shore(&[middle, wing]);
    let wing_alone = shore(&[wing]);
    assert!(
        reflections(&formation) > reflections(&wing_alone),
        "a column with one open flank reflects onto the open water"
    );
}

/// Dry land mirrors nothing, whatever stands on it.
#[test]
fn dry_land_reflects_nothing() {
    let draws = collected(&[grass_column(2)], |_, _| None);
    assert_eq!(reflections(&draws), 0);
}

/// A column whose blocks all sit below the water hides in it: the water shows nothing of them.
#[test]
fn a_column_below_the_water_reflects_nothing() {
    let draws = collected(&[grass_column(0)], sea(2.0));
    assert_eq!(reflections(&draws), 0);
}
