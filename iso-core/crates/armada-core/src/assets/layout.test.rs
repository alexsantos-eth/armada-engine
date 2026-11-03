use super::{SpriteLayout, ink_layout};
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
