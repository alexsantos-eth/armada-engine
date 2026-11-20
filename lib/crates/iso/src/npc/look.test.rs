use super::*;
use crate::ai::basic::{SCALE_RANGE, TINTS};

const BASIC: NpcLogic = NpcLogic::Basic;

#[test]
fn a_character_always_looks_the_same() {
    for id in [0, 1, 77, u64::MAX] {
        assert_eq!(npc_look(BASIC, id), npc_look(BASIC, id));
    }
}

#[test]
fn every_look_is_a_tint_of_the_logic_at_a_size_within_its_range() {
    for id in 0..2_000 {
        let look = npc_look(BASIC, id);
        assert!(TINTS.contains(&look.tint));
        assert!(look.scale >= SCALE_RANGE.0 && look.scale <= SCALE_RANGE.1);
    }
}

#[test]
fn a_crowd_wears_every_tint_and_comes_in_every_size() {
    let looks: Vec<NpcLook> = (0..2_000).map(|id| npc_look(BASIC, id)).collect();
    for tint in TINTS {
        assert!(looks.iter().any(|look| look.tint == tint));
    }
    let (small, large) = SCALE_RANGE;
    let third = (large - small) / 3.0;
    assert!(looks.iter().any(|look| look.scale < small + third));
    assert!(looks.iter().any(|look| look.scale > large - third));
}

#[test]
fn neighbours_do_not_all_look_alike() {
    let first = npc_look(BASIC, 1_000);
    assert!((1_001..1_010).any(|id| npc_look(BASIC, id).tint != first.tint));
    assert!((1_001..1_010).any(|id| (npc_look(BASIC, id).scale - first.scale).abs() > 0.02));
}
