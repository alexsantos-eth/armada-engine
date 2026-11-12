use super::*;
use crate::assets::sprites::DrawKind;
use iso::projection::{GridPoint, project_block};
use iso::scene_order::DrawKey;
use iso::water::blur_radius;

const TILE_WIDTH: f64 = 280.0;
const BOX_HEIGHT: f64 = 95.5;

fn projection() -> ProjectionConfig {
    ProjectionConfig {
        tile_width: TILE_WIDTH,
        tile_height: TILE_WIDTH / 2.0,
        elevation_step: Some(BOX_HEIGHT),
        origin_x: 600.0,
        origin_y: 400.0,
    }
}

fn frame() -> SpriteFrame {
    SpriteFrame {
        x: 0,
        y: 0,
        width: 64,
        height: 64,
    }
}

/// Where the client puts the ground point of the cell `(x, y)` at `elevation`.
fn feet(cell: (i32, i32), elevation: f64) -> ScreenPoint {
    let at = project_block(
        GridPoint {
            x: f64::from(cell.0) + 0.5,
            y: f64::from(cell.1) + 0.5,
        },
        elevation,
        projection(),
    );
    ScreenPoint {
        x: at.screen_x,
        y: at.screen_y,
    }
}

/// A sprite standing on `at`, a tile wide and `tall` pixels high, as the atlas would place it.
fn layout(at: ScreenPoint, tall: f64) -> SpriteLayout {
    SpriteLayout {
        x: at.x - TILE_WIDTH / 2.0,
        y: at.y - tall,
        width: TILE_WIDTH,
        height: tall,
    }
}

/// Everything the water of `water_at` shows of a sprite standing on `cell` at `elevation`.
fn collect(
    cell: (i32, i32),
    elevation: f64,
    reflected: Reflected,
    water_at: impl Fn(i32, i32) -> Option<WaterCell>,
) -> Vec<SpriteDraw> {
    let at = feet(cell, elevation);
    let mut out = Vec::new();
    collect_reflection(
        ReflectionSprite {
            texture: 3,
            frame: frame(),
            layout: layout(at, BOX_HEIGHT),
            feet: at,
            elevation,
            lift: 0.0,
        },
        reflected,
        projection(),
        water_at,
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

/// The cells of a draw list, by the depth key each piece was given.
fn pieces(draws: &[SpriteDraw]) -> Vec<(usize, i32)> {
    draws
        .iter()
        .map(|draw| match &draw.kind {
            DrawKind::Reflection { points, .. } => (points.len(), draw.key.layer),
            other => panic!("a reflection is not {}", kind_name(other)),
        })
        .collect()
}

fn kind_name(kind: &DrawKind) -> &'static str {
    match kind {
        DrawKind::Sprite { .. } => "a sprite",
        DrawKind::Shaded { .. } => "a shaded sprite",
        DrawKind::GroundShadow { .. } => "a ground shadow",
        DrawKind::Reflection { .. } => "a reflection",
        DrawKind::Voxel { .. } => "a voxel",
        DrawKind::FaceShadow { .. } => "a face shadow",
        DrawKind::GroundEllipse { .. } => "a ground ellipse",
    }
}

/// Something standing in the water is mirrored in it, in several pieces, each a convex polygon
#[test]
fn something_standing_in_the_water_is_mirrored_in_it() {
    let draws = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    assert!(!draws.is_empty(), "the water shows it");
    for (corners, layer) in pieces(&draws) {
        assert!(corners >= 3, "a piece is a polygon");
        assert_eq!(layer, REFLECTION_LAYER);
    }
}

/// The pieces are cut to cells in front of the caster, which is where its reflection hangs: down
#[test]
fn the_pieces_lie_in_front_of_what_they_mirror() {
    let draws = collect((4, 4), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    let own = project_block(GridPoint { x: 4.5, y: 4.5 }, 0.0, projection());
    for draw in &draws {
        let DrawKind::Reflection { points, .. } = &draw.kind else {
            unreachable!()
        };
        for &(_, y) in points {
            assert!(
                y >= own.screen_y - 1e-6,
                "a reflection never climbs above the waterline: {y} vs {}",
                own.screen_y,
            );
        }
    }
}

/// Dry land shows nothing, however much stands on it.
#[test]
fn dry_land_mirrors_nothing() {
    let draws = collect(
        (0, 0),
        0.0,
        Reflected::Standing { turn_at: None },
        |_, _| None,
    );
    assert!(draws.is_empty());
}

/// Water above what it would mirror shows nothing of it: a reflection hangs below the surface.
#[test]
fn water_above_the_caster_mirrors_nothing() {
    let draws = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(2.0));
    assert!(draws.is_empty());
}

/// The highest point of the mirrored drawing, across every piece it was cut into.
fn topmost(draws: &[SpriteDraw]) -> f64 {
    draws
        .iter()
        .map(|draw| match &draw.kind {
            DrawKind::Reflection { points, .. } => {
                points.iter().map(|&(_, y)| y).fold(f64::INFINITY, f64::min)
            }
            other => panic!("a reflection is not {}", kind_name(other)),
        })
        .fold(f64::INFINITY, f64::min)
}

/// Something on a bank is still mirrored, hanging from the same waterline as the water itself:
/// the reflection stays flush with the shore no matter how high above the water it stands.
#[test]
fn something_on_a_bank_hangs_flush_with_the_waterline() {
    let on_water = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    let on_bank = collect((0, 0), 2.0, Reflected::Standing { turn_at: None }, sea(0.0));
    assert!(
        !on_bank.is_empty(),
        "the water two blocks below still shows it"
    );
    assert_eq!(
        topmost(&on_bank),
        topmost(&on_water),
        "a reflection hangs from the waterline flush with the shore",
    );
}

/// A sprite drawn above the ground it stands on — a jump — is mirrored the same lift deeper in
/// the water: the reflection arcs with the jump instead of sliding along the surface.
#[test]
fn a_jumping_sprite_sinks_its_reflection_by_the_lift() {
    let grounded = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    let lift = 0.8;
    let at = feet((0, 0), 0.0);
    let risen = ScreenPoint {
        x: at.x,
        y: at.y - lift * BOX_HEIGHT,
    };
    let mut airborne = Vec::new();
    collect_reflection(
        ReflectionSprite {
            texture: 3,
            frame: frame(),
            layout: layout(risen, BOX_HEIGHT),
            feet: risen,
            elevation: lift,
            lift,
        },
        Reflected::Standing { turn_at: None },
        projection(),
        sea(0.0),
        &mut airborne,
    );
    assert!(!airborne.is_empty(), "the water still shows it");
    assert!(
        (topmost(&airborne) - (topmost(&grounded) + lift * BOX_HEIGHT)).abs() < 1e-6,
        "the reflection sinks by the lift: {} vs {}",
        topmost(&airborne),
        topmost(&grounded) + lift * BOX_HEIGHT,
    );
}

/// An asset that is already its own reflection is laid where it was drawn, so its pieces stay
#[test]
fn an_asset_drawn_as_the_water_shows_it_stays_where_it_is() {
    let draws = collect((0, 0), 0.0, Reflected::AsDrawn, sea(0.0));
    assert!(!draws.is_empty());
    let rect = layout(feet((0, 0), 0.0), BOX_HEIGHT);
    for draw in &draws {
        let DrawKind::Reflection { points, .. } = &draw.kind else {
            unreachable!()
        };
        for &(x, y) in points {
            assert!(
                x >= rect.x - 1e-6 && x <= rect.x + rect.width + 1e-6 && y >= rect.y - 1e-6,
                "({x}, {y}) is outside the drawing's own rectangle",
            );
            assert!(
                y <= rect.y + rect.height + blur_radius(rect.height) + 1e-6,
                "({x}, {y}) hangs deeper than the water smears it",
            );
        }
    }
}

/// The water of a cell sorts the piece on it, so the land in front of that cell covers it: the
#[test]
fn a_piece_sorts_by_the_water_it_lies_on() {
    let draws = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    let depths: Vec<f64> = draws.iter().map(|draw| draw.key.depth).collect();
    assert!(
        depths.windows(2).any(|pair| pair[0] != pair[1]),
        "the pieces do not all share one depth: {depths:?}",
    );
    let own = ground_key(0.5, 0.5, 0.0, REFLECTION_LAYER, projection().tile_height);
    assert!(
        depths.iter().any(|&depth| depth > own.depth),
        "and some of them are nearer the camera than the caster's own cell",
    );
}

/// Only what the water mirrors is drawn, in the water's colour: the artwork is read a second
#[test]
fn the_pieces_read_the_casters_own_artwork_in_the_waters_colour() {
    let draws = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    for draw in &draws {
        let DrawKind::Reflection {
            texture,
            frame: drawn,
            uv,
            points,
            colour,
        } = &draw.kind
        else {
            unreachable!()
        };
        assert_eq!(*texture, 3, "the caster's own texture");
        assert_eq!(*drawn, frame(), "and its own frame");
        assert_eq!(uv.len(), points.len());
        assert!(
            uv.iter()
                .all(|&(u, v)| (0.0..=1.0).contains(&u) && (0.0..=1.0).contains(&v))
        );
        assert_eq!((colour.r, colour.g, colour.b), rgb(REFLECTION_TINT));
        assert!(colour.a > 0.0 && colour.a <= REFLECTION_ALPHA);
    }
}

/// What the water multiplies the artwork by, without its opacity.
fn rgb(colour: Color) -> (f32, f32, f32) {
    (colour.r, colour.g, colour.b)
}

/// The draws of one cell of water, in the order they were queued.
fn copies(draws: &[SpriteDraw], key: DrawKey) -> Vec<&SpriteDraw> {
    draws
        .iter()
        .filter(|draw| draw.key.depth == key.depth && draw.key.layer == key.layer)
        .collect()
}

/// The top edge of a draw's piece on screen.
fn top_of(draw: &SpriteDraw) -> f64 {
    match &draw.kind {
        DrawKind::Reflection { points, .. } => {
            points.iter().map(|&(_, y)| y).fold(f64::INFINITY, f64::min)
        }
        other => panic!("a reflection is not {}", kind_name(other)),
    }
}

/// The water is never a mirror: every cell draws what it shows as a smear, the reflection itself
/// at full strength and copies of it hanging deeper, each fainter than the one above.
#[test]
fn the_water_smears_what_it_mirrors() {
    let draws = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    assert!(!draws.is_empty());
    let key = draws[0].key;
    let smear = copies(&draws, key);
    assert!(
        smear.len() > 1,
        "a cell draws more than the sharp reflection",
    );
    let alphas: Vec<f32> = smear
        .iter()
        .map(|draw| match &draw.kind {
            DrawKind::Reflection { colour, .. } => colour.a,
            other => panic!("a reflection is not {}", kind_name(other)),
        })
        .collect();
    assert_eq!(
        alphas[0], REFLECTION_ALPHA,
        "the reflection itself is drawn in full",
    );
    assert!(
        alphas.windows(2).all(|pair| pair[1] < pair[0]),
        "and each copy over it is fainter: {alphas:?}",
    );
    assert!(
        smear
            .windows(2)
            .all(|pair| top_of(pair[1]) >= top_of(pair[0]) - 1e-9),
        "the copies hang below the reflection, never above it",
    );
}

/// The smear widens with depth: a reflection far below the surface is drawn out of more copies
/// than one on the surface itself, so the far end of it reads softer.
#[test]
fn a_deeper_reflection_is_smeared_wider() {
    let draws = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    let surface = feet((0, 0), 0.0).y;
    let depth = |draw: &SpriteDraw| top_of(draw) - surface;
    let keys: Vec<DrawKey> = {
        let mut keys: Vec<DrawKey> = Vec::new();
        for draw in &draws {
            if !keys
                .iter()
                .any(|key| key.depth == draw.key.depth && key.layer == draw.key.layer)
            {
                keys.push(draw.key);
            }
        }
        keys
    };
    let nearest = keys
        .iter()
        .min_by(|a, b| {
            depth(copies(&draws, **a)[0])
                .partial_cmp(&depth(copies(&draws, **b)[0]))
                .unwrap()
        })
        .copied()
        .expect("the water shows it somewhere");
    let deepest = keys
        .iter()
        .max_by(|a, b| {
            depth(copies(&draws, **a)[0])
                .partial_cmp(&depth(copies(&draws, **b)[0]))
                .unwrap()
        })
        .copied()
        .expect("the water shows it somewhere");
    let spread = |key: DrawKey| copies(&draws, key).len();
    assert!(
        spread(deepest) > spread(nearest),
        "the deep end of the reflection takes more copies than its near end: {} vs {}",
        spread(deepest),
        spread(nearest),
    );
}

/// A sprite with no artwork to show queues nothing rather than a mesh with no area.
#[test]
fn a_sprite_with_no_area_mirrors_nothing() {
    let at = feet((0, 0), 0.0);
    let mut out = Vec::new();
    collect_reflection(
        ReflectionSprite {
            texture: 0,
            frame: frame(),
            layout: SpriteLayout {
                x: at.x,
                y: at.y,
                width: 0.0,
                height: 0.0,
            },
            feet: at,
            elevation: 0.0,
            lift: 0.0,
        },
        Reflected::Standing { turn_at: None },
        projection(),
        sea(0.0),
        &mut out,
    );
    assert!(out.is_empty());
}

/// A projection with no tile height still answers, rather than dividing by zero when it widens
#[test]
fn a_projection_with_no_tile_height_mirrors_nothing() {
    let at = ScreenPoint { x: 0.0, y: 0.0 };
    let mut out = Vec::new();
    collect_reflection(
        ReflectionSprite {
            texture: 0,
            frame: frame(),
            layout: layout(at, 10.0),
            feet: at,
            elevation: 0.0,
            lift: 0.0,
        },
        Reflected::Standing { turn_at: None },
        ProjectionConfig {
            tile_height: 0.0,
            elevation_step: None,
            ..projection()
        },
        sea(0.0),
        &mut out,
    );
    assert!(out.is_empty());
}

/// A footprint that runs over several cells is turned about its own run, so the reflection of a
#[test]
fn a_long_sprite_is_turned_rather_than_flipped() {
    let flipped = collect((0, 0), 0.0, Reflected::Standing { turn_at: None }, sea(0.0));
    let turned = collect(
        (0, 0),
        0.0,
        Reflected::Standing {
            turn_at: Some(feet((0, 0), 0.0).x + TILE_WIDTH / 2.0),
        },
        sea(0.0),
    );
    let span = |draws: &[SpriteDraw]| {
        draws
            .iter()
            .flat_map(|draw| match &draw.kind {
                DrawKind::Reflection { points, .. } => points.clone(),
                _ => unreachable!(),
            })
            .map(|(x, _)| x)
            .fold(f64::NEG_INFINITY, f64::max)
    };
    assert!(
        span(&turned) > span(&flipped),
        "the turned reflection reaches further along the row: {} vs {}",
        span(&turned),
        span(&flipped),
    );
}
