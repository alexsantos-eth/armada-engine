//! Tests for the campfire effects: the flicker of the flames, what the fire throws off and
//! how long it lasts.

use super::*;

fn spot() -> FireSpot {
    FireSpot {
        x: 4.5,
        y: 7.5,
        ground: 2.0,
    }
}

fn run(fire: &mut Fire, seconds: f64, spots: &[FireSpot]) {
    for _ in 0..(seconds * 1000.0 / 16.0).ceil() as i32 {
        fire.update(16.0, spots);
    }
}

#[test]
fn flames_flicker_with_time_but_repeat_for_the_same_instant() {
    assert_eq!(flames(1234.0, 0.3), flames(1234.0, 0.3));
    assert_ne!(flames(1234.0, 0.3), flames(1500.0, 0.3));
}

#[test]
fn two_fires_do_not_flicker_in_step() {
    assert_ne!(flames(800.0, 0.1), flames(800.0, 0.6));
}

#[test]
fn flames_taper_from_a_broad_base_to_a_yellow_tip() {
    for time in [0.0, 333.0, 1700.0, 4242.0] {
        let tongues = flames(time, 0.2);
        assert!(tongues.iter().all(|f| f.size > 0.0 && f.height >= 0.0));
        assert!(tongues[0].size > tongues[5].size);
        assert!(tongues[5].height > tongues[0].height);
        assert_eq!(tongues[5].colours[0], 0xffd84a);
    }
}

#[test]
fn an_empty_swarm_with_no_fire_stays_empty() {
    let mut fire = Fire::new(3);
    run(&mut fire, 3.0, &[]);
    assert_eq!(fire.live(), 0);
}

#[test]
fn a_burning_fire_throws_sparks_and_smoke_above_its_flames() {
    let mut fire = Fire::new(3);
    run(&mut fire, 2.0, &[spot()]);
    assert!(fire.live() > 0);
    assert!(fire.embers.iter().any(|e| e.kind == EmberKind::Spark));
    assert!(fire.embers.iter().any(|e| e.kind == EmberKind::Smoke));
    assert!(fire.embers.iter().all(|e| e.height >= 2.0 + FLAME_TOP));
}

#[test]
fn embers_die_once_the_fire_is_gone() {
    let mut fire = Fire::new(3);
    run(&mut fire, 2.0, &[spot()]);
    run(&mut fire, 5.0, &[]);
    assert_eq!(fire.live(), 0);
}

#[test]
fn the_swarm_never_exceeds_its_cap() {
    let spots = vec![spot(); 40];
    let mut fire = Fire::new(3);
    run(&mut fire, 6.0, &spots);
    assert!(fire.live() <= MAX_EMBERS);
}

#[test]
fn the_same_seed_throws_the_same_embers() {
    let (mut a, mut b) = (Fire::new(9), Fire::new(9));
    run(&mut a, 2.0, &[spot()]);
    run(&mut b, 2.0, &[spot()]);
    let heights = |f: &Fire| f.embers.iter().map(|e| e.height).collect::<Vec<_>>();
    assert_eq!(heights(&a), heights(&b));
}

#[test]
fn fade_is_zero_at_both_ends_and_full_in_the_middle() {
    assert_eq!(fade(0.0, 2000.0), 0.0);
    assert_eq!(fade(2000.0, 2000.0), 0.0);
    assert_eq!(fade(1000.0, 2000.0), 1.0);
}

#[test]
fn smoke_climbs_slower_than_sparks() {
    let climb = |kind| {
        let mut ember = Ember {
            kind,
            source: spot(),
            x: 0.0,
            y: 0.0,
            height: 0.0,
            vx: 0.0,
            vy: 0.0,
            age_ms: 0.0,
            life_ms: 2000.0,
            phase: 0.0,
        };
        rise(&mut ember, 1.0);
        ember.height
    };
    assert!(climb(EmberKind::Spark) > climb(EmberKind::Smoke));
}

#[test]
fn every_piece_of_a_fire_sorts_with_its_cell_however_far_it_drifts() {
    let projection = ProjectionConfig {
        tile_width: 128.0,
        tile_height: 64.0,
        elevation_step: None,
        origin_x: 0.0,
        origin_y: 0.0,
    };
    let key = sort_key(&spot(), projection);
    let mut far = spot();
    far.x += 0.6;
    far.y += 0.6;
    assert_ne!(key.depth, sort_key(&far, projection).depth);
    let mut fire = Fire::new(3);
    run(&mut fire, 3.0, &[spot()]);
    assert!(fire.embers.iter().all(|e| e.source == spot()));
}

#[test]
fn a_player_beside_the_fire_sorts_against_its_flames_as_against_its_sprite() {
    use iso::scene_order::compare_draw_keys;
    let projection = ProjectionConfig {
        tile_width: 128.0,
        tile_height: 64.0,
        elevation_step: None,
        origin_x: 0.0,
        origin_y: 0.0,
    };
    let fire = spot();
    let sprite = scene_key(fire.x, fire.y, fire.ground, ENTITY_LAYER, 64.0);
    let flames = sort_key(&fire, projection);
    for (dx, dy) in [
        (1.0, 0.0),
        (0.0, 1.0),
        (-1.0, 0.0),
        (0.0, -1.0),
        (1.0, 1.0),
        (-1.0, -1.0),
    ] {
        let player = scene_key(fire.x + dx, fire.y + dy, fire.ground, ENTITY_LAYER, 64.0);
        assert_eq!(
            compare_draw_keys(&player, &sprite),
            compare_draw_keys(&player, &flames),
            "player at ({dx}, {dy}) from the fire"
        );
    }
}

#[test]
fn flames_share_the_sprite_key_so_a_player_in_the_fire_cell_in_front_draws_over_them() {
    use crate::game::config::{PLAYER_BEHIND_LAYER, PLAYER_FRONT_LAYER};
    use iso::scene_order::compare_draw_keys;
    let projection = ProjectionConfig {
        tile_width: 128.0,
        tile_height: 64.0,
        elevation_step: None,
        origin_x: 0.0,
        origin_y: 0.0,
    };
    let fire = spot();
    let sprite = scene_key(fire.x, fire.y, fire.ground, ENTITY_LAYER, 64.0);
    let flames = sort_key(&fire, projection);
    assert_eq!(
        compare_draw_keys(&sprite, &flames),
        std::cmp::Ordering::Equal
    );
    for (layer, over) in [(PLAYER_FRONT_LAYER, true), (PLAYER_BEHIND_LAYER, false)] {
        let player = scene_key(fire.x, fire.y, fire.ground, layer, 64.0);
        assert_eq!(compare_draw_keys(&player, &flames).is_gt(), over);
    }
}
