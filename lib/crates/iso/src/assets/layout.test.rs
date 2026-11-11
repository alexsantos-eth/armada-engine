use super::{SpriteBand, SpriteLayout, footprint_band, ink_layout, sway_band};
use crate::assets::ink::{InkBox, asset_ink};
use crate::projection::ScreenPoint;

const TILE_WIDTH: f64 = 80.0;
const CUT: f64 = 0.6;
const SHEAR: f64 = 12.0;

fn ground() -> ScreenPoint {
    ScreenPoint { x: 0.0, y: 0.0 }
}

/// A block drawn over the whole tile: a tile across, from half a tile height below the ground
#[test]
fn a_full_block_covers_its_tile_and_stands_on_it() {
    let ink = InkBox {
        x: -0.5,
        y: -0.583008,
        width: 1.0,
        height: 0.833008,
    };
    let layout = ink_layout(ground(), ink, TILE_WIDTH);
    assert_eq!(
        layout.x, -40.0,
        "half a tile either side of the ground centre"
    );
    assert_eq!(layout.width, 80.0);
    assert!(
        (layout.y + layout.height - 20.0).abs() < 1e-9,
        "the bottom is the ground diamond's south corner: {}",
        layout.y + layout.height
    );
}

/// The reason this exists: a tree's drawing stops at the foot of its trunk, so it stands at the
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
    assert!(
        foot.abs() < 2.0,
        "the trunk meets the ground centre, not {foot} below it"
    );
    assert!(
        layout.width < TILE_WIDTH,
        "narrower than its tile: {}",
        layout.width
    );
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
    let ink = InkBox {
        x: -0.25,
        y: -0.5,
        width: 0.5,
        height: 0.75,
    };
    let at_origin = ink_layout(ground(), ink, TILE_WIDTH);
    let moved = ink_layout(
        ScreenPoint {
            x: 300.0,
            y: -120.0,
        },
        ink,
        TILE_WIDTH,
    );
    assert_eq!(moved.width, at_origin.width);
    assert_eq!(moved.height, at_origin.height);
    assert_eq!(moved.x - at_origin.x, 300.0);
    assert_eq!(moved.y - at_origin.y, -120.0);
}

/// Zooming is the tile width changing, so everything has to scale with it and nothing may drift.
#[test]
fn the_tile_width_scales_the_whole_rectangle() {
    let ink = InkBox {
        x: -0.25,
        y: -0.5,
        width: 0.5,
        height: 0.75,
    };
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
    assert_eq!(
        layout.y,
        200.0 - 20.0,
        "reaching a quarter tile above the ground"
    );
    assert_eq!(layout.y + layout.height, 200.0, "down to the ground centre");
}

/// A footprint along the engine's x: each cell is half a tile to the right and a quarter of
const STEP_X: (f64, f64) = (TILE_WIDTH / 2.0, -TILE_WIDTH / 4.0);

fn anchor() -> ScreenPoint {
    ScreenPoint { x: 0.0, y: 0.0 }
}

/// How far a point lies along the footprint, in cells, from the anchor cell's centre: the
fn cells_along(p: (f64, f64)) -> f64 {
    (p.0 - anchor().x) / STEP_X.0
}

fn band(layout: SpriteLayout, index: i32, cells: i32) -> SpriteBand {
    footprint_band(layout, anchor(), STEP_X, index, cells, 0.0).expect("a band")
}

/// A band holds the drawing over its own cell and no more: the stretch of screen between the
#[test]
fn a_band_holds_only_its_own_cell() {
    let layout = SpriteLayout {
        x: -40.0,
        y: -200.0,
        width: 160.0,
        height: 240.0,
    };
    for index in 0..3 {
        let band = band(layout, index, 3);
        for &corner in band.corners() {
            let along = cells_along(corner);
            if index > 0 {
                assert!(
                    along >= f64::from(index) - 1e-9,
                    "band {index} reaches cell {along}"
                );
            }
            if index < 2 {
                assert!(
                    along <= f64::from(index + 1) + 1e-9,
                    "band {index} reaches cell {along}"
                );
            }
        }
    }
}

/// The cut is vertical, like strips cut out of a texture, and not
#[test]
fn the_cut_falls_straight_down_the_screen() {
    let layout = SpriteLayout {
        x: -40.0,
        y: -200.0,
        width: 160.0,
        height: 240.0,
    };
    let first = band(layout, 0, 3);
    let cut = STEP_X.0;
    for height in [-200.0, -120.0, -20.0] {
        assert!(inside(&first, (cut - 1.0, height)), "{cut} at {height}");
        assert!(!inside(&first, (cut + 1.0, height)), "{cut} at {height}");
    }
}

/// A cut at the cell's own centre gave the cell behind the near cell's own corner, and the
#[test]
fn the_near_cell_keeps_its_own_corner() {
    let layout = SpriteLayout {
        x: -40.0,
        y: -200.0,
        width: 160.0,
        height: 240.0,
    };
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
    let side = |a: (f64, f64), b: (f64, f64)| (b.0 - a.0) * (p.1 - a.1) - (b.1 - a.1) * (p.0 - a.0);
    let signs: Vec<f64> = (0..corners.len())
        .map(|i| side(corners[i], corners[(i + 1) % corners.len()]))
        .collect();
    signs.iter().all(|s| *s >= -1e-9) || signs.iter().all(|s| *s <= 1e-9)
}

/// Nothing may be lost or drawn twice: every band's area together is the whole rectangle.
#[test]
fn the_bands_cover_the_drawing_once() {
    let layout = SpriteLayout {
        x: -40.0,
        y: -200.0,
        width: 160.0,
        height: 240.0,
    };
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
    let layout = SpriteLayout {
        x: 10.0,
        y: 20.0,
        width: 30.0,
        height: 40.0,
    };
    let whole = band(layout, 0, 1);
    assert_eq!(whole.corners().len(), 4);
    assert!((area(&whole) - 30.0 * 40.0).abs() < 1e-9);
}

/// A footprint running along the engine's y goes the other way across the screen, so its cuts
#[test]
fn a_footprint_the_other_way_is_cut_the_other_way() {
    let layout = SpriteLayout {
        x: -120.0,
        y: -200.0,
        width: 160.0,
        height: 240.0,
    };
    let step = (-TILE_WIDTH / 2.0, -TILE_WIDTH / 4.0);
    let far = footprint_band(layout, anchor(), step, 2, 3, 0.0).expect("a band");
    let near = footprint_band(layout, anchor(), step, 0, 3, 0.0).expect("a band");
    let mean =
        |b: &SpriteBand| b.corners().iter().map(|c| c.0).sum::<f64>() / b.corners().len() as f64;
    assert!(mean(&far) < mean(&near), "the far cell is further left");
    assert!(
        near.corners().iter().all(|c| c.0 >= step.0 - 1e-9),
        "the near band keeps its own half tile: {:?}",
        near.corners()
    );
    let total: f64 = (0..3)
        .map(|k| area(&footprint_band(layout, anchor(), step, k, 3, 0.0).expect("a band")))
        .sum();
    assert!(
        (total - layout.width * layout.height).abs() < 1e-6,
        "{total}"
    );
}

/// A footprint longer than the drawing: the bands with nothing in them are nothing to draw.
#[test]
fn a_band_with_nothing_in_it_is_none() {
    let layout = SpriteLayout {
        x: -20.0,
        y: -20.0,
        width: 40.0,
        height: 40.0,
    };
    assert!(footprint_band(layout, anchor(), STEP_X, 5, 7, 0.0).is_none());
}

/// The bleed is in screen pixels, measured across the cut, and it only ever grows a band.
#[test]
fn the_bleed_overlaps_neighbouring_bands() {
    let layout = SpriteLayout {
        x: -40.0,
        y: -200.0,
        width: 160.0,
        height: 240.0,
    };
    let tight = band(layout, 1, 3);
    let loose = footprint_band(layout, anchor(), STEP_X, 1, 3, 0.5).expect("a band");
    let widened = area(&loose) - area(&tight);
    assert!(widened > 0.0, "the bleed must grow the band: {widened}");
    assert!(
        widened < layout.width * 2.0,
        "but only by a pixel: {widened}"
    );
}

fn sway_layout() -> SpriteLayout {
    SpriteLayout {
        x: 10.0,
        y: 20.0,
        width: 80.0,
        height: 160.0,
    }
}

#[test]
fn the_trunk_covers_exactly_the_bottom_of_the_drawing() {
    let layout = sway_layout();
    let trunk = sway_band(layout, CUT, 999.0, false).expect("a band");
    assert!((area(&trunk) - layout.width * layout.height * (1.0 - CUT)).abs() < 1e-9);
    let cut_y = layout.y + layout.height * CUT;
    for &(x, y) in trunk.corners() {
        assert!((y - cut_y).abs() < 1e-9 || (y - (layout.y + layout.height)).abs() < 1e-9);
        assert!(x >= layout.x - 1e-9 && x <= layout.x + layout.width + 1e-9);
    }
    for &(_, v) in trunk.uvs() {
        assert!((CUT..=1.0).contains(&v));
    }
}

#[test]
fn the_canopy_is_a_parallelogram_leaning_only_at_its_top() {
    let layout = sway_layout();
    let canopy = sway_band(layout, CUT, SHEAR, true).expect("a band");
    assert!((area(&canopy) - layout.width * layout.height * CUT).abs() < 1e-9);
    let cut_y = layout.y + layout.height * CUT;
    let corners = canopy.corners();
    let bottom: Vec<_> = corners
        .iter()
        .filter(|c| (c.1 - cut_y).abs() < 1e-9)
        .collect();
    assert_eq!(bottom.len(), 2, "the cut edge stays put");
    for corner in bottom {
        assert!(
            (corner.0 - layout.x).abs() < 1e-9
                || (corner.0 - (layout.x + layout.width)).abs() < 1e-9
        );
    }
    let top: Vec<_> = corners
        .iter()
        .filter(|c| (c.1 - layout.y).abs() < 1e-9)
        .collect();
    assert_eq!(top.len(), 2, "the top edge leans");
    for corner in top {
        assert!(
            (corner.0 - layout.x - SHEAR).abs() < 1e-9
                || (corner.0 - layout.x - layout.width - SHEAR).abs() < 1e-9
        );
    }
    for &(_, v) in canopy.uvs() {
        assert!((0.0..=CUT).contains(&v));
    }
}

#[test]
fn trunk_and_canopy_cover_the_drawing_once() {
    let layout = sway_layout();
    let trunk = sway_band(layout, CUT, 0.0, false).expect("trunk");
    let canopy = sway_band(layout, CUT, SHEAR, true).expect("canopy");
    assert!((area(&trunk) + area(&canopy) - layout.width * layout.height).abs() < 1e-6);
}

#[test]
fn a_cut_outside_the_drawing_splits_nothing() {
    let layout = sway_layout();
    for cut in [0.0, 1.0, -0.25, 1.5, f64::NAN] {
        assert_eq!(sway_band(layout, cut, SHEAR, true), None);
        assert_eq!(sway_band(layout, cut, 0.0, false), None);
    }
}

#[test]
fn the_canopy_leans_in_both_directions_by_the_shear_given() {
    let layout = sway_layout();
    let right = sway_band(layout, CUT, SHEAR, true).expect("canopy");
    let left = sway_band(layout, CUT, -SHEAR, true).expect("canopy");
    let mean = |band: &SpriteBand| {
        band.corners().iter().map(|c| c.0).sum::<f64>() / band.corners().len().max(1) as f64
    };
    assert!(
        (mean(&right) - mean(&left) - SHEAR).abs() < 1e-9,
        "only the top two corners move, so the mean shifts by exactly SHEAR"
    );
}
