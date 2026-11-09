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

/// A rise above the water reflects in it, so the shore does not look pasted onto the sea.
#[test]
fn a_rise_above_the_water_reflects_in_it() {
    let draws = collected(&[grass_column(2)], sea(0.0));
    assert!(
        reflections(&draws) > 0,
        "the water shows the blocks of the shore"
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
