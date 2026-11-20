//! The world seed a save carries, so a world started from a fresh seed reopens as itself.

/// The key of the world's part inside a save's `systems`.
pub const WORLD_PART: &str = "world";
/// The version of the world part this engine writes and reads.
pub const WORLD_PART_VERSION: u32 = 1;

/// The `systems` object of a save that records `seed` as the world's seed.
pub fn seed_systems(seed: u64) -> serde_json::Value {
    serde_json::json!({
        WORLD_PART: { "version": WORLD_PART_VERSION, "seed": seed }
    })
}

/// The world seed recorded in a save's `systems`, or `None` when the save predates it or
/// carries a part this engine does not understand.
pub fn saved_seed(systems: &serde_json::Value) -> Option<u64> {
    let part = systems.get(WORLD_PART)?;
    if part.get("version")?.as_u64()? != u64::from(WORLD_PART_VERSION) {
        return None;
    }
    part.get("seed")?.as_u64()
}

/// A world seed drawn from `entropy` the platform supplies (a clock, a random source), mixed so
/// that close inputs give unrelated worlds. Pure: the same entropy always gives the same seed.
pub fn fresh_seed(entropy: u64) -> u64 {
    let mut value = entropy.wrapping_add(0x9e37_79b9_7f4a_7c15);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

#[cfg(test)]
#[path = "seed.test.rs"]
mod tests;
