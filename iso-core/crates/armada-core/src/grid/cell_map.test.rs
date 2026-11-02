use super::*;
use crate::grid::MAX_GRID_COORD;

fn point(x: i32, y: i32) -> WorldCoord {
    WorldCoord { x, y }
}

#[test]
fn stores_values_across_signed_chunk_edges() {
    let mut map = CellMap::new();
    for (index, cell) in [
        point(31, 0),
        point(32, 0),
        point(-1, 0),
        point(0, -1),
        point(-32, -33),
        point(MAX_GRID_COORD, -MAX_GRID_COORD),
    ]
    .into_iter()
    .enumerate()
    {
        assert_eq!(map.insert(cell, index).unwrap(), None);
        assert_eq!(map.get(cell).unwrap(), Some(&index));
    }
    assert_eq!(map.len(), 6);
    assert!(map.get(point(0, 0)).unwrap().is_none());
    assert!(map.get(point(MAX_GRID_COORD + 1, 0)).is_err());
}

#[test]
fn iterates_by_chunk_then_cell_in_insertion_order() {
    let mut map = CellMap::new();
    map.insert(point(2, 0), 1).unwrap();
    map.insert(point(35, 0), 2).unwrap();
    map.insert(point(3, 0), 3).unwrap();
    map.insert(point(2, 0), 4).unwrap();
    assert_eq!(map.values().copied().collect::<Vec<_>>(), vec![4, 3, 2]);
    assert_eq!(
        map.entries().map(|(p, _)| p).collect::<Vec<_>>(),
        vec![point(2, 0), point(3, 0), point(35, 0)]
    );
    assert_eq!(map.remove(point(2, 0)).unwrap(), Some(4));
    map.insert(point(2, 0), 5).unwrap();
    assert_eq!(map.values().copied().collect::<Vec<_>>(), vec![3, 5, 2]);
}

#[test]
fn forgets_empty_chunk_and_distinguishes_optional_value() {
    let mut map = CellMap::<Option<i32>>::new();
    map.insert(point(5, 5), None).unwrap();
    map.insert(point(40, 5), Some(2)).unwrap();
    assert!(map.contains(point(5, 5)).unwrap());
    assert_eq!(map.remove(point(5, 5)).unwrap(), Some(None));
    assert_eq!(map.buckets.len(), 1);
    assert!(!map.contains(point(5, 5)).unwrap());
    map.insert(point(6, 6), Some(3)).unwrap();
    assert_eq!(map.buckets.len(), 2);
    assert_eq!(
        map.values().cloned().collect::<Vec<_>>(),
        vec![Some(2), Some(3)]
    );
    assert_eq!(
        map.get_mut(point(6, 6)).unwrap().map(|v| {
            *v = Some(4);
            *v
        }),
        Some(Some(4))
    );
    assert_eq!(map.remove(point(7, 7)).unwrap(), None);
}
