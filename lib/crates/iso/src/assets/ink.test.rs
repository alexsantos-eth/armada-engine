use super::{InkBox, SVG_TILE_WIDTH, asset_ink, elevation_step};

/// One asset drawn in the template: a view box one tile wide, the invisible bounds diamonds the
fn asset(figure: &str) -> String {
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="853" viewBox="0 -341 1024 853">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <path id="lower-shadow" fill="transparent" d="M512.0,0.0 1024.0,256.0 512.0,512.0 0.0,256.0 Z" opacity=".28" />
  <path id="upper-shadow" fill="transparent" d="M512.0,-341.0 1024.0,-85.0 512.0,171.0 0.0,-85.0 Z" opacity=".2" />
  <g id="figure">
    {figure}
  </g>
</svg>
"##
    )
}

#[test]
fn measures_the_artwork_and_not_the_template() {
    let svg = asset(
        r##"<path fill="#8a8" stroke="none" d="M256.0,128.0 768.0,128.0 768.0,384.0 256.0,384.0 Z" />"##,
    );
    let ink = asset_ink(&svg).expect("measured");
    assert_eq!(
        ink,
        InkBox {
            x: -0.25,
            width: 0.5,
            y: -0.125,
            height: 0.25,
        },
        "the invisible bounds diamonds must not count towards the box"
    );
}

/// The whole point of measuring: a tall drawing standing on the ground reaches far above the
#[test]
fn a_tall_drawing_reaches_above_the_anchor() {
    let svg =
        asset(r##"<path fill="#333" d="M480.0,-480.0 544.0,-480.0 544.0,272.0 480.0,272.0 Z" />"##);
    let ink = asset_ink(&svg).expect("measured");
    assert!(ink.y < -0.7, "top well above the ground: {}", ink.y);
    assert!(
        (ink.y + ink.height - 0.015625).abs() < 1e-9,
        "bottom just below the ground: {}",
        ink.y + ink.height
    );
}

#[test]
fn reads_polygons_as_well_as_paths() {
    let svg =
        asset(r##"<polygon fill="#8a8" points="512.0,0.0 1024.0,256.0 512.0,512.0 0.0,256.0" />"##);
    let ink = asset_ink(&svg).expect("measured");
    assert_eq!(ink.width, 1.0, "the full tile diamond");
    assert_eq!(ink.x, -0.5);
}

#[test]
fn negative_coordinates_parse() {
    let svg = asset(r##"<path fill="#333" d="M-20.5,-18.1 100.0,-18.1 100.0,0.0 -20.5,0.0 Z" />"##);
    let ink = asset_ink(&svg).expect("measured");
    assert!(
        (ink.x - (-20.5 - 512.0) / SVG_TILE_WIDTH).abs() < 1e-9,
        "{}",
        ink.x
    );
}

/// A sprite sheet is many drawings in one file, laid out by transforms. One box cannot describe
#[test]
fn sheets_and_transformed_drawings_are_not_measured() {
    let sheet = r##"<svg viewBox="0 0 3966 3528" data-frames="9" data-facings="east north">
      <g><path d="M10.0,10.0 20.0,20.0" /></g></svg>"##;
    assert_eq!(asset_ink(sheet), None, "a sheet");

    let transformed = r##"<svg viewBox="0 -341 1024 853">
      <g transform="translate(40,0)"><path d="M10.0,10.0 20.0,20.0" /></g></svg>"##;
    assert_eq!(asset_ink(transformed), None, "coordinates we would misread");

    let wide = r##"<svg viewBox="0 -341 3072 2559"><path d="M10.0,10.0 20.0,20.0" /></svg>"##;
    assert_eq!(
        asset_ink(wide),
        None,
        "several tiles wide without a footprint"
    );
}

/// A footprint of more than one tile is exactly what `data-tiles` declares, and the box says
#[test]
fn a_footprint_is_moved_onto_the_cells_it_covers() {
    let one = r##"<svg viewBox="0 -341 1024 853" data-tiles="1x1">
      <path fill="#8a8" d="M256.0,128.0 768.0,128.0 768.0,384.0 256.0,384.0 Z" /></svg>"##;
    let tiles = |t: &str| {
        asset_ink(&one.replace(r#"data-tiles="1x1""#, &format!(r#"data-tiles="{t}""#)))
            .expect("measured")
    };
    let (one_cell, along_x, along_y) = (tiles("1x1"), tiles("3x1x5"), tiles("1x3x5"));

    assert_eq!(along_x.y, one_cell.y - 0.5, "away from the viewer");
    assert_eq!(along_y.y, one_cell.y - 0.5, "whichever axis it runs along");
    assert_eq!(along_x.x, one_cell.x - 1.0);
    assert_eq!(along_y.x, one_cell.x + 1.0);
    assert_eq!(along_x.height, one_cell.height, "only moved, never resized");
    assert_eq!(along_x.width, one_cell.width);
}

#[test]
fn a_multi_tile_footprint_is_measured_from_its_anchor() {
    let svg = r##"<svg width="1536" height="853" viewBox="0 -341 1536 853" data-tiles="2x1">
      <path fill="transparent" d="M512.0,0.0 1024.0,256.0" opacity=".28" />
      <path fill="#8a8" d="M0.0,256.0 1536.0,256.0 1536.0,512.0 0.0,512.0 Z" /></svg>"##;
    let ink = asset_ink(svg).expect("measured");
    assert_eq!(ink.width, 1.5, "a tile and a half across");
    assert_eq!(ink.y, 0.0 - 0.25, "a two-cell run moves up one row");
    assert_eq!(
        ink.x,
        -0.5 - 0.5,
        "and half a tile across, onto its own footprint"
    );
}

#[test]
fn nothing_drawn_measures_to_nothing() {
    assert_eq!(asset_ink(&asset("")), None);
    assert_eq!(asset_ink("not an svg at all"), None);
}

/// The step has to match the body the blocks are drawn with, or a stack of them does not meet.
#[test]
fn the_elevation_step_matches_the_block_body() {
    assert!((elevation_step(1024.0) - 341.0).abs() < 1e-9);
    assert!((elevation_step(80.0) - 26.640625).abs() < 1e-9);
}

/// The manifest keeps six decimals of a tile width, which is a thousandth of a pixel on screen
#[test]
fn rounds_for_the_manifest() {
    let box_ = InkBox {
        x: -0.83564453125,
        y: -0.5279296875,
        width: 1.080859375,
        height: 0.64501953125,
    };
    assert_eq!(
        box_.rounded(),
        InkBox {
            x: -0.835645,
            y: -0.52793,
            width: 1.080859,
            height: 0.64502
        }
    );
    assert_eq!(
        box_.rounded().rounded(),
        box_.rounded(),
        "rounding again changes nothing"
    );
}
