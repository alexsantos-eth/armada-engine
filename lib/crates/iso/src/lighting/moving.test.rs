use super::*;
use crate::lighting::faces::{FaceAxis, TerrainFace};
use crate::lighting::phases::DAWN;
use crate::terrain::TerrainMaterial;

const TILE_WIDTH: f64 = 280.0;
const BOX_HEIGHT: f64 = 140.0;
const FOOT: (f64, f64) = (10.5, 20.5);

/// A figure about a block and a half tall standing on its feet.
fn figure() -> SpriteExtent {
    SpriteExtent {
        left: -60.0,
        top: -200.0,
        width: 120.0,
        height: 200.0,
    }
}

fn area_of() -> ((i32, i32), (i32, i32)) {
    moving_shadow_area(&DAWN.shadow, figure(), FOOT, TILE_WIDTH, BOX_HEIGHT)
        .expect("a figure at dawn throws a shadow")
}

type Scene = (Vec<ShadowSurface>, Vec<((i32, i32), f64)>);

/// Every cell of the area at the level `level_at` gives it as a receiver and ray blocker.
fn ground(level_at: impl Fn(i32, i32) -> Option<f64>) -> Scene {
    let ((min_x, min_y), (max_x, max_y)) = area_of();
    let mut surfaces = Vec::new();
    let mut blockers = Vec::new();
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            if let Some(level) = level_at(x, y) {
                surfaces.push(ShadowSurface::Ground {
                    cell: (x, y),
                    level,
                });
                blockers.push(((x, y), level));
            }
        }
    }
    (surfaces, blockers)
}

fn lay(level: f64, surfaces: &[ShadowSurface], blockers: &[((i32, i32), f64)]) -> Vec<ShadowPiece> {
    let mut out = Vec::new();
    moving_shadow_pieces(
        &DAWN.shadow,
        figure(),
        FOOT,
        level,
        TILE_WIDTH,
        BOX_HEIGHT,
        surfaces,
        blockers,
        &mut out,
    );
    out
}

/// A piece's area in world tiles, for a ground piece (whose parameters are the cell itself).
fn tiles(piece: &ShadowPiece) -> f64 {
    let mut sum = 0.0;
    for index in 0..piece.points.len() {
        let (a, b) = (
            piece.points[index],
            piece.points[(index + 1) % piece.points.len()],
        );
        sum += a.0 * b.1 - b.0 * a.1;
    }
    (sum / 2.0).abs()
}

/// The whole silhouette laid flat, for comparing the cut pieces against.
fn whole_area() -> f64 {
    let extent = figure();
    let matrix = silhouette_matrix(&DAWN.shadow, FOOT, 0.0, TILE_WIDTH, BOX_HEIGHT);
    let corners = [
        matrix.apply((extent.left, extent.top)),
        matrix.apply((extent.left + extent.width, extent.top)),
        matrix.apply((extent.left + extent.width, 0.0)),
        matrix.apply((extent.left, 0.0)),
    ];
    let mut sum = 0.0;
    for index in 0..4 {
        let (a, b) = (corners[index], corners[(index + 1) % 4]);
        sum += a.0 * b.1 - b.0 * a.1;
    }
    (sum / 2.0).abs()
}

#[test]
fn on_level_ground_the_pieces_are_the_whole_silhouette_cut_up() {
    let (surfaces, blockers) = ground(|_, _| Some(3.0));
    let pieces = lay(3.0, &surfaces, &blockers);
    assert!(
        pieces.len() > 1,
        "a figure a block tall crosses more than one cell"
    );
    let laid: f64 = pieces.iter().map(tiles).sum();
    assert!(
        (laid - whole_area()).abs() < 1e-6,
        "the pieces are the silhouette, no more and no less: {laid} vs {}",
        whole_area()
    );
}

#[test]
fn a_step_down_stops_the_ground_shadow_at_the_wall() {
    // Half the world a block lower, the half the shadow runs into.
    let level_at = |x: i32, _: i32| Some(if x < 10 { 2.0 } else { 3.0 });
    let (surfaces, blockers) = ground(level_at);
    let pieces = lay(3.0, &surfaces, &blockers);
    let laid: f64 = pieces.iter().map(tiles).sum();
    // The higher top terminates the horizontal projection. The wall is tested separately as a
    // receiver, so the shadow deforms at the step rather than continuing on the lower ground.
    assert!(
        (laid - whole_area()).abs() < 1e-6,
        "one horizontal silhouette ends at the transition: {laid} against {}",
        whole_area()
    );
    assert!(
        pieces.iter().any(|piece| piece.surface.top() == 2.0)
            && pieces.iter().any(|piece| piece.surface.top() == 3.0),
        "and both levels have their share of it"
    );
}

#[test]
fn ground_in_the_lee_of_higher_ground_takes_nothing() {
    // A higher top catches the rays, so the lower ground behind its wall stays clear.
    let level_at = |_: i32, y: i32| Some(if (21..=22).contains(&y) { 3.0 } else { 2.0 });
    let (surfaces, blockers) = ground(level_at);
    let pieces = lay(2.0, &surfaces, &blockers);
    assert!(
        pieces.iter().all(|piece| piece.surface.cell().1 <= 22),
        "nothing is laid on the ground behind the step"
    );
    assert!(
        pieces.iter().any(|piece| piece.surface.top() == 3.0),
        "the step itself retains the horizontal portion"
    );
}

#[test]
fn every_piece_stays_inside_its_own_surface_and_artwork() {
    let (surfaces, blockers) = ground(|x, _| Some(if x < 10 { 2.0 } else { 3.0 }));
    for piece in lay(3.0, &surfaces, &blockers) {
        assert_eq!(piece.points.len(), piece.uv.len());
        for point in &piece.points {
            assert!(
                (-1e-9..=1.0 + 1e-9).contains(&point.0) && (-1e-9..=1.0 + 1e-9).contains(&point.1),
                "{point:?} is outside its surface"
            );
        }
        for uv in &piece.uv {
            assert!(
                (0.0..=1.0).contains(&uv.0) && (0.0..=1.0).contains(&uv.1),
                "{uv:?} is outside the artwork"
            );
        }
    }
}

#[test]
fn nothing_is_laid_below_the_caster_s_own_feet() {
    let (surfaces, blockers) = ground(|_, _| Some(3.0));
    for piece in lay(3.0, &surfaces, &blockers) {
        assert!(
            piece.uv.iter().all(|uv| uv.1 <= 1.0 + 1e-9),
            "the rows under the feet are inside the ground"
        );
    }
}

#[test]
fn the_shadow_runs_the_way_the_light_lays_it() {
    let (surfaces, blockers) = ground(|_, _| Some(3.0));
    let pieces = lay(3.0, &surfaces, &blockers);
    let along = |piece: &ShadowPiece| {
        piece
            .points
            .iter()
            .map(|&(across, down)| {
                let (x, y, _) = piece.surface.point(across, down);
                DAWN.shadow.dir_x * (x - FOOT.0) + DAWN.shadow.dir_y * (y - FOOT.1)
            })
            .fold(f64::NEG_INFINITY, f64::max)
    };
    let furthest = pieces.iter().map(along).fold(f64::NEG_INFINITY, f64::max);
    assert!(
        furthest > 1.0,
        "a figure a block tall throws a shadow over a tile long at dawn"
    );
}

#[test]
fn ground_above_the_caster_takes_only_what_stands_over_it() {
    // The figure is 200 px tall and a block is 140, so half a block up it is cut to the top
    // 130 px of itself: 65 % of its artwork.
    let (surfaces, blockers) = ground(|_, _| Some(3.5));
    let pieces = lay(3.0, &surfaces, &blockers);
    assert!(!pieces.is_empty());
    let deepest = pieces
        .iter()
        .flat_map(|piece| piece.uv.iter())
        .map(|uv| uv.1)
        .fold(0.0, f64::max);
    assert!(
        (deepest - 0.65).abs() < 1e-6,
        "read down to the plane and no further: {deepest}"
    );
}

#[test]
fn ground_above_the_whole_figure_receives_nothing() {
    let (surfaces, blockers) = ground(|_, _| Some(3.0 + 200.0 / BOX_HEIGHT));
    assert!(lay(3.0, &surfaces, &blockers).is_empty());
}

#[test]
fn cells_the_world_has_not_loaded_receive_nothing() {
    let (surfaces, blockers) = ground(|x, _| (x == 10).then_some(3.0));
    let pieces = lay(3.0, &surfaces, &blockers);
    assert!(!pieces.is_empty());
    assert!(pieces.iter().all(|piece| piece.surface.cell().0 == 10));
}

#[test]
fn a_wall_the_light_reaches_takes_the_shadow_that_climbs_it() {
    // A step up across the shadow's way. The light runs along `+y` at dawn, so the side a
    // column shows towards `-y` is lit, and a shadow running into it climbs it.
    let level_at = |_: i32, y: i32| Some(if y >= 21 { 3.0 } else { 2.0 });
    let (mut surfaces, blockers) = ground(level_at);
    let walls: Vec<ShadowSurface> = (6..=14)
        .map(|x| {
            ShadowSurface::Face(TerrainFace {
                x,
                y: 21,
                axis: FaceAxis::Y,
                top: 3.0,
                bottom: 2.0,
                material: TerrainMaterial::Sand,
            })
        })
        .collect();
    surfaces.extend(walls.iter().copied());
    let pieces = lay(2.0, &surfaces, &blockers);
    let on_walls: Vec<&ShadowPiece> = pieces
        .iter()
        .filter(|piece| matches!(piece.surface, ShadowSurface::Face(_)))
        .collect();
    assert!(
        !on_walls.is_empty(),
        "the shadow running into the step climbs its wall"
    );
    // And it is the figure from the waist up that climbs: its feet are on the ground it stands
    // on, which is this side of the step.
    let lowest = on_walls
        .iter()
        .flat_map(|piece| piece.uv.iter())
        .map(|uv| uv.1)
        .fold(0.0_f64, f64::max);
    assert!(lowest < 1.0, "the feet stay off the wall: {lowest}");
    let underfoot = pieces
        .iter()
        .filter(|piece| piece.surface.top() == 2.0)
        .flat_map(|piece| piece.uv.iter())
        .map(|uv| uv.1)
        .fold(0.0_f64, f64::max);
    assert!(
        underfoot > 0.99,
        "and they are on the ground before it: {underfoot}"
    );
}

#[test]
fn a_wall_facing_away_from_the_light_keeps_its_projection() {
    // The side a column shows towards `-x` may overlap its top in depth, but that overlap is no
    // longer an occluder: it retains the deformed piece it receives.
    let walls: Vec<ShadowSurface> = (18..=23)
        .map(|y| {
            ShadowSurface::Face(TerrainFace {
                x: 10,
                y,
                axis: FaceAxis::X,
                top: 3.0,
                bottom: 2.0,
                material: TerrainMaterial::Sand,
            })
        })
        .collect();
    let pieces = lay(3.0, &walls, &[]);
    assert!(
        !pieces.is_empty(),
        "the vertical face retains its deformed projection"
    );
    assert!(
        pieces
            .iter()
            .all(|piece| matches!(piece.surface, ShadowSurface::Face(_))),
        "the piece stays on the vertical face"
    );
}

#[test]
fn a_sun_overhead_lays_nothing() {
    let overhead = ShadowProjection {
        stretch: 0.0,
        ..DAWN.shadow
    };
    assert!(moving_shadow_area(&overhead, figure(), FOOT, TILE_WIDTH, BOX_HEIGHT).is_none());
    let mut out = Vec::new();
    moving_shadow_pieces(
        &overhead,
        figure(),
        FOOT,
        3.0,
        TILE_WIDTH,
        BOX_HEIGHT,
        &[ShadowSurface::Ground {
            cell: (10, 20),
            level: 3.0,
        }],
        &[],
        &mut out,
    );
    assert!(out.is_empty());
}

#[test]
fn artwork_with_nothing_above_its_feet_lays_nothing() {
    let below = SpriteExtent {
        left: -60.0,
        top: 0.0,
        width: 120.0,
        height: 200.0,
    };
    assert!(moving_shadow_area(&DAWN.shadow, below, FOOT, TILE_WIDTH, BOX_HEIGHT).is_none());
    let empty = SpriteExtent {
        left: -60.0,
        top: -200.0,
        width: 0.0,
        height: 200.0,
    };
    assert!(moving_shadow_area(&DAWN.shadow, empty, FOOT, TILE_WIDTH, BOX_HEIGHT).is_none());
    let mut out = Vec::new();
    moving_shadow_pieces(
        &DAWN.shadow,
        below,
        FOOT,
        3.0,
        TILE_WIDTH,
        BOX_HEIGHT,
        &[ShadowSurface::Ground {
            cell: (10, 20),
            level: 3.0,
        }],
        &[],
        &mut out,
    );
    assert!(out.is_empty());
}

#[test]
fn a_surface_reads_the_same_artwork_from_either_side_of_a_cut() {
    // Two cells at the same level: where a piece ends on one and starts on the next, both read
    // the same point of the figure. That is what makes the cut invisible.
    let (surfaces, blockers) = ground(|_, _| Some(3.0));
    let pieces = lay(3.0, &surfaces, &blockers);
    for piece in &pieces {
        for (point, uv) in piece.points.iter().zip(&piece.uv) {
            let (x, y, _) = piece.surface.point(point.0, point.1);
            // The reading is the inverse of the laying: carry the uv back through the matrix and
            // it lands on the world point it was read at.
            let extent = figure();
            let matrix = silhouette_matrix(&DAWN.shadow, FOOT, 0.0, TILE_WIDTH, BOX_HEIGHT);
            let sprite = (
                extent.left + uv.0 * extent.width,
                extent.top + uv.1 * extent.height,
            );
            let (back_x, back_y) = matrix.apply(sprite);
            assert!(
                (back_x - x).abs() < 1e-6 && (back_y - y).abs() < 1e-6,
                "the corner at {point:?} reads {uv:?}, which lays at ({back_x}, {back_y}) and not at ({x}, {y})"
            );
        }
    }
}

#[test]
fn the_area_covers_every_cell_a_piece_lands_on() {
    let ((min_x, min_y), (max_x, max_y)) = area_of();
    let (surfaces, blockers) = ground(|_, _| Some(3.0));
    for piece in lay(3.0, &surfaces, &blockers) {
        let (x, y) = piece.surface.cell();
        assert!((min_x..=max_x).contains(&x) && (min_y..=max_y).contains(&y));
    }
}
