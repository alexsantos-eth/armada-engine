use super::*;

#[test]
fn terrain_key_is_one_half_tile_behind_a_standing_sprite() {
    let standing = scene_key(4.5, 7.5, 2.0, 3, 140.0);
    let ground = ground_key(4.5, 7.5, 2.0, 3, 140.0);

    assert_eq!(ground.layer, standing.layer);
    assert_eq!(ground.depth, standing.depth - 70.0);
}

#[test]
fn scene_key_orders_a_higher_layer_after_the_same_world_position() {
    let lower = scene_key(2.5, 2.5, 1.0, 2, 140.0);
    let higher = scene_key(2.5, 2.5, 1.0, 3, 140.0);

    assert_eq!(compare_draw_keys(&lower, &higher), std::cmp::Ordering::Less);
}
