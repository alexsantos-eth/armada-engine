//! Clipping of the player's ground shadow to the top faces of the ground at its level, so the
//! painted blob never spills onto the terrain's vertical faces. The blob is a soft fan — a core
//! vertex with the caster's own alpha fading to a transparent rim — sheared onto the screen by
//! the caller's `cast_matrix`; this module owns the fan's geometry and the top-face clip.

use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};

/// A convex piece of the screen: one cell's top face, or any quad the clip accepts. The corners
/// may arrive in any consistent order — the clip works out the inside from the quad's centre.
pub type ScreenQuad = [(f64, f64); 4];

/// A vertex of the soft fan: where it lands on screen and how visible it is (the radial falloff).
pub type ShadowVertex = ((f64, f64), f32);

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

/// The rim of the blob under `shear`: the unsheared ellipse mapped through the screen-space
/// anisotropy, so the long axis follows the phase's shadow direction.
pub fn sheared_ellipse(
    centre: ScreenPoint,
    width: f64,
    height: f64,
    shear: [[f64; 2]; 2],
    segments: usize,
) -> Vec<(f64, f64)> {
    ellipse_polygon(ScreenPoint { x: 0.0, y: 0.0 }, width, height, segments)
        .into_iter()
        .map(|(x, y)| {
            (
                centre.x + shear[0][0] * x + shear[0][1] * y,
                centre.y + shear[1][0] * x + shear[1][1] * y,
            )
        })
        .collect()
}

/// Clips the convex `subject` against the convex quad `clip`, keeping what lies inside it and
/// interpolating each vertex's alpha on the edges where the cut lands between two vertices.
pub fn clip_convex_vertices(subject: &[ShadowVertex], clip: &ScreenQuad) -> Vec<ShadowVertex> {
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
                side(a, b, current.0) * keep >= -1e-6 * keep.abs(),
                side(a, b, previous.0) * keep >= -1e-6 * keep.abs(),
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

/// The whole blob as triangles, clipped to the given top faces: the fan from the caster's own
/// alpha at the centre to a transparent rim, one piece per cell the fan overlaps. Cells never
/// overlap each other, so the pieces can be drawn in any order without darkening a seam twice.
/// With no cells to clip against (`diamonds` empty), the full unclipped fan is returned.
pub fn cast_pieces(
    centre: ScreenPoint,
    width: f64,
    height: f64,
    shear: [[f64; 2]; 2],
    alpha: f32,
    diamonds: &[ScreenQuad],
    segments: usize,
) -> Vec<[ShadowVertex; 3]> {
    let rim = sheared_ellipse(centre, width, height, shear, segments);
    let centre = (centre.x, centre.y);
    let segments = rim.len();
    let triangles = (0..segments).map(|index| {
        let next = (index + 1) % segments;
        [(centre, alpha), (rim[index], 0.0_f32), (rim[next], 0.0_f32)]
    });
    if diamonds.is_empty() {
        return triangles.collect();
    }
    let mut pieces = Vec::new();
    for diamond in diamonds {
        for triangle in triangles.clone() {
            let clipped = clip_convex_vertices(&triangle, diamond);
            for index in 1..clipped.len().saturating_sub(1) {
                pieces.push([clipped[0], clipped[index], clipped[index + 1]]);
            }
        }
    }
    pieces
}

/// The top faces of every cell whose footprint the blob could touch, given by `outline`, and
/// whose own top lies at the shadow's level, projected onto the plane at `elevation`: the cells
/// at the nearest whole level, so the clip stays anchored to the feet as the player steps.
pub fn ground_diamonds(
    outline: &[(f64, f64)],
    elevation: f64,
    projection: ProjectionConfig,
    elevation_at: impl Fn(i32, i32) -> Option<i32>,
) -> Vec<ScreenQuad> {
    let level = elevation.round();
    let (grid_min_x, grid_max_x) = bounds(outline.iter().map(|p| p.0));
    let (grid_min_y, grid_max_y) = bounds(outline.iter().map(|p| p.1));
    let to_grid = |sx: f64, sy: f64| {
        let step = projection
            .elevation_step
            .unwrap_or(projection.tile_height / 2.0);
        let across = (sx - projection.origin_x) / (projection.tile_width / 2.0);
        let depth = (projection.origin_y - elevation * step - sy) / (projection.tile_height / 2.0);
        ((depth + across) / 2.0, (depth - across) / 2.0)
    };
    let corners = [
        to_grid(grid_min_x, grid_min_y),
        to_grid(grid_max_x, grid_min_y),
        to_grid(grid_min_x, grid_max_y),
        to_grid(grid_max_x, grid_max_y),
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

fn bounds(values: impl Iterator<Item = f64>) -> (f64, f64) {
    values.fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), value| {
        (lo.min(value), hi.max(value))
    })
}

fn side(a: (f64, f64), b: (f64, f64), p: (f64, f64)) -> f64 {
    (b.0 - a.0) * (p.1 - a.1) - (b.1 - a.1) * (p.0 - a.0)
}

fn intersection(
    from: ShadowVertex,
    to: ShadowVertex,
    a: (f64, f64),
    b: (f64, f64),
) -> ShadowVertex {
    let start = side(a, b, from.0);
    let end = side(a, b, to.0);
    let t = start / (start - end);
    (
        (
            from.0.0 + (to.0.0 - from.0.0) * t,
            from.0.1 + (to.0.1 - from.0.1) * t,
        ),
        from.1 + (to.1 - from.1) * t as f32,
    )
}

#[cfg(test)]
#[path = "shadow_clip.test.rs"]
mod tests;
