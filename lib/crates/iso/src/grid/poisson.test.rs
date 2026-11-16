use super::*;
use crate::grid::WorldRect;

fn scatter(step: i32, max_radius: f64) -> PoissonScatter {
    PoissonScatter::new(7, "test-scatter", step, max_radius)
}

fn area(side: i32) -> WorldRect {
    WorldRect {
        min_x: 0,
        min_y: 0,
        max_x: side,
        max_y: side,
    }
}

fn spread(side: i32, radius: f64) -> Vec<WorldCoord> {
    scatter(radius.floor().max(1.0) as i32, radius).samples_in(area(side), |_| Some(radius))
}

#[test]
fn a_scatter_drops_samples_across_the_area() {
    let samples = spread(60, 4.0);
    assert!(
        samples.len() > 20,
        "a 60 by 60 area with radius 4 grew only {} samples",
        samples.len()
    );
    for sample in &samples {
        assert!((0..=60).contains(&sample.x) && (0..=60).contains(&sample.y));
    }
}

#[test]
fn no_two_samples_stand_closer_than_the_radius() {
    let radius = 5.0;
    let samples = spread(60, radius);
    for (index, one) in samples.iter().enumerate() {
        for other in samples.iter().skip(index + 1) {
            let distance = f64::from(one.x - other.x).hypot(f64::from(one.y - other.y));
            assert!(
                distance >= radius,
                "{one:?} and {other:?} stand {distance} apart, closer than {radius}"
            );
        }
    }
}

#[test]
fn a_wider_radius_thins_the_scatter() {
    assert!(spread(60, 8.0).len() < spread(60, 3.0).len());
}

#[test]
fn the_same_seed_and_area_answer_the_same_scatter() {
    assert_eq!(spread(40, 4.0), spread(40, 4.0));
}

#[test]
fn another_seed_moves_the_scatter() {
    let here = PoissonScatter::new(1, "test-scatter", 4, 4.0).samples_in(area(40), |_| Some(4.0));
    let there = PoissonScatter::new(2, "test-scatter", 4, 4.0).samples_in(area(40), |_| Some(4.0));
    assert_ne!(here, there);
}

#[test]
fn a_sample_is_kept_or_dropped_whatever_area_was_asked_for() {
    let scatter = scatter(4, 4.0);
    let whole = scatter.samples_in(
        WorldRect {
            min_x: -30,
            min_y: -30,
            max_x: 30,
            max_y: 30,
        },
        |_| Some(4.0),
    );
    let mut halves = scatter.samples_in(
        WorldRect {
            min_x: -30,
            min_y: -30,
            max_x: 0,
            max_y: 30,
        },
        |_| Some(4.0),
    );
    halves.extend(scatter.samples_in(
        WorldRect {
            min_x: 1,
            min_y: -30,
            max_x: 30,
            max_y: 30,
        },
        |_| Some(4.0),
    ));
    halves.sort_by_key(|coord| (coord.x, coord.y));
    let mut whole_sorted = whole.clone();
    whole_sorted.sort_by_key(|coord| (coord.x, coord.y));
    assert_eq!(
        whole_sorted, halves,
        "the scatter of an area is not the scatter of its halves"
    );
}

#[test]
fn a_tighter_radius_near_a_point_clumps_the_samples_around_it() {
    let scatter = scatter(2, 9.0);
    let heart = WorldCoord { x: 30, y: 30 };
    let samples = scatter.samples_in(area(60), |at| {
        let distance = f64::from(at.x - heart.x).hypot(f64::from(at.y - heart.y));
        Some(if distance < 12.0 { 2.0 } else { 9.0 })
    });
    let near = samples
        .iter()
        .filter(|at| f64::from(at.x - heart.x).hypot(f64::from(at.y - heart.y)) < 12.0)
        .count();
    let area_near = std::f64::consts::PI * 12.0 * 12.0;
    let density_near = near as f64 / area_near;
    let density_all = samples.len() as f64 / (60.0 * 60.0);
    assert!(
        density_near > density_all * 2.0,
        "the tight radius did not clump: {density_near} against {density_all}"
    );
}

#[test]
fn a_refused_column_is_no_candidate_and_pushes_nobody_away() {
    let scatter = scatter(3, 30.0);
    let samples = scatter.samples_in(area(60), |at| if at.x < 30 { None } else { Some(3.0) });
    let left = samples.iter().filter(|at| at.x < 30).count();
    assert_eq!(left, 0, "a refused column grew a sample");
    assert!(
        samples.iter().filter(|at| at.x >= 30).count() > 20,
        "refusing half the area thinned the other half"
    );
}
