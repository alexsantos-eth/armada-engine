use iso::projection::{GridPoint, ProjectionConfig, project_block};

use super::*;

const PROJECTION: ProjectionConfig = ProjectionConfig {
    tile_width: 280.0,
    tile_height: 140.0,
    elevation_step: Some(70.0),
    origin_x: 400.0,
    origin_y: 300.0,
};

fn footprint(x: i32, y: i32, elevation: f64) -> ScreenQuad {
    let corner = |cx: i32, cy: i32| {
        let point = project_block(
            GridPoint {
                x: f64::from(cx),
                y: f64::from(cy),
            },
            elevation,
            PROJECTION,
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

fn same_points(a: &ScreenQuad, b: &ScreenQuad) -> bool {
    let key = |point: &(f64, f64)| (point.0.to_bits(), point.1.to_bits());
    let mut left: Vec<_> = a.iter().map(key).collect();
    let mut right: Vec<_> = b.iter().map(key).collect();
    left.sort_unstable();
    right.sort_unstable();
    left == right
}

fn point_in_quad(point: (f64, f64), quad: &ScreenQuad) -> bool {
    let centre = (
        quad.iter().map(|p| p.0).sum::<f64>() / 4.0,
        quad.iter().map(|p| p.1).sum::<f64>() / 4.0,
    );
    let side = |a: (f64, f64), b: (f64, f64), p: (f64, f64)| {
        (b.0 - a.0) * (p.1 - a.1) - (b.1 - a.1) * (p.0 - a.0)
    };
    (0..4).all(|i| {
        let (a, b) = (quad[i], quad[(i + 1) % 4]);
        let keep = side(a, b, centre);
        side(a, b, point) * keep >= -1e-6 * keep.abs()
    })
}

#[test]
fn the_ellipse_polygon_stays_within_its_radii() {
    let centre = ScreenPoint { x: 200.0, y: 150.0 };
    let polygon = ellipse_polygon(centre, 80.0, 30.0, 24);

    assert_eq!(polygon.len(), 24);
    for (x, y) in polygon {
        assert!((x - centre.x).abs() <= 40.0 + 1e-9);
        assert!((y - centre.y).abs() <= 15.0 + 1e-9);
    }
}

#[test]
fn clipping_a_subject_entirely_inside_keeps_it() {
    let diamond = footprint(3, 4, 2.0);
    let centroid = (
        diamond.iter().map(|p| p.0).sum::<f64>() / 4.0,
        diamond.iter().map(|p| p.1).sum::<f64>() / 4.0,
    );
    let subject = [
        (centroid.0 - 10.0, centroid.1),
        (centroid.0 + 10.0, centroid.1),
        (centroid.0, centroid.1 - 10.0),
    ];

    let clipped = clip_convex(&subject, &diamond);

    assert_eq!(clipped.len(), subject.len());
    for point in &clipped {
        assert!(point_in_quad(*point, &diamond));
    }
}

#[test]
fn clipping_a_subject_entirely_outside_drops_it() {
    let diamond = footprint(3, 4, 2.0);
    let centroid = (
        diamond.iter().map(|p| p.0).sum::<f64>() / 4.0,
        diamond.iter().map(|p| p.1).sum::<f64>() / 4.0,
    );
    let far_away = [
        (centroid.0 + 10_000.0, centroid.1),
        (centroid.0 + 10_100.0, centroid.1),
        (centroid.0 + 10_050.0, centroid.1 + 100.0),
    ];

    assert!(clip_convex(&far_away, &diamond).is_empty());
    assert!(clip_convex(&[], &diamond).is_empty());
}

#[test]
fn clipping_a_subject_crossing_the_edge_cuts_it_at_the_boundary() {
    let diamond = footprint(5, 5, 1.0);
    let near = diamond[2];
    let subject = [
        (near.0 - 300.0, near.1 + 200.0),
        (near.0 + 300.0, near.1 + 200.0),
        (near.0, near.1 - 100.0),
    ];

    let clipped = clip_convex(&subject, &diamond);

    assert!(!clipped.is_empty());
    for point in &clipped {
        assert!(point_in_quad(*point, &diamond));
    }
}

#[test]
fn clipping_does_not_depend_on_the_diamonds_winding() {
    let diamond = footprint(7, 2, 3.0);
    let mut reversed = diamond;
    reversed.reverse();
    let subject = [
        (diamond[0].0, diamond[0].1 + 500.0),
        (diamond[2].0 + 500.0, diamond[2].1 + 500.0),
        (diamond[2].0 - 500.0, diamond[2].1 - 100.0),
    ];

    let mut forward: Vec<_> = clip_convex(&subject, &diamond);
    let mut backward: Vec<_> = clip_convex(&subject, &reversed);
    let key = |point: &(f64, f64)| (point.0.to_bits(), point.1.to_bits());
    forward.sort_by_key(key);
    backward.sort_by_key(key);

    assert_eq!(forward.len(), backward.len());
    for (left, right) in forward.iter().zip(&backward) {
        assert!((left.0 - right.0).abs() < 1e-6 && (left.1 - right.1).abs() < 1e-6);
    }
}

fn outline(centre: ScreenPoint, width: f64, height: f64) -> Vec<(f64, f64)> {
    ellipse_polygon(centre, width, height, 32)
}

fn clip_convex(subject: &[(f64, f64)], clip: &ScreenQuad) -> Vec<(f64, f64)> {
    clip_convex_vertices(
        &subject
            .iter()
            .map(|point| (*point, 1.0_f32))
            .collect::<Vec<_>>(),
        clip,
    )
    .into_iter()
    .map(|(point, _)| point)
    .collect()
}

#[test]
fn the_clip_is_coplanar_with_a_fractional_shadow() {
    let cell = footprint(4, 4, 0.0);
    let whole = footprint(4, 4, 1.0);
    let mid = footprint(4, 4, 0.5);

    assert_eq!(mid[0].1, (cell[0].1 + whole[0].1) / 2.0);
}

#[test]
fn ground_diamonds_only_offers_the_cells_at_the_shadow_level() {
    let centre = project_block(GridPoint { x: 5.5, y: 5.5 }, 2.0, PROJECTION);
    let centre = ScreenPoint {
        x: centre.screen_x,
        y: centre.screen_y,
    };
    let elevation_at = |x: i32, y: i32| match (x, y) {
        (6, 5) => Some(3),
        _ => Some(2),
    };

    let outline = outline(centre, 400.0, 120.0);
    let diamonds = ground_diamonds(&outline, 2.0, PROJECTION, elevation_at);
    let cliff = footprint(6, 5, 2.0);

    assert!(!diamonds.is_empty());
    assert!(
        diamonds
            .iter()
            .any(|d| same_points(d, &footprint(5, 5, 2.0)))
    );
    assert!(!diamonds.iter().any(|d| same_points(d, &cliff)));
}

#[test]
fn ground_diamonds_projects_its_cells_at_the_shadows_own_height() {
    let centre = project_block(GridPoint { x: 5.5, y: 5.5 }, 2.25, PROJECTION);
    let centre = ScreenPoint {
        x: centre.screen_x,
        y: centre.screen_y,
    };
    let outline = outline(centre, 200.0, 80.0);
    let diamonds = ground_diamonds(&outline, 2.25, PROJECTION, |_, _| Some(2));

    assert!(!diamonds.is_empty());
    let mut grid_points = Vec::new();
    for x in 0..=12 {
        for y in 0..=12 {
            let point = project_block(
                GridPoint {
                    x: f64::from(x),
                    y: f64::from(y),
                },
                2.25,
                PROJECTION,
            );
            grid_points.push((point.screen_x, point.screen_y));
        }
    }
    for diamond in &diamonds {
        for corner in diamond {
            assert!(
                grid_points
                    .iter()
                    .any(|point| (point.0 - corner.0).abs() < 1e-9
                        && (point.1 - corner.1).abs() < 1e-9),
                "every corner lies on the plane at the shadow's fractional height"
            );
        }
    }
}

#[test]
fn an_ellipse_over_a_cliff_keeps_only_the_part_on_the_plateau() {
    let centre = project_block(GridPoint { x: 10.5, y: 10.5 }, 4.0, PROJECTION);
    let centre = ScreenPoint {
        x: centre.screen_x,
        y: centre.screen_y,
    };
    let elevation_at = |x: i32, _y: i32| (x <= 10).then_some(4);
    let outline = outline(centre, 300.0, 110.0);
    let diamonds = ground_diamonds(&outline, 4.0, PROJECTION, elevation_at);

    assert!(!diamonds.is_empty());
    let triangles = cast_pieces(
        centre,
        300.0,
        110.0,
        [[1.0, 0.0], [0.0, 1.0]],
        1.0,
        &diamonds,
        48,
    );

    assert!(!triangles.is_empty());
    for triangle in &triangles {
        for ((x, y), _) in triangle {
            let point = (*x, *y);
            assert!(
                diamonds.iter().any(|d| point_in_quad(point, d)),
                "a piece left the cells at the shadow level: ({}, {})",
                point.0,
                point.1
            );
        }
    }
}

#[test]
fn the_clip_of_an_ellipse_with_no_cells_has_no_pieces() {
    let centre = ScreenPoint { x: 100.0, y: 100.0 };
    let identity = [[1.0, 0.0], [0.0, 1.0]];

    assert!(cast_pieces(centre, 50.0, 20.0, identity, 1.0, &[], 24).len() >= 24);
    let outline = outline(centre, 50.0, 20.0);
    assert!(ground_diamonds(&outline, 4.0, PROJECTION, |_, _| None).is_empty());
}

#[test]
fn without_any_cell_the_fan_is_the_whole_ellipse() {
    let centre = ScreenPoint { x: 100.0, y: 100.0 };
    let identity = [[1.0, 0.0], [0.0, 1.0]];

    let triangles = cast_pieces(centre, 60.0, 24.0, identity, 1.0, &[], 16);

    assert_eq!(triangles.len(), 16);
    for triangle in &triangles {
        let centre_alpha = triangle
            .iter()
            .find(|((x, y), _)| (*x, *y) == (centre.x, centre.y))
            .map(|(_, a)| *a);
        assert_eq!(centre_alpha, Some(1.0));
    }
}

#[test]
fn the_fan_fades_from_the_centre_to_the_rim() {
    let centre = ScreenPoint { x: 100.0, y: 100.0 };
    let identity = [[1.0, 0.0], [0.0, 1.0]];

    let triangles = cast_pieces(centre, 60.0, 24.0, identity, 1.0, &[], 12);

    for triangle in &triangles {
        let rim_alpha = triangle
            .iter()
            .find(|((x, y), _)| (*x, *y) != (centre.x, centre.y))
            .map(|(_, a)| *a)
            .unwrap();
        assert_eq!(rim_alpha, 0.0);
    }
}

#[test]
fn the_shear_maps_the_rim_out_of_its_unsheared_boxes() {
    let centre = ScreenPoint { x: 200.0, y: 150.0 };
    let shear = [[1.0, 0.6], [0.0, 1.0]];

    let rim = sheared_ellipse(centre, 80.0, 30.0, shear, 24);

    for (x, y) in &rim {
        assert!((x - centre.x).abs() > 0.0 || (y - centre.y).abs() > 0.0);
    }
    let stretched = sheared_ellipse(centre, 80.0, 30.0, [[2.0, 0.0], [0.0, 1.0]], 24);
    let min_x = stretched.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
    let max_x = stretched
        .iter()
        .map(|p| p.0)
        .fold(f64::NEG_INFINITY, f64::max);
    assert!(
        (max_x - min_x - 160.0).abs() < 1e-9,
        "the shear doubles the widest reach"
    );
}

#[test]
fn the_pieces_keep_the_falloff_alpha_at_the_cut() {
    let diamond = footprint(5, 5, 4.0);
    let centre = project_block(GridPoint { x: 5.5, y: 5.5 }, 4.0, PROJECTION);
    let centre = ScreenPoint {
        x: centre.screen_x,
        y: centre.screen_y,
    };
    let identity = [[1.0, 0.0], [0.0, 1.0]];

    let triangles = cast_pieces(centre, 300.0, 300.0, identity, 1.0, &[diamond], 32);

    assert!(!triangles.is_empty());
    for triangle in &triangles {
        for ((_, _), alpha) in triangle {
            assert!(*alpha >= 0.0 && *alpha <= 1.0);
        }
    }
    let boundary_alphas: Vec<f32> = triangles
        .iter()
        .flat_map(|t| t.iter())
        .filter(|((x, y), _)| {
            let point = (*x, *y);
            (0..4).any(|i| {
                let (a, b) = (diamond[i], diamond[(i + 1) % 4]);
                let side = |a: (f64, f64), b: (f64, f64), p: (f64, f64)| {
                    (b.0 - a.0) * (p.1 - a.1) - (b.1 - a.1) * (p.0 - a.0)
                };
                side(a, b, point).abs() < 1e-6
            })
        })
        .map(|(_, a)| *a)
        .collect();
    assert!(
        boundary_alphas.iter().all(|a| *a >= 0.0 && *a <= 1.0),
        "interpolated boundary alphas stay in range"
    );
}

#[test]
fn the_falloff_alpha_interpolates_along_the_clip_edge() {
    let diamond = footprint(5, 5, 4.0);
    let centroid = (
        diamond.iter().map(|p| p.0).sum::<f64>() / 4.0,
        diamond.iter().map(|p| p.1).sum::<f64>() / 4.0,
    );
    let subject = [
        ((centroid.0 - 10.0, centroid.1 - 10.0), 1.0_f32),
        ((centroid.0 - 400.0, centroid.1 - 400.0), 0.0_f32),
        ((centroid.0 + 10.0, centroid.1 + 10.0), 0.0_f32),
    ];

    let clipped = clip_convex_vertices(&subject, &diamond);

    let cut = clipped
        .iter()
        .find(|((x, y), _)| {
            subject
                .iter()
                .all(|((sx, sy), _)| (*sx - *x).abs() > 1e-9 || (*sy - *y).abs() > 1e-9)
        })
        .expect("an edge-crossing vertex appears");
    assert!(
        cut.1 > 0.0 && cut.1 < 1.0,
        "the cut interpolates, got {}",
        cut.1
    );
}
