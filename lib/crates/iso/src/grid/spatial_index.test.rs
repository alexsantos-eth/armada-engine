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
    assert_eq!(
        index.at(point(0, 0)).copied().collect::<Vec<_>>(),
        vec!["tree", "boat"]
    );
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
    assert_eq!(
        index.at(point(0, 0)).copied().collect::<Vec<_>>(),
        vec![2, 1]
    );
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
    assert_eq!(index.at(point(0, 0)).copied().collect::<Vec<_>>(), vec![1]);
}

/// Items are found by hashing and then confirming by equality, so two items that hash alike must
#[test]
fn distinguishes_items_whose_hashes_collide() {
    #[derive(Clone, PartialEq, Eq, Debug)]
    struct Collides(u32);
    impl std::hash::Hash for Collides {
        fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
            0u8.hash(state);
        }
    }

    let mut index = SpatialIndex::new();
    index.insert(Collides(1), &[point(0, 0)]).unwrap();
    index.insert(Collides(2), &[point(1, 0)]).unwrap();
    assert!(index.contains(&Collides(1)));
    assert!(index.contains(&Collides(2)));
    assert!(!index.contains(&Collides(3)));
    assert_eq!(index.cells_of(&Collides(2)), &[point(1, 0)]);
    assert_eq!(
        index.insert(Collides(1), &[point(5, 5)]),
        Err(SpatialIndexError::AlreadyIndexed)
    );

    assert!(index.remove(&Collides(1)));
    assert!(!index.contains(&Collides(1)));
    assert!(index.contains(&Collides(2)));
    assert_eq!(index.cells_of(&Collides(2)), &[point(1, 0)]);
}

/// Removed slots are reclaimed once they outnumber the live items, and the survivors keep their
#[test]
fn reclaims_removed_slots_without_disturbing_the_survivors() {
    let mut index = SpatialIndex::new();
    for i in 0..60i32 {
        index.insert(i, &[point(i, 0)]).unwrap();
    }
    assert_eq!(index.len(), 60);

    for i in (1..60i32).step_by(2) {
        assert!(index.remove(&i));
    }
    assert_eq!(index.len(), 30);

    let survivors: Vec<i32> = index.items().copied().collect();
    assert_eq!(survivors, (0..60).step_by(2).collect::<Vec<i32>>());
    for i in (0..60i32).step_by(2) {
        assert!(index.contains(&i), "{i} went missing");
        assert_eq!(index.cells_of(&i), &[point(i, 0)]);
        assert!(index.is_occupied(point(i, 0)));
        assert_eq!(index.at(point(i, 0)).copied().collect::<Vec<_>>(), vec![i]);
    }
    for i in (1..60i32).step_by(2) {
        assert!(!index.is_occupied(point(i, 0)));
    }
    index.insert(1000, &[point(0, 0)]).unwrap();
    assert_eq!(
        index.at(point(0, 0)).copied().collect::<Vec<_>>(),
        vec![0, 1000]
    );
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
