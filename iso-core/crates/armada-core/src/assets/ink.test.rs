use super::{InkBox, SVG_TILE_WIDTH, asset_ink, elevation_step};

/// One asset drawn in the template: a view box one tile wide, the invisible bounds diamonds the
/// generator always writes, and a figure that only covers part of the tile.
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
    // A box from a quarter to three quarters across the tile, from the ground up a little.
    let svg = asset(
        r##"<path fill="#8a8" stroke="none" d="M256.0,128.0 768.0,128.0 768.0,384.0 256.0,384.0 Z" />"##,
    );
    let ink = asset_ink(&svg).expect("measured");
    assert_eq!(
        ink,
        InkBox {
            // 256..768 across, which is a quarter either side of the anchor at 512.
            x: -0.25,
            width: 0.5,
            // 128..384 down, from an eighth above the anchor at 256 to an eighth below.
            y: -0.125,
            height: 0.25,
        },
        "the invisible bounds diamonds must not count towards the box"
    );
}

/// The whole point of measuring: a tall drawing standing on the ground reaches far above the
/// anchor and barely below it, so its box is nothing like the tile it stands on.
#[test]
fn a_tall_drawing_reaches_above_the_anchor() {
    let svg = asset(r##"<path fill="#333" d="M480.0,-480.0 544.0,-480.0 544.0,272.0 480.0,272.0 Z" />"##);
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
    let svg = asset(r##"<polygon fill="#8a8" points="512.0,0.0 1024.0,256.0 512.0,512.0 0.0,256.0" />"##);
    let ink = asset_ink(&svg).expect("measured");
    assert_eq!(ink.width, 1.0, "the full tile diamond");
    assert_eq!(ink.x, -0.5);
}

#[test]
fn negative_coordinates_parse() {
    let svg = asset(r##"<path fill="#333" d="M-20.5,-18.1 100.0,-18.1 100.0,0.0 -20.5,0.0 Z" />"##);
    let ink = asset_ink(&svg).expect("measured");
    assert!((ink.x - (-20.5 - 512.0) / SVG_TILE_WIDTH).abs() < 1e-9, "{}", ink.x);
}

/// A sprite sheet is many drawings in one file, laid out by transforms. One box cannot describe
/// it, so it is better to say nothing than to say something wrong: the client then falls back to
/// placing the frame by its anchor.
#[test]
fn sheets_and_transformed_drawings_are_not_measured() {
    let sheet = r##"<svg viewBox="0 0 3966 3528" data-frames="9" data-facings="east north">
      <g><path d="M10.0,10.0 20.0,20.0" /></g></svg>"##;
    assert_eq!(asset_ink(sheet), None, "a sheet");

    let transformed = r##"<svg viewBox="0 -341 1024 853">
      <g transform="translate(40,0)"><path d="M10.0,10.0 20.0,20.0" /></g></svg>"##;
    assert_eq!(asset_ink(transformed), None, "coordinates we would misread");

    let wide = r##"<svg viewBox="0 -341 3072 2559"><path d="M10.0,10.0 20.0,20.0" /></svg>"##;
    assert_eq!(asset_ink(wide), None, "several tiles wide without a footprint");
}

/// A footprint of more than one tile is exactly what `data-tiles` declares, and the box says
/// which way it runs: the drawing extends past the anchor tile on one side only.
#[test]
fn a_multi_tile_footprint_is_measured_from_its_anchor() {
    let svg = r##"<svg width="1536" height="853" viewBox="0 -341 1536 853" data-tiles="2x1">
      <path fill="transparent" d="M512.0,0.0 1024.0,256.0" opacity=".28" />
      <path fill="#8a8" d="M0.0,256.0 1536.0,256.0 1536.0,512.0 0.0,512.0 Z" /></svg>"##;
    let ink = asset_ink(svg).expect("measured");
    assert_eq!(ink.x, -0.5);
    assert_eq!(ink.width, 1.5, "a tile and a half across");
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
