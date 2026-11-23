//! Tests for the levels of the beds of the world.

use super::*;

fn spot(x: f64, y: f64) -> FireSpot {
    FireSpot { x, y, ground: 0.0 }
}

fn effect(kind: EntityEffect, x: f64, y: f64) -> EffectSpot {
    EffectSpot {
        kind,
        at: spot(x, y),
    }
}

const HERE: GridPoint = GridPoint { x: 0.0, y: 0.0 };

#[test]
fn only_burning_things_crackle_and_bigger_fires_louder() {
    assert_eq!(fire_weight(None), Some(1.0));
    assert!(fire_weight(Some(EntityEffect::Brazier)) > fire_weight(Some(EntityEffect::Torch)));
    assert!(fire_weight(Some(EntityEffect::Torch)) > fire_weight(Some(EntityEffect::Lantern)));
    assert_eq!(fire_weight(Some(EntityEffect::Geyser)), None);
    assert_eq!(fire_weight(Some(EntityEffect::Flies)), None);
    assert_eq!(fire_weight(Some(EntityEffect::Leaves)), None);
}

#[test]
fn a_fire_is_louder_close_by_and_silent_far_off() {
    let close = fire_level(HERE, &[spot(1.0, 0.0)], &[]);
    let middle = fire_level(HERE, &[spot(6.0, 0.0)], &[]);
    let far = fire_level(HERE, &[spot(40.0, 0.0)], &[]);
    assert_eq!(close, 1.0);
    assert!(middle > 0.0 && middle < close);
    assert_eq!(far, 0.0);
    assert_eq!(fire_level(HERE, &[], &[]), 0.0);
}

#[test]
fn torches_count_as_fires_and_geysers_do_not() {
    let torch = fire_level(HERE, &[], &[effect(EntityEffect::Torch, 1.0, 0.0)]);
    assert!((torch - 0.6).abs() < 1e-12);
    assert_eq!(
        fire_level(HERE, &[], &[effect(EntityEffect::Geyser, 1.0, 0.0)]),
        0.0
    );
    let two = fire_level(
        HERE,
        &[],
        &[
            effect(EntityEffect::Torch, 1.0, 0.0),
            effect(EntityEffect::Torch, 0.0, 1.0),
        ],
    );
    assert!(two > torch && two <= 1.0);
}

#[test]
fn a_geyser_swells_with_its_burst_and_fades_with_distance() {
    let geyser = effect(EntityEffect::Geyser, 1.0, 0.0);
    let levels: Vec<f64> = (0..400)
        .map(|t| geyser_level_at(HERE, &[geyser], f64::from(t) * 20.0))
        .collect();
    let low = levels.iter().copied().fold(1.0, f64::min);
    let high = levels.iter().copied().fold(0.0, f64::max);
    assert!(low > 0.0, "it always steams");
    assert!(high > low * 2.0, "the burst is much louder");
    let far = effect(EntityEffect::Geyser, 30.0, 0.0);
    assert_eq!(geyser_level_at(HERE, &[far], 0.0), 0.0);
    assert_eq!(
        geyser_level_at(HERE, &[effect(EntityEffect::Torch, 1.0, 0.0)], 0.0),
        0.0
    );
}

#[test]
fn birds_need_trees_and_the_daylight() {
    let grove: Vec<GridPoint> = (0..8)
        .map(|i| GridPoint {
            x: f64::from(i % 3),
            y: f64::from(i / 3),
        })
        .collect();
    let lone = [GridPoint { x: 1.0, y: 0.0 }];
    assert_eq!(birds_level(HERE, &[], 1.0), 0.0);
    assert!(birds_level(HERE, &grove, 1.0) > birds_level(HERE, &lone, 1.0));
    assert_eq!(birds_level(HERE, &grove, 0.0), 0.0, "quiet at night");
    assert!(birds_level(HERE, &grove, 1.0) <= 1.0);
}
