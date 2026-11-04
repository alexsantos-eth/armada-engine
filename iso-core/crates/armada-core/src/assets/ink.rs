//! The bounding box of an asset's artwork, measured from its SVG source.
//!
//! The atlas packer trims every sprite to its opaque pixels before fitting it into a cell, so a
//! frame holds the *artwork*, not the two-diamond template the artwork was drawn inside. That
//! trim is what makes a frame impossible to place from the world alone: a tree's drawing stops
//! at the foot of its trunk, a boulder's a third of the way up the tile, and nothing in the
//! atlas says how far below the drawing the ground was. Placing such a frame as if it filled
//! its template stands the tree on the south corner of its tile and draws a small rock at the
//! size of a whole block.
//!
//! So the geometry the packer destroys is measured here, from the same SVG it rasterized, and
//! written into the manifest beside the frame. The assets are generated into one coordinate
//! system (`artifacts/iso_lib.py`): the anchor cell's ground centre is at `(512, 256)`, one
//! tile is 1024 units across and 512 down, and one elevation step is 341 units. Dividing by the
//! tile width turns that into a box the client can scale by its own tile width.
//!
//! **One correction is applied on the way out.** The generator draws for a camera on the
//! opposite corner to the engine's: `P(x, y, z)` there puts larger `x + y` *lower* on the
//! screen, while the projection puts it higher. Left and right agree, so a single tile is
//! unaffected, but a footprint of several tiles runs towards the viewer in the drawing and away
//! from the viewer in the world. A three-tile pier anchored at a cell would be drawn across the
//! two cells in front of it, where the ground sorts nearer than the pier and paints over it.
//! Moving the drawing one whole cell along the engine axis for each tile past the first — up the
//! screen, and sideways towards the axis the drawing does not run along — puts it exactly on the
//! cells the blueprint says it covers, which is where its collision is and where its depth key
//! sorts it. Lifting it only up the screen is not enough: the drawing then lies over the next
//! column of cells, and those sort after it on the `x` tie-break and paint over its near end. So the box this returns is in
//! the *engine's* axes: comparing it against the SVG, a multi-tile asset sits a row or more
//! lower there, and half a tile to one side.

/// Width of one tile in the SVG's own units.
pub const SVG_TILE_WIDTH: f64 = 1024.0;

/// Screen position of the anchor cell's ground centre in the SVG's own units.
pub const SVG_ANCHOR: (f64, f64) = (512.0, 256.0);

/// Height of one block's body in the SVG's own units: how far one elevation step rises.
pub const SVG_BLOCK_HEIGHT: f64 = 341.0;

/// How far one cell along either axis moves *down* the screen, in tile widths: half a tile
/// height, and a tile height is half a tile width.
const ROW: f64 = 0.25;

/// How far one cell along either axis moves *across* the screen, in tile widths.
const HALF_TILE: f64 = 0.5;

/// How far one elevation step rises on screen, for artwork drawn to this template.
///
/// The projection's own default (half a tile height) is shallower than the blocks are drawn,
/// which leaves every stacked block overlapping the one below it by a few percent.
pub fn elevation_step(tile_width: f64) -> f64 {
    tile_width * SVG_BLOCK_HEIGHT / SVG_TILE_WIDTH
}

/// The artwork's bounding box, in tile widths, relative to the anchor cell's ground centre.
///
/// `y` grows downwards, like screen coordinates: a box above the ground has a negative `y`.
/// Both axes are in tile *widths* because the artwork is drawn in 2:1 screen space, the same
/// space the projection uses, so one scale factor covers both.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct InkBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl InkBox {
    /// The same drawing scaled about the ground it stands on, so that it stays on its spot.
    pub fn scaled(self, by: f64) -> Self {
        Self {
            x: self.x * by,
            y: self.y * by,
            width: self.width * by,
            height: self.height * by,
        }
    }

}

/// Measures the artwork in `svg`, or `None` if it is not one asset drawn in the template.
///
/// Returns `None` for the sprite sheets (`data-frames`), for anything positioning its parts
/// with a `transform` (this reads coordinates straight out of the geometry, so a transform
/// would be ignored rather than applied) and for the multi-asset sheets, whose view box is
/// several tiles wide without declaring a footprint.
pub fn asset_ink(svg: &str) -> Option<InkBox> {
    if svg.contains("transform=") || svg.contains("data-frames=") {
        return None;
    }
    // The coordinates are absolute: the anchor cell's ground centre is at `SVG_ANCHOR` whatever
    // the view box, which only grows to hold the drawing (leftwards for a footprint along +y).
    // Its width is read solely to recognize the sheets that hold several assets side by side,
    // which declare no footprint and cannot be described by one box.
    let view_box = attribute(svg, "viewBox")?;
    let width = view_box
        .split_whitespace()
        .nth(2)
        .and_then(|w| w.parse::<f64>().ok())?;
    if !svg.contains("data-tiles=") && (width - SVG_TILE_WIDTH).abs() > 1.0 {
        return None;
    }

    let (mut min_x, mut min_y) = (f64::MAX, f64::MAX);
    let (mut max_x, mut max_y) = (f64::MIN, f64::MIN);
    for element in visible_elements(svg) {
        for name in ["d", "points"] {
            let Some(geometry) = attribute(element, name) else {
                continue;
            };
            for (px, py) in points(geometry) {
                min_x = min_x.min(px);
                min_y = min_y.min(py);
                max_x = max_x.max(px);
                max_y = max_y.max(py);
            }
        }
    }
    if min_x > max_x || min_y > max_y {
        return None;
    }
    // Move the drawing onto the cells the entity is said to occupy, which is one whole step
    // along the engine axis for each cell past the first: up the screen either way, and sideways
    // towards the axis the drawing does *not* run along.
    let (run, along_drawing_x) = footprint(svg);
    let steps = f64::from(run - 1);
    let sideways = if along_drawing_x { -steps } else { steps } * HALF_TILE;
    Some(InkBox {
        x: (min_x - SVG_ANCHOR.0) / SVG_TILE_WIDTH + sideways,
        y: (min_y - SVG_ANCHOR.1) / SVG_TILE_WIDTH - steps * ROW,
        width: (max_x - min_x) / SVG_TILE_WIDTH,
        height: (max_y - min_y) / SVG_TILE_WIDTH,
    })
}

/// The asset's declared footprint and height, `"3x1x5"`, if it has one.
pub fn data_tiles(svg: &str) -> Option<&str> {
    attribute(svg, "data-tiles")
}

/// How far the footprint runs from its anchor and along which of the *drawing's* axes, out of
/// `data-tiles` (`"3x1x5"` is three cells along the drawing's x, one across, five blocks tall).
/// One cell along x for anything that declares nothing, which needs no correction either way.
///
/// The drawing's axes are the engine's negated, so a run along the drawing's x is a footprint
/// along the engine's y and the other way round. The catalog already pairs them that way: the
/// `1x3` artwork belongs to the blueprint whose `axis` is `x`.
fn footprint(svg: &str) -> (i32, bool) {
    let Some(tiles) = attribute(svg, "data-tiles") else {
        return (1, true);
    };
    let mut counts = tiles.split('x').map(str::parse::<i32>);
    let along = counts.next().and_then(Result::ok).unwrap_or(1).max(1);
    let across = counts.next().and_then(Result::ok).unwrap_or(1).max(1);
    if along >= across {
        (along, true)
    } else {
        (across, false)
    }
}

/// Containers whose contents describe nothing that is drawn: filters and gradients, and the
/// provenance manifest a copy through some tools injects, whose payload is long enough to hold
/// anything that looks like a coordinate.
const SKIPPED: [&str; 2] = ["defs", "metadata"];

/// The text of every element that draws something: outside those containers, and not one of the
/// template's invisible bounds markers, which are full tile diamonds painted in nothing and are
/// exactly what the packer trimmed away.
fn visible_elements(svg: &str) -> impl Iterator<Item = &str> {
    let mut skipping = 0usize;
    svg.split('<').skip(1).filter_map(move |rest| {
        let element = rest.split_once('>').map(|(tag, _)| tag).unwrap_or(rest);
        let name = element.trim_start_matches('/');
        let name = name.split([' ', '\t', '\n', '>', '/']).next().unwrap_or("");
        if SKIPPED.contains(&name) {
            if element.starts_with('/') {
                skipping = skipping.saturating_sub(1);
            } else if !element.ends_with('/') {
                skipping += 1;
            }
            return None;
        }
        if skipping > 0 || element.contains("fill=\"transparent\"") {
            return None;
        }
        Some(element)
    })
}

/// The value of `name="..."` in `text`, matching the whole attribute name.
fn attribute<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let mut from = 0;
    while let Some(at) = text[from..].find(name) {
        let start = from + at;
        let before_is_boundary = start == 0
            || text[..start]
                .chars()
                .next_back()
                .is_some_and(|c| c.is_whitespace());
        let after = &text[start + name.len()..];
        if before_is_boundary && after.starts_with("=\"") {
            return after[2..].split('"').next();
        }
        from = start + name.len();
    }
    None
}

/// Every `x,y` pair in a path or polygon's geometry.
///
/// Path data is `M591.2,180.1 592.0,190.7 …`: a comma always separates one coordinate from the
/// next, and a command letter or a space ends the number before it.
fn points(geometry: &str) -> impl Iterator<Item = (f64, f64)> + '_ {
    geometry.match_indices(',').filter_map(move |(comma, _)| {
        let before = &geometry[..comma];
        let start = before
            .rfind(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-'))
            .map_or(0, |i| i + 1);
        let after = &geometry[comma + 1..];
        let end = after
            .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-'))
            .unwrap_or(after.len());
        Some((before[start..].parse().ok()?, after[..end].parse().ok()?))
    })
}

#[cfg(test)]
#[path = "ink.test.rs"]
mod tests;
