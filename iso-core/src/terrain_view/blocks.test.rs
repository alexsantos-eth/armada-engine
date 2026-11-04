use super::{MAX_EXPOSED_BLOCKS, exposed_floor};

#[test]
fn level_ground_draws_only_its_surface() {
    assert_eq!(exposed_floor(3, [Some(3), Some(3), Some(3)]), 3);
    assert_eq!(exposed_floor(3, [None, None, None]), 3);
}

/// The corner case: both columns in front are level, and only the one across the corner is
/// lower. The blocks are clay with rounded corners, so that corner is open and the
/// background showed through it until the diagonal counted here too.
#[test]
fn a_lower_column_across_the_corner_opens_the_stack() {
    assert_eq!(exposed_floor(3, [Some(3), Some(3), Some(1)]), 1);
}

#[test]
fn a_drop_is_only_ever_followed_down_so_far() {
    assert_eq!(
        exposed_floor(3, [Some(-40), Some(3), Some(3)]),
        3 - MAX_EXPOSED_BLOCKS
    );
}
