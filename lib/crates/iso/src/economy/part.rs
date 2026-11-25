//! The wallet's part of a save's `systems`, versioned on its own.

use crate::economy::Wallet;

/// The key of the wallet's part inside a save's `systems`.
pub const ECONOMY_PART: &str = "economy";
/// The version of the economy part this engine writes and reads.
pub const ECONOMY_PART_VERSION: u32 = 1;

#[derive(serde::Serialize, serde::Deserialize)]
struct RawPart {
    version: u32,
    coins: u64,
}

/// `systems` with the wallet written into it; other parts are kept as they are.
pub fn with_wallet(mut systems: serde_json::Value, wallet: &Wallet) -> serde_json::Value {
    let part = RawPart {
        version: ECONOMY_PART_VERSION,
        coins: wallet.coins(),
    };
    let value = serde_json::to_value(part).unwrap_or(serde_json::Value::Null);
    if let Some(object) = systems.as_object_mut() {
        object.insert(ECONOMY_PART.to_owned(), value);
        return systems;
    }
    serde_json::json!({ ECONOMY_PART: value })
}

/// The wallet a save's `systems` records, or `None` when the save predates the part or carries
/// a version this engine does not read.
pub fn saved_wallet(systems: &serde_json::Value) -> Option<Wallet> {
    let part: RawPart = serde_json::from_value(systems.get(ECONOMY_PART)?.clone()).ok()?;
    (part.version == ECONOMY_PART_VERSION).then(|| Wallet::with(part.coins))
}

#[cfg(test)]
#[path = "part.test.rs"]
mod tests;
