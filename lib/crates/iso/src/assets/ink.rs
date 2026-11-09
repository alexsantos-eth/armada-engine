//! The bounding box of an asset's artwork, measured from its SVG source.

/// Width of one tile in the SVG's own units.
pub const SVG_TILE_WIDTH: f64 = 1024.0;

/// Screen position of the anchor cell's ground centre in the SVG's own units.
pub const SVG_ANCHOR: (f64, f64) = (512.0, 256.0);

/// Height of one block's body in the SVG's own units: how far one elevation step rises.
pub const SVG_BLOCK_HEIGHT: f64 = 341.0;

/// How far one cell along either axis moves *down* the screen, in tile widths: half a tile
const ROW: f64 = 0.25;

/// How far one cell along either axis moves *across* the screen, in tile widths.
const HALF_TILE: f64 = 0.5;

/// How far one elevation step rises on screen, for artwork drawn to this template.
pub fn elevation_step(tile_width: f64) -> f64 {
    tile_width * SVG_BLOCK_HEIGHT / SVG_TILE_WIDTH
}

/// The artwork's bounding box, in tile widths, relative to the anchor cell's ground centre.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct InkBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl InkBox {
    /// The box rounded to six decimals of a tile width, for writing into the manifest.
    pub fn rounded(self) -> Self {
        let place = |value: f64| (value * 1e6).round() / 1e6;
        Self {
            x: place(self.x),
            y: place(self.y),
            width: place(self.width),
            height: place(self.height),
        }
    }

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
pub fn asset_ink(svg: &str) -> Option<InkBox> {
    if svg.contains("transform=") || svg.contains("data-frames=") {
        return None;
    }
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
const SKIPPED: [&str; 2] = ["defs", "metadata"];

/// The text of every element that draws something: outside those containers, and not one of the
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
pub(super) fn attribute<'a>(text: &'a str, name: &str) -> Option<&'a str> {
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
