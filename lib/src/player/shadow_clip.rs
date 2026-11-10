//! Clipping of the player's ground shadow to the top faces of the ground at its level, so the
//! painted ellipse never spills onto the terrain's vertical faces.

use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};

/// A convex piece of the screen: one cell's top face, or any quad the clip accepts. The corners
/// may arrive in any consistent order — the clip works out the inside from the quad's centre.
pub type ScreenQuad = [(f64, f64); 4];

/// The ellipse as a convex polygon of `segments` points, centred at `centre`, radii `width / 2`
/// by `height / 2`.
pub fn ellipse_polygon(
    centre: ScreenPoint,
    width: f64,
    height: f64,
    segments: usize,
) -> Vec<(f64, f64)> {
    let segments = segments.max(3);
    (0..segments)
        .map(|i| {
            let angle = i as f64 / segments as f64 * std::f64::consts::TAU;
            (
                centre.x + (width / 2.0) * angle.cos(),
                centre.y + (height / 2.0) * angle.sin(),
            )
        })
        .collect()
}

/// Clips the convex `subject` against the convex quad `clip`, keeping what lies inside it. The
/// result is a polygon with the same or fewer corners, or nothing when they do not overlap.
pub fn clip_convex(subject: &[(f64, f64)], clip: &ScreenQuad) -> Vec<(f64, f64)> {
    let centre = (
        clip.iter().map(|p| p.0).sum::<f64>() / clip.len() as f64,
        clip.iter().map(|p| p.1).sum::<f64>() / clip.len() as f64,
    );
    let mut output = subject.to_vec();
    for i in 0..clip.len() {
        let a = clip[i];
        let b = clip[(i + 1) % clip.len()];
        let keep = side(a, b, centre);
        if keep == 0.0 {
            continue;
        }
        let input = std::mem::take(&mut output);
        if input.is_empty() {
            break;
        }
        let mut next = Vec::with_capacity(input.len() + 1);
        for w in 0..input.len() {
            let current = input[w];
            let previous = input[(w + input.len() - 1) % input.len()];
            let (current_in, previous_in) = (
                side(a, b, current) * keep >= 0.0,
                side(a, b, previous) * keep >= 0.0,
            );
            if current_in != previous_in {
                next.push(intersection(previous, current, a, b));
            }
            if current_in {
                next.push(current);
            }
        }
        output = next;
    }
    output
}

/// Everything of the ellipse that falls inside the given top faces: one polygon per cell, in the
/// order of `diamonds`, with the pieces that do not overlap dropped. Cells never overlap each
/// other, so the pieces can be drawn in any order without darkening a seam twice.
pub fn clip_ellipse(
    centre: ScreenPoint,
    width: f64,
    height: f64,
    diamonds: &[ScreenQuad],
    segments: usize,
) -> Vec<Vec<(f64, f64)>> {
    let ellipse = ellipse_polygon(centre, width, height, segments);
    diamonds
        .iter()
        .map(|diamond| clip_convex(&ellipse, diamond))
        .filter(|piece| piece.len() >= 3)
        .collect()
}

/// The top faces of every cell whose footprint the ellipse could touch and whose own top lies at
/// the shadow's level, projected onto the plane at `elevation`: the cells at the nearest whole
/// level, so the clip stays anchored to the feet as the player steps between levels.
pub fn ground_diamonds(
    centre: ScreenPoint,
    width: f64,
    height: f64,
    elevation: f64,
    projection: ProjectionConfig,
    elevation_at: impl Fn(i32, i32) -> Option<i32>,
) -> Vec<ScreenQuad> {
    let level = elevation.round();
    let (min_x, min_y) = (centre.x - width / 2.0, centre.y - height / 2.0);
    let (max_x, max_y) = (centre.x + width / 2.0, centre.y + height / 2.0);
    let corners = [
        to_grid(min_x, min_y, elevation, &projection),
        to_grid(max_x, min_y, elevation, &projection),
        to_grid(min_x, max_y, elevation, &projection),
        to_grid(max_x, max_y, elevation, &projection),
    ];
    let (grid_min_x, grid_max_x) = bounds(corners.iter().map(|p| p.0));
    let (grid_min_y, grid_max_y) = bounds(corners.iter().map(|p| p.1));
    let mut diamonds = Vec::new();
    for x in
        (grid_min_x.floor() as i32).saturating_sub(1)..=(grid_max_x.ceil() as i32).saturating_add(1)
    {
        for y in (grid_min_y.floor() as i32).saturating_sub(1)
            ..=(grid_max_y.ceil() as i32).saturating_add(1)
        {
            if elevation_at(x, y).is_some_and(|column| f64::from(column) == level) {
                diamonds.push(footprint(x, y, elevation, &projection));
            }
        }
    }
    diamonds
}

fn footprint(x: i32, y: i32, elevation: f64, projection: &ProjectionConfig) -> ScreenQuad {
    let corner = |cx: i32, cy: i32| {
        let point = project_block(
            GridPoint {
                x: f64::from(cx),
                y: f64::from(cy),
            },
            elevation,
            *projection,
        );
        (point.screen_x, point.screen_y)
    };
    [
        corner(x + 1, y + 1),
        corner(x + 1, y),
        corner(x, y),
        corner(x, y + 1),
    ]
}

fn to_grid(sx: f64, sy: f64, elevation: f64, projection: &ProjectionConfig) -> (f64, f64) {
    let step = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    let across = (sx - projection.origin_x) / (projection.tile_width / 2.0);
    let depth = (projection.origin_y - elevation * step - sy) / (projection.tile_height / 2.0);
    ((depth + across) / 2.0, (depth - across) / 2.0)
}

fn bounds(values: impl Iterator<Item = f64>) -> (f64, f64) {
    values.fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), value| {
        (lo.min(value), hi.max(value))
    })
}

fn side(a: (f64, f64), b: (f64, f64), p: (f64, f64)) -> f64 {
    (b.0 - a.0) * (p.1 - a.1) - (b.1 - a.1) * (p.0 - a.0)
}

fn intersection(from: (f64, f64), to: (f64, f64), a: (f64, f64), b: (f64, f64)) -> (f64, f64) {
    let start = side(a, b, from);
    let end = side(a, b, to);
    let t = start / (start - end);
    (from.0 + (to.0 - from.0) * t, from.1 + (to.1 - from.1) * t)
}

#[cfg(test)]
#[path = "shadow_clip.test.rs"]
mod tests;
