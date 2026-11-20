use super::*;

#[test]
fn a_seed_written_into_the_systems_reads_back_unchanged() {
    for seed in [0, 1, 937_516_841, u64::MAX] {
        assert_eq!(saved_seed(&seed_systems(seed)), Some(seed));
    }
}

#[test]
fn the_seed_lives_under_its_own_versioned_part() {
    let systems = seed_systems(42);
    assert_eq!(systems[WORLD_PART]["version"], WORLD_PART_VERSION);
    assert_eq!(systems[WORLD_PART]["seed"], 42);
}

#[test]
fn a_save_without_a_seed_or_with_a_part_it_does_not_understand_has_none() {
    assert_eq!(saved_seed(&serde_json::json!({})), None);
    assert_eq!(
        saved_seed(&serde_json::json!({ "world": { "version": 9, "seed": 3 } })),
        None
    );
    assert_eq!(
        saved_seed(&serde_json::json!({ "world": { "version": 1, "seed": "3" } })),
        None
    );
    assert_eq!(saved_seed(&serde_json::json!({ "world": 3 })), None);
    assert_eq!(saved_seed(&serde_json::json!([])), None);
}

#[test]
fn a_fresh_seed_scrambles_its_entropy_so_close_inputs_land_far_apart() {
    let one = fresh_seed(1);
    let two = fresh_seed(2);
    assert_ne!(one, two);
    assert!((one ^ two).count_ones() > 16, "{one:x} {two:x}");
    assert_eq!(fresh_seed(7), fresh_seed(7));
}
