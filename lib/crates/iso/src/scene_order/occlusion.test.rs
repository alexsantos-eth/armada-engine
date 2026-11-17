use super::*;

fn area(x: f64, y: f64, width: f64, height: f64) -> SpriteLayout {
    SpriteLayout {
        x,
        y,
        width,
        height,
    }
}

fn key(depth: f64, layer: i32) -> DrawKey {
    DrawKey { depth, layer }
}

fn player() -> Occludee {
    Occludee {
        area: area(100.0, 100.0, 40.0, 80.0),
        key: key(-50.0, 1),
    }
}

#[test]
fn the_share_is_the_part_of_the_subject_the_other_rectangle_lies_over() {
    let subject = area(0.0, 0.0, 10.0, 20.0);

    assert_eq!(cover_share(subject, area(-5.0, -5.0, 50.0, 50.0)), 1.0);
    assert_eq!(cover_share(subject, area(5.0, 0.0, 50.0, 20.0)), 0.5);
    assert_eq!(cover_share(subject, area(5.0, 10.0, 50.0, 50.0)), 0.25);
    assert_eq!(cover_share(subject, area(10.0, 0.0, 5.0, 5.0)), 0.0);
    assert_eq!(cover_share(subject, area(40.0, 40.0, 5.0, 5.0)), 0.0);
}

#[test]
fn a_subject_without_area_is_never_covered() {
    assert_eq!(
        cover_share(area(0.0, 0.0, 0.0, 20.0), area(-5.0, -5.0, 50.0, 50.0)),
        0.0
    );
}

#[test]
fn a_sprite_drawn_after_the_player_and_lying_over_it_hides_it() {
    assert!(player().hidden_by(key(-40.0, 0), 0.6));
}

#[test]
fn a_sprite_drawn_before_the_player_hides_nothing_however_much_it_overlaps() {
    assert!(!player().hidden_by(key(-60.0, 0), 1.0));
}

#[test]
fn the_layer_decides_between_two_sprites_at_the_same_depth() {
    assert!(player().hidden_by(key(-50.0, 2), 1.0));
    assert!(!player().hidden_by(key(-50.0, 0), 1.0));
    assert!(!player().hidden_by(key(-50.0, 1), 1.0));
}

#[test]
fn a_sprite_that_only_grazes_the_player_does_not_hide_it() {
    let grazing = area(100.0, 170.0, 40.0, 40.0);
    let share = cover_share(player().area, grazing);
    assert!(share > 0.0 && share < OCCLUSION_MIN_COVER);

    assert!(!player().hidden_by(key(-40.0, 0), share));
    assert!(player().hidden_by(key(-40.0, 0), OCCLUSION_MIN_COVER));
}

#[test]
fn the_box_around_a_band_holds_every_corner() {
    let around = bounding_layout(&[(10.0, 5.0), (30.0, 5.0), (40.0, 60.0), (10.0, 50.0)]);

    assert_eq!(around, Some(area(10.0, 5.0, 30.0, 55.0)));
    assert_eq!(bounding_layout(&[]), None);
}

#[test]
fn something_that_never_hid_the_player_is_opaque_and_leaves_no_trace() {
    let mut fades = OcclusionFades::default();
    fades.begin(16.0);

    assert_eq!(fades.opacity("tree:1:1", false), 1.0);
    assert!(fades.is_idle());
}

#[test]
fn an_occluder_fades_down_over_the_fade_time_and_stays_there() {
    let mut fades = OcclusionFades::default();
    let mut seen = Vec::new();
    for _ in 0..4 {
        fades.begin(OCCLUSION_FADE_MS / 4.0);
        seen.push(fades.opacity("tree:1:1", true));
    }

    assert!(seen.windows(2).all(|pair| pair[1] < pair[0]));
    assert!(seen[0] < 1.0);
    assert_eq!(seen[3], OCCLUDER_OPACITY);

    fades.begin(50.0);
    assert_eq!(fades.opacity("tree:1:1", true), OCCLUDER_OPACITY);
}

#[test]
fn it_fades_back_as_slowly_once_the_player_is_clear_and_is_then_forgotten() {
    let mut fades = OcclusionFades::default();
    fades.begin(OCCLUSION_FADE_MS);
    fades.opacity("tree:1:1", true);

    fades.begin(OCCLUSION_FADE_MS / 2.0);
    let halfway = fades.opacity("tree:1:1", false);
    assert!(halfway > OCCLUDER_OPACITY && halfway < 1.0);
    assert!(!fades.is_idle());

    fades.begin(OCCLUSION_FADE_MS / 2.0);
    assert_eq!(fades.opacity("tree:1:1", false), 1.0);

    fades.begin(16.0);
    assert!(fades.is_idle());
}

#[test]
fn the_fade_eases_in_and_out_instead_of_moving_at_one_speed() {
    let mut fades = OcclusionFades::default();
    fades.begin(OCCLUSION_FADE_MS / 4.0);
    let first = 1.0 - fades.opacity("tree:1:1", true);
    fades.begin(OCCLUSION_FADE_MS / 4.0);
    let second = 1.0 - fades.opacity("tree:1:1", true) - first;

    assert!(second > first);
}

#[test]
fn each_occluder_keeps_its_own_fade() {
    let mut fades = OcclusionFades::default();
    fades.begin(OCCLUSION_FADE_MS);
    fades.opacity("tree:1:1", true);

    fades.begin(OCCLUSION_FADE_MS / 2.0);
    let old = fades.opacity("tree:1:1", true);
    let new = fades.opacity("house:4:2", true);

    assert_eq!(old, OCCLUDER_OPACITY);
    assert!(new > old && new < 1.0);
}

#[test]
fn an_occluder_that_left_the_scene_is_forgotten() {
    let mut fades = OcclusionFades::default();
    fades.begin(OCCLUSION_FADE_MS);
    fades.opacity("tree:1:1", true);

    fades.begin(16.0);
    fades.begin(16.0);

    assert!(fades.is_idle());
    assert_eq!(fades.opacity("tree:1:1", false), 1.0);
}

#[test]
fn a_frame_that_runs_backwards_or_stalls_moves_nothing() {
    let mut fades = OcclusionFades::default();
    fades.begin(-30.0);
    assert_eq!(fades.opacity("tree:1:1", true), 1.0);

    fades.begin(f64::NAN);
    assert_eq!(fades.opacity("tree:1:1", true), 1.0);
}

/// A frame 48 pixels square whose artwork is the triangle under its falling diagonal.
fn triangle() -> CoverMask {
    CoverMask::from_alpha(48, 48, |x, y| if y >= x { 255 } else { 0 })
}

#[test]
fn the_mask_follows_the_artwork_not_its_rectangle() {
    let mask = triangle();

    assert!(mask.solid_at(0.1, 0.9));
    assert!(!mask.solid_at(0.9, 0.1));
    assert!(!mask.solid_at(-0.1, 0.5));
    assert!(!mask.solid_at(0.5, 1.0));
}

#[test]
fn faint_pixels_do_not_make_a_cell_solid() {
    let mask = CoverMask::from_alpha(48, 48, |_, _| 90);

    assert!(!mask.solid_at(0.5, 0.5));
}

#[test]
fn a_frame_smaller_than_the_grid_gets_a_cell_per_pixel() {
    let mask = CoverMask::from_alpha(2, 1, |x, _| if x == 0 { 255 } else { 0 });

    assert!(mask.solid_at(0.25, 0.5));
    assert!(!mask.solid_at(0.75, 0.5));
}

#[test]
fn an_empty_frame_covers_nothing() {
    let mask = CoverMask::from_alpha(0, 0, |_, _| 255);
    let whole = area(0.0, 0.0, 10.0, 10.0);

    assert!(!mask.solid_at(0.5, 0.5));
    assert_eq!(mask.share_over(whole, whole, whole), 0.0);
}

#[test]
fn the_player_under_the_empty_corner_of_a_sprite_is_not_covered() {
    let mask = triangle();
    let sprite = area(0.0, 0.0, 240.0, 240.0);

    let in_the_corner = area(180.0, 10.0, 30.0, 50.0);
    let in_the_artwork = area(20.0, 170.0, 30.0, 50.0);

    assert_eq!(cover_share(in_the_corner, sprite), 1.0);
    assert_eq!(mask.share_over(in_the_corner, sprite, sprite), 0.0);
    assert_eq!(mask.share_over(in_the_artwork, sprite, sprite), 1.0);
}

#[test]
fn only_the_part_of_the_artwork_inside_the_band_counts() {
    let mask = CoverMask::from_alpha(48, 48, |_, _| 255);
    let sprite = area(0.0, 0.0, 240.0, 240.0);
    let subject = area(100.0, 100.0, 60.0, 50.0);

    assert_eq!(mask.share_over(subject, sprite, sprite), 1.0);
    assert_eq!(
        mask.share_over(subject, sprite, area(0.0, 0.0, 130.0, 240.0)),
        0.5
    );
    assert_eq!(
        mask.share_over(subject, sprite, area(200.0, 0.0, 40.0, 240.0)),
        0.0
    );
}
