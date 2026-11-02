use super::*;

#[test]
fn elevation_axis_and_layer_break_ties_in_that_order() {
    let depth = get_draw_depth(100.0, 1.0, 2.0, 20.0, 0, LengthAxis::X);
    assert!((depth - 100.0012).abs() < 1e-10);
    assert!(
        get_draw_depth(100.0, 0.0, 4.0, 20.0, 2, LengthAxis::Y)
            < get_draw_depth(100.0, 0.0, 4.0, 20.0, 2, LengthAxis::X)
    );
    assert_eq!(
        compare_draw_keys(&DrawKey { depth, layer: 0 }, &DrawKey { depth, layer: 3 }),
        Ordering::Less
    );
}
