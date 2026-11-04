//! Save and load for the Macroquad client.
//!
//! On native targets the save file lives next to the executable. On WebAssembly the file
//! system is unavailable, so the save persists in `window.localStorage` under the same key.

use armada_core::world::{ChunkArchive, WorldSave, parse_world_save};
use armada_core::world::ChunkManager;

const SAVE_PATH: &str = "armada_save.json";

/// Reads a JSON string from `window.localStorage` on WASM.
#[cfg(target_arch = "wasm32")]
fn local_storage_get(key: &str) -> Option<String> {
    web_sys::window()
        .and_then(|win| win.local_storage().ok().flatten())
        .and_then(|store| store.get_item(key).ok().flatten())
}

/// Writes a JSON string to `window.localStorage` on WASM.
#[cfg(target_arch = "wasm32")]
fn local_storage_set(key: &str, value: &str) -> bool {
    web_sys::window()
        .and_then(|win| win.local_storage().ok().flatten())
        .map(|store| store.set_item(key, value).is_ok())
        .unwrap_or(false)
}

/// Removes a key from `window.localStorage` on WASM.
#[cfg(target_arch = "wasm32")]
fn local_storage_remove(key: &str) -> bool {
    web_sys::window()
        .and_then(|win| win.local_storage().ok().flatten())
        .map(|store| store.remove_item(key).is_ok())
        .unwrap_or(false)
}

/// Tries to load a save file from disk. Returns `None` on any error or when running on WASM.
pub async fn load_save() -> Option<WorldSave> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let contents = std::fs::read_to_string(SAVE_PATH).ok()?;
        let json: serde_json::Value = serde_json::from_str(&contents).ok()?;
        parse_world_save(json).ok()
    }
    #[cfg(target_arch = "wasm32")]
    {
        let contents = local_storage_get(SAVE_PATH)?;
        let json: serde_json::Value = serde_json::from_str(&contents).ok()?;
        parse_world_save(json).ok()
    }
}

/// Restores a `ChunkArchive` from a parsed save, or returns an empty archive.
pub fn restore_archive(save: Option<WorldSave>) -> ChunkArchive {
    match save {
        Some(s) => ChunkArchive::restore(&s),
        None => ChunkArchive::new(),
    }
}

/// Persists the archive to disk. No-op on WASM.
pub fn save_archive(archive: &ChunkArchive) {
    let save = archive.snapshot(
        serde_json::json!({}),
        serde_json::json!({}),
    );
    // Compact, not pretty: nobody reads a save by hand, and the indentation was 60% of the file
    // (16.6 MB vs 6.6 MB for 25 chunks). Serializing it is pure main-thread time.
    let json = match serde_json::to_string(&save) {
        Ok(j) => j,
        Err(_) => return,
    };
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = std::fs::write(SAVE_PATH, json.as_bytes());
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = local_storage_set(SAVE_PATH, &json);
    }
}

/// Syncs discovered chunks from a `ChunkManager` into a `ChunkArchive`, replacing any
/// previously stored copy of the same chunk.
pub fn sync_manager_to_archive(manager: &ChunkManager, archive: &mut ChunkArchive) {
    for saved in manager.save_all() {
        archive.put(saved);
    }
}

/// Loads saved chunks from an archive into a `ChunkManager`, bypassing terrain generation.
///
/// Returns the blueprint ids the archive referred to but the catalog does not define.
pub fn load_archive_into_manager(
    manager: &mut ChunkManager,
    archive: &ChunkArchive,
) -> Vec<String> {
    // Reconstruct a WorldSave from the archive to feed load_from_save.
    let save = archive.snapshot(
        serde_json::json!({}),
        serde_json::json!({}),
    );
    manager.load_from_save(&save)
}

/// Replaces freshly generated chunks with their archived copy, where the archive has one.
///
/// A chunk the player walks back into is generated again from scratch. That matches the
/// generator's output, but not the chunk as the player left it: edits and entity state live only
/// in the archive. Restoring here keeps the promise that a discovered chunk looks the same when
/// it comes back, which is what lets chunks be unloaded at all.
pub fn restore_discovered_from_archive(
    manager: &mut ChunkManager,
    archive: &ChunkArchive,
    discovered: &[armada_core::grid::ChunkCoord],
) -> Vec<String> {
    let chunks: Vec<_> = discovered
        .iter()
        .filter_map(|coord| archive.get(coord.cx, coord.cy))
        .collect();
    if chunks.is_empty() {
        return Vec::new();
    }
    manager.load_from_save(&WorldSave {
        format: armada_core::world::SAVE_FORMAT.to_owned(),
        schema_version: armada_core::world::SAVE_SCHEMA_VERSION,
        chunks,
        player: serde_json::json!({}),
        systems: serde_json::json!({}),
    })
}