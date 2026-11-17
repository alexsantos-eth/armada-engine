use super::*;

#[test]
fn a_character_always_looks_the_same() {
    for id in [0, 1, 77, u64::MAX] {
        assert_eq!(npc_look(id), npc_look(id));
    }
}

#[test]
fn every_look_is_a_coat_of_the_palette_at_a_size_within_the_range() {
    for id in 0..2_000 {
        let look = npc_look(id);
        assert!(NPC_TINTS.contains(&look.tint));
        assert!(look.scale >= NPC_SCALE_RANGE.0 && look.scale <= NPC_SCALE_RANGE.1);
    }
}

#[test]
fn a_crowd_wears_every_coat_and_comes_in_every_size() {
    let looks: Vec<NpcLook> = (0..2_000).map(npc_look).collect();
    for tint in NPC_TINTS {
        assert!(looks.iter().any(|look| look.tint == tint));
    }
    let (small, large) = NPC_SCALE_RANGE;
    let third = (large - small) / 3.0;
    assert!(looks.iter().any(|look| look.scale < small + third));
    assert!(looks.iter().any(|look| look.scale > large - third));
}

#[test]
fn neighbours_do_not_all_look_alike() {
    let first = npc_look(1_000);
    assert!((1_001..1_010).any(|id| npc_look(id).tint != first.tint));
    assert!((1_001..1_010).any(|id| (npc_look(id).scale - first.scale).abs() > 0.02));
}
