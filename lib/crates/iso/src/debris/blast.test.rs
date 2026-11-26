//! Tests for the blast: where the pieces go, that it is repeatable, and that they land.

use super::*;
use crate::debris::parts::Part;

fn part(at: [f64; 3]) -> Part {
    Part {
        piece: "leaf_block".into(),
        at,
        sprite: "debris/p_0123456789".into(),
        shift: [0.0, 0.0],
    }
}

fn tree() -> EntityParts {
    EntityParts {
        tiles: [1, 1, 2],
        parts: vec![
            part([0.0, 0.0, 0.0]),
            part([-56.0, 0.0, 85.0]),
            part([56.0, 0.0, 85.0]),
            part([0.0, 56.0, 112.0]),
        ],
    }
}

#[test]
fn every_piece_is_thrown_and_the_same_blast_breaks_the_same_way() {
    let fragments = blast(&tree(), 7);
    assert_eq!(fragments.len(), 4);
    assert_eq!(fragments, blast(&tree(), 7));
    assert_ne!(fragments, blast(&tree(), 8));
    for (index, fragment) in fragments.iter().enumerate() {
        assert_eq!(fragment.part, index);
        assert!(fragment.velocity[2] >= DEBRIS_THROW.0);
    }
}

#[test]
fn pieces_fly_out_from_the_middle_of_the_entity() {
    let parts = tree();
    for seed in 0..20 {
        let fragments = blast(&parts, seed);
        // The model's y is the grid's -x, so the piece at y = +56 lies towards -x.
        let off = &fragments[3];
        assert!(off.start[0] < 0.0 && off.velocity[0] < 0.0, "seed {seed}");
        // The model's x is the grid's -y.
        assert!(fragments[1].velocity[1] > 0.0, "seed {seed}");
        assert!(fragments[2].velocity[1] < 0.0, "seed {seed}");
    }
}

#[test]
fn a_piece_standing_in_the_middle_goes_somewhere_too() {
    let fragments = blast(&tree(), 3);
    let speed = fragments[0].velocity[0].hypot(fragments[0].velocity[1]);
    assert!(speed >= DEBRIS_SPEED.0 - 1e-9);
}

#[test]
fn the_middle_of_a_long_entity_is_the_middle_of_its_volume() {
    let long = EntityParts {
        tiles: [2, 1, 2],
        parts: vec![part([64.0, 0.0, 0.0])],
    };
    // Its piece stands at the middle of the two tiles, so it goes any way instead of outwards.
    let fragment = blast(&long, 1)[0];
    assert!(fragment.velocity[0].hypot(fragment.velocity[1]) >= DEBRIS_SPEED.0 - 1e-9);
}

#[test]
fn a_piece_starts_where_it_stood_and_is_gone_at_the_end() {
    let fragment = blast(&tree(), 5)[1];
    let start = pose_at(&fragment, 0.0).unwrap();
    for axis in 0..3 {
        assert!((start.at[axis] - fragment.start[axis]).abs() < 1e-9);
    }
    assert_eq!((start.scale, start.alpha), (1.0, 1.0));
    assert!(pose_at(&fragment, -1.0).is_none());
    assert!(pose_at(&fragment, DEBRIS_MS).is_none());
}

#[test]
fn a_piece_rises_falls_and_never_sinks_under_the_ground() {
    for seed in 0..20 {
        for fragment in blast(&tree(), seed) {
            let mut peak: f64 = 0.0;
            let mut ms = 0.0;
            while ms < DEBRIS_MS {
                let pose = pose_at(&fragment, ms).unwrap();
                assert!(
                    pose.at[2] >= -1e-9,
                    "seed {seed} at {ms} ms: {}",
                    pose.at[2]
                );
                peak = peak.max(pose.at[2]);
                ms += 5.0;
            }
            assert!(peak > fragment.start[2], "it was thrown up");
            let (first, second) = flights(&fragment);
            assert!(
                first + second < DEBRIS_FADE_AT_MS / 1000.0,
                "it has landed before it fades"
            );
            let resting = pose_at(&fragment, DEBRIS_FADE_AT_MS).unwrap();
            assert!(resting.at[2].abs() < 1e-9);
        }
    }
}

#[test]
fn a_piece_lies_still_after_it_lands_and_fades_away() {
    let fragment = blast(&tree(), 2)[2];
    let a = pose_at(&fragment, DEBRIS_FADE_AT_MS + 100.0).unwrap();
    let b = pose_at(&fragment, DEBRIS_MS - 100.0).unwrap();
    assert_eq!(a.at, b.at);
    assert!(b.alpha < a.alpha && b.scale < a.scale);
    assert!(b.scale >= DEBRIS_MIN_SCALE);
}
