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

#[test]
fn a_lattice_scaled_to_zero_lifts_every_corner_to_lit() {
    let lattice = ShadeLattice {
        columns: 1,
        rows: 1,
        light: vec![0.0, 0.25, 0.5, 0.75],
    };

    let faded = lattice.scaled(0.0);

    assert!(faded.light.iter().all(|&light| (light - 1.0).abs() < 1e-6));
    assert_eq!((faded.columns, faded.rows), (1, 1));
}

#[test]
fn a_lattice_scaled_to_one_keeps_its_darkness() {
    let light = vec![0.5, 0.25, 0.0, 0.75, 0.9, 0.1, 0.33, 0.66, 0.12];
    let lattice = ShadeLattice {
        columns: 2,
        rows: 2,
        light: light.clone(),
    };

    assert_eq!(lattice.scaled(1.0).light, light);
}

#[test]
fn a_half_scaled_lattice_halves_its_darkness() {
    let lattice = ShadeLattice {
        columns: 1,
        rows: 1,
        light: vec![0.5; 4],
    };

    let faded = lattice.scaled(0.5);

    assert!(faded.light.iter().all(|&light| (light - 0.75).abs() < 1e-6));
}

#[test]
fn artwork_key_drops_the_file_the_artwork_was_drawn_in() {
    // A repainted asset is a PNG beside the drawing it overrides, while `entities.json` goes
    // on naming the drawing. Both have to land on the same key or the entity draws nothing.
    assert_eq!(
        artwork_key("/assets/tree/block.png"),
        artwork_key("/assets/tree/block.svg")
    );
    assert_eq!(artwork_key("/assets/tree/block.svg"), "/assets/tree/block");
    // Names with their own dots keep everything but the last extension.
    assert_eq!(
        artwork_key("/assets/cloud/cloud-shadow.svg"),
        "/assets/cloud/cloud-shadow"
    );
    assert_eq!(artwork_key("/assets/a/b.c.png"), "/assets/a/b.c");
    // Nothing to drop: no extension at all, and a dotfile is a name, not an extension.
    assert_eq!(artwork_key("/assets/tree/block"), "/assets/tree/block");
    assert_eq!(artwork_key("/assets/.hidden"), "/assets/.hidden");
    assert_eq!(artwork_key("block.svg"), "block");
}
