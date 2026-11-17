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

fn test_frame() -> SpriteFrame {
    SpriteFrame {
        x: 0,
        y: 0,
        width: 8,
        height: 8,
    }
}

fn test_layout() -> SpriteLayout {
    SpriteLayout {
        x: 0.0,
        y: 0.0,
        width: 8.0,
        height: 8.0,
    }
}

#[test]
fn a_sprite_is_queued_opaque_and_thins_out_when_made_see_through() {
    let key = scene_key(1.5, 1.5, 0.0, 2, 140.0);
    let whole = SpriteDraw::whole(key, 0, test_frame(), test_layout());
    assert!(matches!(whole.kind, DrawKind::Sprite { opacity, .. } if opacity == 1.0));

    let thinned = whole.see_through(0.4);
    assert!(matches!(thinned.kind, DrawKind::Sprite { opacity, .. } if opacity == 0.4));

    let shade = ShadeLattice::from_coverage(1, 1, vec![0.0; 4]);
    let shaded = SpriteDraw::shaded(key, 0, test_frame(), test_layout(), shade).see_through(0.7);
    assert!(matches!(shaded.kind, DrawKind::Shaded { opacity, .. } if opacity == 0.7));
}

#[test]
fn only_sprites_thin_out() {
    let key = scene_key(1.5, 1.5, 0.0, 2, 140.0);
    let corners = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
    let shadow = SpriteDraw::ground_shadow(key, corners, [(0.0, 0.0); 4], 0.5).see_through(0.4);

    assert!(matches!(shadow.kind, DrawKind::GroundShadow { opacity, .. } if opacity == 0.5));
}

#[test]
fn each_frame_gets_the_mask_of_its_own_pixels() {
    let (width, height) = (4u32, 2u32);
    let mut rgba = vec![0u8; (width * height * 4) as usize];
    for pixel in [0usize, 1, 4, 5] {
        rgba[pixel * 4 + 3] = 255;
    }
    let frame = |x| SpriteFrame {
        x,
        y: 0,
        width: 2,
        height: 2,
    };

    let masks = cover_masks(
        [("solid", frame(0)), ("empty", frame(2))].into_iter(),
        width,
        height,
        &rgba,
    );

    assert!(masks["solid"].solid_at(0.5, 0.5));
    assert!(!masks["empty"].solid_at(0.5, 0.5));
}

#[test]
fn a_frame_outside_the_image_or_an_image_cut_short_gets_no_mask() {
    let rgba = vec![255u8; 4 * 2 * 4];
    let outside = SpriteFrame {
        x: 3,
        y: 0,
        width: 2,
        height: 2,
    };

    assert!(cover_masks([("outside", outside)].into_iter(), 4, 2, &rgba).is_empty());
    assert!(cover_masks([("whole", test_frame())].into_iter(), 64, 64, &rgba).is_empty());
}
