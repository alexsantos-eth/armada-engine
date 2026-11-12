use super::*;
use crate::grid::WorldCoord;

fn cell(x: i32, y: i32) -> WorldCoord {
    WorldCoord { x, y }
}

#[test]
fn a_fresh_dressing_overrides_nothing() {
    let dressing = Dressing::default();
    assert!(dressing.is_empty());
    assert_eq!(dressing.tint(cell(0, 0)), None);
    assert_eq!(dressing.top(cell(0, 0)), None);
}

#[test]
fn a_tint_override_is_read_back_at_its_own_cell_only() {
    let mut dressing = Dressing::default();
    dressing.set_tint(cell(3, -4), Some(2));
    assert_eq!(dressing.tint(cell(3, -4)), Some(2));
    assert_eq!(dressing.tint(cell(3, -3)), None);
    assert!(!dressing.is_empty());
}

#[test]
fn a_top_override_tells_a_plain_block_from_a_grown_one() {
    let mut dressing = Dressing::default();
    dressing.set_top(cell(1, 1), Some(None));
    dressing.set_top(cell(2, 2), Some(Some(4)));
    assert_eq!(dressing.top(cell(1, 1)), Some(None));
    assert_eq!(dressing.top(cell(2, 2)), Some(Some(4)));
}

#[test]
fn setting_none_takes_an_override_back_off() {
    let mut dressing = Dressing::default();
    dressing.set_tint(cell(0, 0), Some(1));
    dressing.set_top(cell(0, 0), Some(Some(0)));
    dressing.set_tint(cell(0, 0), None);
    dressing.set_top(cell(0, 0), None);
    assert_eq!(dressing.tint(cell(0, 0)), None);
    assert_eq!(dressing.top(cell(0, 0)), None);
    assert!(dressing.is_empty());
}

#[test]
fn clearing_a_cell_drops_both_of_its_overrides() {
    let mut dressing = Dressing::default();
    dressing.set_tint(cell(5, 5), Some(1));
    dressing.set_top(cell(5, 5), Some(Some(2)));
    dressing.set_tint(cell(6, 5), Some(3));
    assert!(dressing.clear(cell(5, 5)));
    assert_eq!(dressing.tint(cell(5, 5)), None);
    assert_eq!(dressing.top(cell(5, 5)), None);
    assert_eq!(dressing.tint(cell(6, 5)), Some(3));
    assert!(!dressing.clear(cell(5, 5)));
}

#[test]
fn a_cell_outside_the_grid_is_answered_instead_of_panicking() {
    let mut dressing = Dressing::default();
    let far = cell(crate::grid::MAX_GRID_COORD + 10, 0);
    dressing.set_tint(far, Some(1));
    assert_eq!(dressing.tint(far), None);
    assert_eq!(dressing.top(far), None);
    assert!(!dressing.clear(far));
    assert!(dressing.is_empty());
}

#[test]
fn a_dressed_cell_is_one_entry_whatever_it_was_dressed_with() {
    let mut dressing = Dressing::default();
    dressing.set_tint(cell(1, 2), Some(1));
    dressing.set_top(cell(1, 2), Some(Some(3)));
    assert_eq!(dressing.tint(cell(1, 2)), Some(1));
    assert_eq!(dressing.top(cell(1, 2)), Some(Some(3)));
    dressing.set_tint(cell(1, 2), None);
    assert_eq!(dressing.top(cell(1, 2)), Some(Some(3)));
    dressing.set_top(cell(1, 2), None);
    assert!(dressing.is_empty());
}
