use super::{SpriteBand, SpriteLayout, footprint_band, ink_layout};
use crate::assets::ink::{InkBox, asset_ink};
use crate::projection::ScreenPoint;

const TILE_WIDTH: f64 = 80.0;

fn ground() -> ScreenPoint {
    ScreenPoint { x: 0.0, y: 0.0 }
}

/// A block drawn over the whole tile: a tile across, from half a tile height below the ground
/// centre up over the block's body.
#[test]
fn a_full_block_covers_its_tile_and_stands_on_it() {
    let ink = InkBox {
        x: -0.5,
        y: -0.583008,
        width: 1.0,
        height: 0.833008,
    };
    let layout = ink_layout(ground(), ink, TILE_WIDTH);
    assert_eq!(layout.x, -40.0, "half a tile either side of the ground centre");
    assert_eq!(layout.width, 80.0);
    assert!(
        (layout.y + layout.height - 20.0).abs() < 1e-9,
        "the bottom is the ground diamond's south corner: {}",
        layout.y + layout.height
    );
}

/// The reason this exists: a tree's drawing stops at the foot of its trunk, so it stands at the
/// centre of its tile, not on the south corner the template reaches down to.
#[test]
fn a_tree_stands_at_the_centre_of_its_tile() {
    let tree = InkBox {
        x: -0.308496,
        y: -0.712695,
        width: 0.616992,
        height: 0.731348,
    };
    let layout = ink_layout(ground(), tree, TILE_WIDTH);
    let foot = layout.y + layout.height;
    assert!(foot.abs() < 2.0, "the trunk meets the ground centre, not {foot} below it");
    assert!(layout.width < TILE_WIDTH, "narrower than its tile: {}", layout.width);
}

/// And a boulder is knee high: a frame placed as a whole block would draw it several times over.
#[test]
fn a_small_drawing_stays_small() {
    let rock = InkBox {
        x: -0.259082,
        y: -0.267676,
        width: 0.428711,
        height: 0.372656,
    };
    let layout = ink_layout(ground(), rock, TILE_WIDTH);
    assert!((layout.width - 34.29688).abs() < 1e-9, "{}", layout.width);
    assert!(layout.height < TILE_WIDTH / 2.0, "{}", layout.height);
}

#[test]
fn ground_position_translates_the_sprite_unchanged() {
    let ink = InkBox { x: -0.25, y: -0.5, width: 0.5, height: 0.75 };
    let at_origin = ink_layout(ground(), ink, TILE_WIDTH);
    let moved = ink_layout(ScreenPoint { x: 300.0, y: -120.0 }, ink, TILE_WIDTH);
    assert_eq!(moved.width, at_origin.width);
    assert_eq!(moved.height, at_origin.height);
    assert_eq!(moved.x - at_origin.x, 300.0);
    assert_eq!(moved.y - at_origin.y, -120.0);
}

/// Zooming is the tile width changing, so everything has to scale with it and nothing may drift.
#[test]
fn the_tile_width_scales_the_whole_rectangle() {
    let ink = InkBox { x: -0.25, y: -0.5, width: 0.5, height: 0.75 };
    let small = ink_layout(ground(), ink, 40.0);
    let large = ink_layout(ground(), ink, 80.0);
    assert_eq!(
        large,
        SpriteLayout {
            x: small.x * 2.0,
            y: small.y * 2.0,
            width: small.width * 2.0,
            height: small.height * 2.0,
        }
    );
}

/// The measurement and the placement have to agree about the anchor, so this goes from a source
/// asset's own coordinates all the way to pixels: a drawing covering the quarter tile north of
/// the anchor lands exactly there.
#[test]
fn a_measured_asset_lands_where_it_was_drawn() {
    let svg = concat!(
        r#"<svg viewBox="0 -341 1024 853">"#,
        r#"<path fill="transparent" d="M512.0,0.0 1024.0,256.0 512.0,512.0 0.0,256.0 Z" />"#,
        r#"<path d="M256.0,0.0 768.0,0.0 768.0,256.0 256.0,256.0 Z" /></svg>"#,
    );
    let ink = asset_ink(svg).expect("measured");
    let layout = ink_layout(ScreenPoint { x: 100.0, y: 200.0 }, ink, TILE_WIDTH);
    assert_eq!(layout.x, 100.0 - 20.0, "a quarter tile left of the anchor");
    assert_eq!(layout.width, 40.0, "half a tile across");
    assert_eq!(layout.y, 200.0 - 20.0, "reaching a quarter tile above the ground");
    assert_eq!(layout.y + layout.height, 200.0, "down to the ground centre");
}

/// A footprint along the engine's x: each cell is half a tile to the right and a quarter of
/// one up the screen.
const STEP_X: (f64, f64) = (TILE_WIDTH / 2.0, -TILE_WIDTH / 4.0);

fn anchor() -> ScreenPoint {
    ScreenPoint { x: 0.0, y: 0.0 }
}

/// How far a point lies along the footprint, in cells, from the anchor cell's centre: the
/// measure the cut is made in. The cuts fall on whole numbers, half a tile past each centre.
fn cells_along(p: (f64, f64)) -> f64 {
    (p.0 - anchor().x) / STEP_X.0
}

fn band(layout: SpriteLayout, index: i32, cells: i32) -> SpriteBand {
    footprint_band(layout, anchor(), STEP_X, index, cells, 0.0).expect("a band")
}

/// A band holds the drawing over its own cell and no more: the stretch of screen between the
/// cuts half a tile past its centre and half a tile past the one in front of it.
#[test]
fn a_band_holds_only_its_own_cell() {
    // A three-cell building, two tiles across and standing well above its footprint.
    let layout = SpriteLayout { x: -40.0, y: -200.0, width: 160.0, height: 240.0 };
    for index in 0..3 {
        let band = band(layout, index, 3);
        for &corner in band.corners() {
            let along = cells_along(corner);
            // The end bands are cut on their inner side only.
            if index > 0 {
                assert!(along >= f64::from(index) - 1e-9, "band {index} reaches cell {along}");
            }
            if index < 2 {
                assert!(along <= f64::from(index + 1) + 1e-9, "band {index} reaches cell {along}");
            }
        }
    }
}

/// The cut is vertical, like the strips the TypeScript client cuts its texture into, and not
/// along the cells' shared diamond edge: the two disagree over a wedge that widens up the
/// screen, and there a player level with the far cell showed through the artwork.
#[test]
fn the_cut_falls_straight_down_the_screen() {
    let layout = SpriteLayout { x: -40.0, y: -200.0, width: 160.0, height: 240.0 };
    let first = band(layout, 0, 3);
    let cut = STEP_X.0;
    // High above the footprint, where a diagonal cut would have leaned far to the right.
    for height in [-200.0, -120.0, -20.0] {
        assert!(inside(&first, (cut - 1.0, height)), "{cut} at {height}");
        assert!(!inside(&first, (cut + 1.0, height)), "{cut} at {height}");
    }
}

/// A cut at the cell's own centre gave the cell behind the near cell's own corner, and the
/// ground a row in front then painted over it. The corner of the anchor cell's ground diamond —
/// half a tile right of its centre, a quarter of one down — must stay in band 0.
#[test]
fn the_near_cell_keeps_its_own_corner() {
    let layout = SpriteLayout { x: -40.0, y: -200.0, width: 160.0, height: 240.0 };
    let corner = (TILE_WIDTH / 4.0, TILE_WIDTH / 8.0);
    assert!(cells_along(corner) < 1.0, "the corner is the anchor cell's");
    let first = band(layout, 0, 3);
    assert!(
        inside(&first, corner),
        "band 0 must hold {corner:?}: {:?}",
        first.corners()
    );
    assert!(!inside(&band(layout, 1, 3), corner), "and band 1 must not");
}

/// Whether a convex polygon, wound either way, contains a point.
fn inside(band: &SpriteBand, p: (f64, f64)) -> bool {
    let corners = band.corners();
    let side = |a: (f64, f64), b: (f64, f64)| {
        (b.0 - a.0) * (p.1 - a.1) - (b.1 - a.1) * (p.0 - a.0)
    };
    let signs: Vec<f64> = (0..corners.len())
        .map(|i| side(corners[i], corners[(i + 1) % corners.len()]))
        .collect();
    signs.iter().all(|s| *s >= -1e-9) || signs.iter().all(|s| *s <= 1e-9)
}

/// Nothing may be lost or drawn twice: every band's area together is the whole rectangle.
#[test]
fn the_bands_cover_the_drawing_once() {
    let layout = SpriteLayout { x: -40.0, y: -200.0, width: 160.0, height: 240.0 };
    let total: f64 = (0..3).map(|k| area(&band(layout, k, 3))).sum();
    assert!(
        (total - layout.width * layout.height).abs() < 1e-6,
        "{total} of {}",
        layout.width * layout.height
    );
}

fn area(band: &SpriteBand) -> f64 {
    let corners = band.corners();
    let mut sum = 0.0;
    for i in 0..corners.len() {
        let (a, b) = (corners[i], corners[(i + 1) % corners.len()]);
        sum += a.0 * b.1 - b.0 * a.1;
    }
    sum.abs() / 2.0
}

#[test]
fn a_single_cell_sprite_is_not_cut() {
    let layout = SpriteLayout { x: 10.0, y: 20.0, width: 30.0, height: 40.0 };
    let whole = band(layout, 0, 1);
    assert_eq!(whole.corners().len(), 4);
    assert!((area(&whole) - 30.0 * 40.0).abs() < 1e-9);
}

/// A footprint running along the engine's y goes the other way across the screen, so its cuts
/// march the other way too — and the anchor cell is still the one nearest the camera.
#[test]
fn a_footprint_the_other_way_is_cut_the_other_way() {
    let layout = SpriteLayout { x: -120.0, y: -200.0, width: 160.0, height: 240.0 };
    let step = (-TILE_WIDTH / 2.0, -TILE_WIDTH / 4.0);
    let far = footprint_band(layout, anchor(), step, 2, 3, 0.0).expect("a band");
    let near = footprint_band(layout, anchor(), step, 0, 3, 0.0).expect("a band");
    let mean = |b: &SpriteBand| {
        b.corners().iter().map(|c| c.0).sum::<f64>() / b.corners().len() as f64
    };
    assert!(mean(&far) < mean(&near), "the far cell is further left");
    assert!(
        near.corners().iter().all(|c| c.0 >= step.0 - 1e-9),
        "the near band keeps its own half tile: {:?}",
        near.corners()
    );
    let total: f64 = (0..3)
        .map(|k| area(&footprint_band(layout, anchor(), step, k, 3, 0.0).expect("a band")))
        .sum();
    assert!((total - layout.width * layout.height).abs() < 1e-6, "{total}");
}

/// A footprint longer than the drawing: the bands with nothing in them are nothing to draw.
#[test]
fn a_band_with_nothing_in_it_is_none() {
    let layout = SpriteLayout { x: -20.0, y: -20.0, width: 40.0, height: 40.0 };
    assert!(footprint_band(layout, anchor(), STEP_X, 5, 7, 0.0).is_none());
}

/// The bleed is in screen pixels, measured across the cut, and it only ever grows a band.
#[test]
fn the_bleed_overlaps_neighbouring_bands() {
    let layout = SpriteLayout { x: -40.0, y: -200.0, width: 160.0, height: 240.0 };
    let tight = band(layout, 1, 3);
    let loose = footprint_band(layout, anchor(), STEP_X, 1, 3, 0.5).expect("a band");
    let widened = area(&loose) - area(&tight);
    // Half a pixel on each of two cuts, along the width the band spans.
    assert!(widened > 0.0, "the bleed must grow the band: {widened}");
    assert!(widened < layout.width * 2.0, "but only by a pixel: {widened}");
}
