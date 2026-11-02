//! Save and load for the Macroquad client.
//!
//! On native targets the save file lives next to the executable. On WebAssembly the file
//! system is unavailable, so loading falls back to `macroquad::file::load_file` (an HTTP
//! request) and saving is a no-op until a JavaScript bridge is wired up.

use armada_core::world::{ChunkArchive, WorldSave, parse_world_save};
use armada_core::world::ChunkManager;

const SAVE_PATH: &str = "armada_save.json";

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
        // WASM: try fetching the save file over HTTP (may not exist).
        let data = macroquad::file::load_file(SAVE_PATH).await.ok()?;
        let json: serde_json::Value = serde_json::from_slice(&data).ok()?;
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
    let json = match serde_json::to_string_pretty(&save) {
        Ok(j) => j,
        Err(_) => return,
    };
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = std::fs::write(SAVE_PATH, json.as_bytes());
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = json;
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
pub fn load_archive_into_manager(manager: &mut ChunkManager, archive: &ChunkArchive) {
    // Reconstruct a WorldSave from the archive to feed load_from_save.
    let save = archive.snapshot(
        serde_json::json!({}),
        serde_json::json!({}),
    );
    manager.load_from_save(&save);
}