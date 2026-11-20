//! Tests for the animated entities: what each one draws on its own, what it throws off and
//! when the geyser blows.

use super::*;

fn spot(kind: EntityEffect) -> EffectSpot {
    EffectSpot {
        kind,
        at: FireSpot {
            x: 4.5,
            y: 7.5,
            ground: 2.0,
        },
    }
}

fn run(emitters: &mut Emitters, from_ms: f64, seconds: f64, spots: &[EffectSpot]) -> f64 {
    let mut time = from_ms;
    for _ in 0..(seconds * 1000.0 / 16.0).ceil() as i32 {
        time += 16.0;
        emitters.update(16.0, time, spots);
    }
    time
}

fn count(emitters: &Emitters, kind: MoteKind) -> usize {
    emitters.motes.iter().filter(|m| m.kind == kind).count()
}

#[test]
fn nothing_in_view_throws_nothing() {
    let mut emitters = Emitters::new(5);
    run(&mut emitters, 0.0, 3.0, &[]);
    assert_eq!(emitters.live(), 0);
}

#[test]
fn a_torch_throws_sparks_and_smoke_and_a_brazier_only_sparks() {
    let mut torch = Emitters::new(5);
    run(&mut torch, 0.0, 3.0, &[spot(EntityEffect::Torch)]);
    assert!(count(&torch, MoteKind::Spark) > 0);
    assert!(count(&torch, MoteKind::Smoke) > 0);
    let mut brazier = Emitters::new(5);
    run(&mut brazier, 0.0, 3.0, &[spot(EntityEffect::Brazier)]);
    assert!(count(&brazier, MoteKind::Spark) > count(&torch, MoteKind::Spark));
    assert_eq!(count(&brazier, MoteKind::Smoke), 0);
}

#[test]
fn sparks_start_above_the_fire_on_the_post() {
    let mut emitters = Emitters::new(9);
    run(&mut emitters, 0.0, 0.5, &[spot(EntityEffect::Torch)]);
    assert!(emitters.motes.iter().all(|m| m.height > 2.0 + TORCH_CUP.2));
}

#[test]
fn the_geyser_is_quiet_most_of_its_cycle_and_bursts_at_the_end() {
    let quiet = (0..100)
        .map(|n| geyser_burst(n as f64 * GEYSER_CYCLE / 100.0, 0.0))
        .filter(|blow| *blow == 0.0)
        .count();
    assert!(quiet >= 70, "{quiet}");
    let peak = (0..1000)
        .map(|n| geyser_burst(n as f64 * GEYSER_CYCLE / 1000.0, 0.0))
        .fold(0.0, f64::max);
    assert!(peak > 0.95);
    assert!((0..200).all(|n| (0.0..=1.0).contains(&geyser_burst(n as f64 * 37.0, 0.4))));
}

#[test]
fn the_geyser_throws_water_only_while_it_blows() {
    let geyser = spot(EntityEffect::Geyser);
    let phase = spot_phase(&geyser.at);
    let quiet_start = -phase * GEYSER_CYCLE;
    let mut emitters = Emitters::new(2);
    run(&mut emitters, quiet_start, 2.5, &[geyser]);
    assert_eq!(count(&emitters, MoteKind::Drop), 0);
    assert!(count(&emitters, MoteKind::Steam) > 0);
    let burst_peak = quiet_start + GEYSER_CYCLE - GEYSER_BURST * 0.7;
    let mut emitters = Emitters::new(2);
    run(&mut emitters, burst_peak - 300.0, 0.3, &[geyser]);
    assert!(count(&emitters, MoteKind::Drop) > 5);
}

#[test]
fn drops_fall_back_and_vanish_at_the_mouth() {
    let geyser = spot(EntityEffect::Geyser);
    let start = -spot_phase(&geyser.at) * GEYSER_CYCLE + GEYSER_CYCLE - GEYSER_BURST * 0.7;
    let mut emitters = Emitters::new(2);
    let time = run(&mut emitters, start, 0.2, &[geyser]);
    run(&mut emitters, time, 1.6, &[]);
    assert_eq!(count(&emitters, MoteKind::Drop), 0);
}

#[test]
fn leaves_fall_from_the_canopy_and_rest_on_the_ground() {
    let leaves = spot(EntityEffect::Leaves);
    let mut emitters = Emitters::new(4);
    run(&mut emitters, 0.0, 1.5, &[leaves]);
    assert!(count(&emitters, MoteKind::Leaf) > 0);
    assert!(emitters.motes.iter().all(|m| m.height > 2.0 + 1.0));
    let mut emitters = Emitters::new(4);
    let time = run(&mut emitters, 0.0, 1.5, &[leaves]);
    run(&mut emitters, time, 7.5, &[]);
    assert!(emitters.motes.iter().all(|m| m.height >= 2.0));
    run(&mut emitters, time, 4.0, &[]);
    assert_eq!(emitters.live(), 0);
}

#[test]
fn the_bag_never_grows_past_its_cap() {
    let spots: Vec<EffectSpot> = (0..40).map(|_| spot(EntityEffect::Brazier)).collect();
    let mut emitters = Emitters::new(1);
    run(&mut emitters, 0.0, 4.0, &spots);
    assert!(emitters.live() <= MAX_MOTES);
}

#[test]
fn still_effects_throw_nothing_but_draw_their_parts() {
    for kind in [
        EntityEffect::Lantern,
        EntityEffect::Flies,
        EntityEffect::Candles,
    ] {
        let mut emitters = Emitters::new(3);
        run(&mut emitters, 0.0, 2.0, &[spot(kind)]);
        assert_eq!(emitters.live(), 0, "{kind:?}");
        assert!(!parts(&spot(kind), 500.0).is_empty(), "{kind:?}");
    }
    assert_eq!(
        parts(&spot(EntityEffect::Candles), 0.0).len(),
        2 * CANDLE_WICKS.len()
    );
    assert_eq!(parts(&spot(EntityEffect::Flies), 0.0).len(), FLIES);
}

#[test]
fn the_lantern_swings_but_keeps_hanging_under_its_hook() {
    let lantern = spot(EntityEffect::Lantern);
    let ys: Vec<f64> = (0..40)
        .map(|n| parts(&lantern, n as f64 * LANTERN_PERIOD / 40.0)[1].at.y)
        .collect();
    let (lo, hi) = ys
        .iter()
        .fold((f64::MAX, f64::MIN), |(lo, hi), y| (lo.min(*y), hi.max(*y)));
    assert!(hi - lo > 0.05, "{lo} {hi}");
    for n in 0..40 {
        for part in parts(&lantern, n as f64 * 113.0) {
            assert!(part.at.height < 2.0 + LANTERN_HOOK.2);
            assert!((part.at.x - (4.5 + LANTERN_HOOK.0)).abs() < 1e-9);
        }
    }
}

#[test]
fn the_flies_stay_over_their_spot() {
    let swarm = spot(EntityEffect::Flies);
    for n in 0..60 {
        for fly in parts(&swarm, n as f64 * 271.0) {
            assert!((fly.at.x - 4.5).abs() < 0.4);
            assert!((fly.at.y - 7.5).abs() < 0.4);
            assert!(fly.at.height > 2.0 && fly.at.height < 3.0);
        }
    }
}

#[test]
fn the_brazier_burns_wider_than_the_torch() {
    let width = |kind| {
        let xs: Vec<f64> = parts(&spot(kind), 800.0)
            .iter()
            .map(|p| p.at.x - p.at.y)
            .collect();
        xs.iter().cloned().fold(f64::MIN, f64::max) - xs.iter().cloned().fold(f64::MAX, f64::min)
    };
    assert!(width(EntityEffect::Brazier) > width(EntityEffect::Torch));
}
