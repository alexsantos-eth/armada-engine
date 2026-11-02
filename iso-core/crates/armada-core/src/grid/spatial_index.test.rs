use crate::grid::{SpatialIndex, SpatialIndexError, WorldCoord, WorldRect};

fn point(x: i32, y: i32) -> WorldCoord {
    WorldCoord { x, y }
}

#[test]
fn indexes_multicell_footprints_across_negative_chunk_boundary() {
    let mut index = SpatialIndex::new();
    index
        .insert("tree", &[point(-1, 0), point(0, 0), point(-1, 0)])
        .unwrap();
    index.insert("boat", &[point(0, 0), point(1, 0)]).unwrap();
    assert_eq!(index.len(), 2);
    assert_eq!(index.cells_of(&"tree"), &[point(-1, 0), point(0, 0)]);
    assert_eq!(index.at(point(0, 0)), &["tree", "boat"]);
    assert_eq!(index.query_radius(point(-1, 0), 1), vec![&"tree", &"boat"]);
    assert_eq!(
        index.query_rect(WorldRect {
            min_x: 0,
            min_y: 0,
            max_x: 0,
            max_y: 0
        }),
        vec![&"tree", &"boat"]
    );
    assert!(index.is_occupied(point(1, 0)));
    assert!(!index.is_occupied(point(2, 0)));
}

#[test]
fn move_and_remove_update_order_and_occupancy() {
    let mut index = SpatialIndex::new();
    index.insert(1, &[point(0, 0)]).unwrap();
    index.insert(2, &[point(0, 0)]).unwrap();
    assert_eq!(
        index.insert(1, &[point(3, 0)]),
        Err(SpatialIndexError::AlreadyIndexed)
    );
    index.move_item(1, &[point(0, 0), point(1, 0)]).unwrap();
    assert_eq!(index.at(point(0, 0)), &[2, 1]);
    assert_eq!(
        index.query_rect(WorldRect {
            min_x: 0,
            min_y: 0,
            max_x: 1,
            max_y: 0
        }),
        vec![&2, &1]
    );
    assert!(index.remove(&2));
    assert!(!index.remove(&2));
    assert_eq!(index.at(point(0, 0)), &[1]);
}

#[test]
fn invalid_footprint_does_not_partially_modify_index() {
    let mut index = SpatialIndex::new();
    index.insert(1, &[point(0, 0)]).unwrap();
    assert!(matches!(
        index.move_item(1, &[point(1, 0), point(i32::MAX, 0)]),
        Err(SpatialIndexError::CoordinateOutOfRange(_))
    ));
    assert_eq!(index.cells_of(&1), &[point(0, 0)]);
    assert!(matches!(
        index.insert(2, &[point(1, 0), point(i32::MAX, 0)]),
        Err(SpatialIndexError::CoordinateOutOfRange(_))
    ));
    assert!(!index.contains(&2));
}
