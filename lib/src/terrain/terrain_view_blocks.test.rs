use std::collections::HashMap;

use super::{
    MAX_EXPOSED_BLOCKS, Surroundings, TerrainFrames, collect_terrain_sprites, exposed_floor,
};
use iso::assets::{InkBox, SpriteFrame};
use iso::grid::WorldCoord;
use iso::terrain::{TerrainColumn, TerrainMaterial};

use crate::assets::sprites::{DrawKind, SpriteDraw};
use crate::terrain::terrain_view::MATERIAL_SLOTS;
use crate::terrain::terrain_view_appearance::TerrainLook;
use crate::water::reflection_view::WaterCell;

/// Frames for every material, one plain block each: the fixture the tests draw with. The
/// reflection hangs one elevation step below the anchor, as the shipped reflection art does.
/// The path variants carry `x = 1000 + mask` so tests can tell them apart.
fn test_frames() -> TerrainFrames {
    let frame = SpriteFrame {
        x: 0,
        y: 0,
        width: 32,
        height: 32,
    };
    let path_fallback = SpriteFrame { x: 10, ..frame };
    let block = InkBox {
        x: -0.5,
        y: -1.0,
        width: 1.0,
        height: 1.0,
    };
    let reflection = InkBox {
        x: -0.5,
        y: 0.0,
        width: 1.0,
        height: iso::assets::SVG_BLOCK_HEIGHT / iso::assets::SVG_TILE_WIDTH,
    };
    let mut frames = [Some((frame, block)); MATERIAL_SLOTS];
    frames[crate::terrain::terrain_view::slot(TerrainMaterial::Path)] =
        Some((path_fallback, block));
    TerrainFrames {
        frames,
        reflections: [Some((frame, reflection)); MATERIAL_SLOTS],
        path_frames: std::array::from_fn(|mask| {
            Some((
                SpriteFrame {
                    x: 1000 + mask as u32,
                    y: 0,
                    width: 32,
                    height: 32,
                },
                block,
            ))
        }),
    }
}

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
fn piece_area(draw: &SpriteDraw) -> f64 {
    let DrawKind::Reflection { points, .. } = &draw.kind else {
        return 0.0;
    };
    let mut sum = 0.0;
    for index in 0..points.len() {
        let (a, b) = (points[index], points[(index + 1) % points.len()]);
        sum += a.0 * b.1 - b.0 * a.1;
    }
    sum / 2.0
}

/// Reflection pieces grouped by the key of the water cell they painted, in draw order. The test
/// discovers the shared cells from the draws instead of recomputing the keys.
fn reflection_pieces_by_cell(draws: &[SpriteDraw]) -> HashMap<u64, Vec<f64>> {
    let mut cells: HashMap<u64, Vec<f64>> = HashMap::new();
    for draw in draws {
        if matches!(&draw.kind, DrawKind::Reflection { .. }) {
            cells
                .entry(draw.key.depth.to_bits())
                .or_default()
                .push(piece_area(draw).abs());
        }
    }
    cells
}

/// The draws of `columns` over `water_at`, with `height_at` answering the streaming height query.
/// `surface_at` answers the surface of any column at any coordinate, defaulting to the slice.
fn collected(
    columns: &[TerrainColumn],
    height_at: impl Fn(WorldCoord) -> Option<i32>,
    water_at: impl Fn(i32, i32) -> Option<WaterCell>,
) -> Vec<SpriteDraw> {
    collected_with(columns, height_at, water_at, |at| {
        columns
            .iter()
            .find(|column| column.coord == at)
            .map(|column| column.surface)
    })
}

/// The draws of `columns`, with the caller naming what `surface_at` answers beyond the slice.
fn collected_with(
    columns: &[TerrainColumn],
    height_at: impl Fn(WorldCoord) -> Option<i32>,
    water_at: impl Fn(i32, i32) -> Option<WaterCell>,
    surface_at: impl Fn(WorldCoord) -> Option<TerrainMaterial>,
) -> Vec<SpriteDraw> {
    let frames = test_frames();
    let (look, _) = TerrainLook::new(7, |_| None, None);
    let mut out = Vec::new();
    collect_terrain_sprites(
        columns,
        projection(),
        &frames,
        &look,
        Surroundings {
            height_at,
            water_at,
            surface_at,
        },
        (4000.0, 4000.0),
        &mut out,
    );
    out
}

/// The draws of `columns` over a sea at `level`.
fn collected_over_a_flat_sea(
    columns: &[TerrainColumn],
    water_at: impl Fn(i32, i32) -> Option<WaterCell>,
) -> Vec<SpriteDraw> {
    collected(columns, |_| Some(0), water_at)
}

/// A shore: `columns` rise above a sea at level `0.0`; every other cell is water, one
/// block under the shore, as the world generates it.
fn shore(columns: &[TerrainColumn]) -> Vec<SpriteDraw> {
    let elevations: HashMap<(i32, i32), i32> = columns
        .iter()
        .map(|column| ((column.coord.x, column.coord.y), column.elevation))
        .collect();
    let height_at =
        |coord: WorldCoord| Some(elevations.get(&(coord.x, coord.y)).copied().unwrap_or(-1));
    let water_at = |x, y| {
        (!elevations.contains_key(&(x, y))).then_some(WaterCell {
            level: 0.0,
            elevation: 0.0,
        })
    };
    collected(columns, height_at, water_at)
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

fn reflections(draws: &[SpriteDraw]) -> usize {
    draws
        .iter()
        .filter(|draw| matches!(&draw.kind, DrawKind::Reflection { .. }))
        .count()
}

/// A straight run of wall: the two blocks cast on the same water cell in front of them.
/// The block in front paints over the sliver of the block behind, so the behind's piece
/// queues first, whatever order the columns arrived in.
#[test]
fn the_back_block_reflects_before_the_front_block_on_their_shared_cell() {
    let back = column(1, 0, 1);
    let front = column(0, 0, 1);
    for columns in [&[back, front][..], &[front, back][..]] {
        let cells = reflection_pieces_by_cell(&shore(columns));
        let shared: Vec<&Vec<f64>> = cells.values().filter(|areas| areas.len() == 2).collect();
        assert!(!shared.is_empty(), "the two blocks share a cell");
        for areas in shared {
            assert!(
                areas[0] < areas[1],
                "the sliver of the back block paints before the front block's band"
            );
        }
    }
}

/// A rise above the water reflects in it, so the shore does not look pasted onto the sea.
#[test]
fn a_rise_above_the_water_reflects_in_it() {
    let draws = collected_over_a_flat_sea(&[grass_column(2)], sea(0.0));
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
    let wings_only = reflection_pieces_by_cell(&shore(&wings));
    let wing_count: usize = wings_only.values().map(Vec::len).sum();
    assert!(wing_count > 0, "the wings cast on the wedge of water");
    let lone_middle = reflection_pieces_by_cell(&shore(&[middle]));
    let lone_count: usize = lone_middle.values().map(Vec::len).sum();
    assert!(
        lone_count > 0,
        "a lone middle column casts on the wedge of water"
    );
    let formation = reflection_pieces_by_cell(&shore(&[middle, wings[0], wings[1]]));
    assert_eq!(
        formation, wings_only,
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
    let draws = collected_over_a_flat_sea(&[grass_column(2)], |_, _| None);
    assert_eq!(reflections(&draws), 0);
}

/// A column whose blocks all sit below the water hides in it: the water shows nothing of them.
#[test]
fn a_column_below_the_water_reflects_nothing() {
    let draws = collected_over_a_flat_sea(&[grass_column(0)], sea(2.0));
    assert_eq!(reflections(&draws), 0);
}

fn path_column(x: i32, y: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x, y },
        elevation: 2,
        surface: TerrainMaterial::Path,
        walkable: true,
    }
}

/// The path frames drawn, counted per connection mask (`x = 1000 + mask`), ignoring everything
/// else the pass draws (reflections included).
fn path_variant_counts(draws: &[SpriteDraw]) -> [usize; 16] {
    let mut counts = [0; 16];
    for draw in draws {
        if let DrawKind::Sprite { frame, .. } = &draw.kind
            && (1000..1016).contains(&frame.x)
        {
            counts[(frame.x - 1000) as usize] += 1;
        }
    }
    counts
}

#[test]
fn a_path_block_draws_the_variant_of_its_connections() {
    let columns = [path_column(-1, 0), path_column(0, 0), path_column(1, 0)];
    let draws = collected(&columns, |_| Some(2), |_, _| None);
    let counts = path_variant_counts(&draws);
    assert_eq!(counts[1], 1, "the -x end joins only +x");
    assert_eq!(counts[4], 1, "the +x end joins only -x");
    assert_eq!(counts[5], 1, "the middle joins both sides");
    assert_eq!(counts.iter().sum::<usize>(), 3);
}

#[test]
fn diagonal_neighbours_do_not_join() {
    let centre = path_column(0, 0);
    let diagonals = [
        path_column(1, 1),
        path_column(1, -1),
        path_column(-1, 1),
        path_column(-1, -1),
    ];
    let mut columns = vec![centre];
    columns.extend(diagonals);
    let draws = collected(&columns, |_| Some(2), |_, _| None);
    let counts = path_variant_counts(&draws);
    assert_eq!(
        counts[0], 5,
        "diagonal neighbours do not join any of the five"
    );
    assert_eq!(counts.iter().sum::<usize>(), 5);
}

/// A path neighbour that exists outside the drawn slice (a loaded cell of another chunk) still
/// counts as a connection.
#[test]
fn a_path_neighbour_outside_the_slice_joins() {
    let centre = path_column(0, 0);
    let draws = collected_with(
        &[centre],
        |_| Some(2),
        |_, _| None,
        |at| (at == (WorldCoord { x: 1, y: 0 })).then_some(TerrainMaterial::Path),
    );
    let counts = path_variant_counts(&draws);
    assert_eq!(
        counts[1], 1,
        "the +x neighbour of the centre column is a path"
    );
}

/// A missing variant falls back to the plain path block instead of vanishing.
#[test]
fn a_missing_path_variant_falls_back_to_the_plain_block() {
    let mut frames = test_frames();
    frames.path_frames[1] = None;
    let columns = [path_column(-1, 0), path_column(0, 0), path_column(1, 0)];
    let (look, _) = TerrainLook::new(7, |_| None, None);
    let mut out = Vec::new();
    let surface_at = |at: WorldCoord| {
        columns
            .iter()
            .find(|column| column.coord == at)
            .map(|column| column.surface)
    };
    collect_terrain_sprites(
        &columns,
        projection(),
        &frames,
        &look,
        Surroundings {
            height_at: |_| Some(2),
            water_at: |_, _| None,
            surface_at,
        },
        (4000.0, 4000.0),
        &mut out,
    );
    let fallback = out
        .iter()
        .filter(|draw| matches!(&draw.kind, DrawKind::Sprite { frame, .. } if frame.x == 10))
        .count();
    assert_eq!(
        fallback, 1,
        "the column needing mask 1 drew the plain path block"
    );
}
