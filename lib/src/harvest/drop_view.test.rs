//! Tests for how a heap on the ground is shown: tossed out of what dropped it, then bobbing.

use super::*;

fn drop_at(id: u64) -> Drop {
    Drop {
        id,
        item: "wood".into(),
        amount: 3,
        at: GridPoint { x: 4.3, y: 7.0 },
        elevation: 2.0,
        from_elevation: 2.0,
        from: GridPoint { x: 4.0, y: 7.0 },
        wait: 0,
        piece: iso::drops::DropPiece {
            sprite: "debris/p_test".into(),
            shift: [0.0, 0.0],
        },
    }
}

#[test]
fn a_new_piece_flies_from_what_dropped_it_to_where_it_lands() {
    let drop = drop_at(1);
    let start = toss(0.0, &drop);
    assert_eq!(start.at, drop.from);
    assert_eq!(start.lift, 0.0);
    let middle = toss(TOSS_MS / 2.0, &drop);
    assert!(middle.at.x > drop.from.x && middle.at.x < drop.at.x);
    assert!((middle.lift - (TOSS_HEIGHT + PIECE_HOVER / 2.0)).abs() < 1e-9);
    let landed = toss(TOSS_MS, &drop);
    assert_eq!(landed.at, drop.at);
}

#[test]
fn a_landed_piece_bobs_a_little_and_never_sinks() {
    let drop = drop_at(1);
    let lifts: Vec<f64> = (0..40)
        .map(|step| toss(TOSS_MS + f64::from(step) * 50.0, &drop).lift)
        .collect();
    assert!(
        lifts
            .iter()
            .all(|lift| (PIECE_HOVER..=PIECE_HOVER + BOB_LIFT + 1e-9).contains(lift))
    );
    assert!(
        lifts
            .iter()
            .any(|lift| *lift > PIECE_HOVER + BOB_LIFT * 0.5)
    );
}

#[test]
fn heaps_already_there_at_the_start_do_not_fly_in() {
    let mut views = DropViews::landed(&[drop_at(1)]);
    views.advance(16.0, &[drop_at(1), drop_at(2)]);
    assert!(views.age(1) >= TOSS_MS);
    assert!(views.age(2) < TOSS_MS);
    views.advance(16.0, &[drop_at(2)]);
    assert_eq!(views.age(1), 0.0, "a heap picked up is forgotten");
}

#[test]
fn a_heap_is_counted_once_when_its_toss_ends() {
    let mut views = DropViews::landed(&[drop_at(1)]);
    assert_eq!(
        views.advance(16.0, &[drop_at(1)]),
        0,
        "already on the ground"
    );
    assert_eq!(views.advance(16.0, &[drop_at(1), drop_at(2)]), 0);
    let mut landings = 0;
    for _ in 0..40 {
        landings += views.advance(16.0, &[drop_at(1), drop_at(2), drop_at(3)]);
    }
    assert_eq!(landings, 2, "heaps 2 and 3 land once each");
}
