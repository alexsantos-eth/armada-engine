//! Tests for the wallet's part of a save.

use super::*;

#[test]
fn the_part_sits_beside_the_other_systems() {
    let written = with_wallet(crate::world::seed_systems(9), &Wallet::with(42));
    assert_eq!(crate::world::saved_seed(&written), Some(9));
    assert_eq!(written[ECONOMY_PART]["version"], ECONOMY_PART_VERSION);
}

#[test]
fn what_is_written_reads_back_the_same() {
    let written = with_wallet(serde_json::json!({}), &Wallet::with(1234));
    assert_eq!(saved_wallet(&written), Some(Wallet::with(1234)));
}

#[test]
fn a_save_without_the_part_or_of_another_version_has_no_wallet() {
    assert_eq!(saved_wallet(&serde_json::json!({})), None);
    let other = serde_json::json!({ ECONOMY_PART: { "version": 99, "coins": 5 } });
    assert_eq!(saved_wallet(&other), None);
}
