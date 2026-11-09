use crate::grid::{WorldCoord, WorldRect};
use crate::paths::{PATH_STEPS, find_path};
use serde_json::Value;

const AREA: WorldRect = WorldRect {
    min_x: 0,
    min_y: 0,
    max_x: 4,
    max_y: 4,
};

fn point(x: i32, y: i32) -> WorldCoord {
    WorldCoord { x, y }
}

#[test]
fn keeps_neighbour_order_and_contract_tie_fixture() {
    assert_eq!(
        PATH_STEPS,
        [point(1, 0), point(0, 1), point(-1, 0), point(0, -1)]
    );
    let path = find_path(
        AREA,
        &[point(0, 0)],
        |p| p == point(1, 1),
        |_, _| 1.0,
        |_| 0.0,
    )
    .unwrap();
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/contracts.json"
    ))
    .unwrap();
    let expected: Vec<_> = fixture["path"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| {
            point(
                p["x"].as_i64().unwrap() as i32,
                p["y"].as_i64().unwrap() as i32,
            )
        })
        .collect();
    assert_eq!(path, expected);
}

#[test]
fn takes_cheaper_detour_and_stays_inside_area() {
    let path = find_path(
        AREA,
        &[point(0, 0)],
        |p| p == point(3, 0),
        |_, to| if to.y == 0 { 10.0 } else { 1.0 },
        |_| 0.0,
    )
    .unwrap();
    assert_eq!(path.first(), Some(&point(0, 0)));
    assert_eq!(path.last(), Some(&point(3, 0)));
    assert!(path[1..path.len() - 1].iter().all(|p| p.y == 1));
}

#[test]
fn handles_negative_coordinates_multiple_starts_and_blocked_steps() {
    let area = WorldRect {
        min_x: -3,
        min_y: -2,
        max_x: 1,
        max_y: 1,
    };
    let path = find_path(
        area,
        &[point(99, 0), point(-3, -2), point(0, 1)],
        |p| p == point(1, 1),
        |_, to| {
            if to == point(1, 0) {
                f64::INFINITY
            } else {
                1.0
            }
        },
        |_| 0.0,
    );
    assert_eq!(path, Some(vec![point(0, 1), point(1, 1)]));
    assert_eq!(
        find_path(
            area,
            &[point(0, 0)],
            |p| p == point(1, 1),
            |_, _| f64::INFINITY,
            |_| 0.0
        ),
        None
    );
    assert_eq!(
        find_path(
            area,
            &[point(0, 0)],
            |p| p == point(0, 0),
            |_, _| 1.0,
            |_| 0.0
        ),
        Some(vec![point(0, 0)])
    );
}
