//! Save and load for the Macroquad client.
//!
//! On native targets the save file lives next to the executable. On WebAssembly the file
//! system is unavailable, so the save persists in `window.localStorage` under the same key.

use iso::world::ChunkManager;
use iso::world::{ChunkArchive, WorldSave, parse_world_save};

const SAVE_PATH: &str = "saves/armada_save.json";

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn armada_storage_get(
        key_ptr: *const u8,
        key_len: usize,
        output_ptr: *mut u8,
        output_capacity: usize,
    ) -> isize;
    fn armada_storage_set(
        key_ptr: *const u8,
        key_len: usize,
        value_ptr: *const u8,
        value_len: usize,
    ) -> i32;
}

/// Reads a JSON string from `window.localStorage` on WASM.
#[cfg(target_arch = "wasm32")]
fn local_storage_get(key: &str) -> Option<String> {
    const OUTPUT_CAPACITY: usize = 32 * 1024 * 1024;
    let mut output = Vec::with_capacity(OUTPUT_CAPACITY);
    let length = unsafe {
        armada_storage_get(
            key.as_ptr(),
            key.len(),
            output.as_mut_ptr(),
            OUTPUT_CAPACITY,
        )
    };
    if length < 0 || length as usize > OUTPUT_CAPACITY {
        return None;
    }
    unsafe {
        output.set_len(length as usize);
    }
    String::from_utf8(output).ok()
}

/// Writes a JSON string to `window.localStorage` on WASM.
#[cfg(target_arch = "wasm32")]
fn local_storage_set(key: &str, value: &str) -> bool {
    unsafe { armada_storage_set(key.as_ptr(), key.len(), value.as_ptr(), value.len()) != 0 }
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

/// Persists the archive to disk or to browser storage on WASM.
pub fn save_archive(archive: &ChunkArchive) {
    let save = archive.snapshot(serde_json::json!({}), serde_json::json!({}));
    // Compact, not pretty: nobody reads a save by hand, and the indentation was 60% of the file
    // (16.6 MB vs 6.6 MB for 25 chunks). Serializing it is pure main-thread time.
    let json = match serde_json::to_string(&save) {
        Ok(j) => j,
        Err(_) => return,
    };
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(directory) = std::path::Path::new(SAVE_PATH).parent() {
            let _ = std::fs::create_dir_all(directory);
        }
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
    let save = archive.snapshot(serde_json::json!({}), serde_json::json!({}));
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
    discovered: &[iso::grid::ChunkCoord],
) -> Vec<String> {
    let chunks: Vec<_> = discovered
        .iter()
        .filter_map(|coord| archive.get(coord.cx, coord.cy))
        .collect();
    if chunks.is_empty() {
        return Vec::new();
    }
    manager.load_from_save(&WorldSave {
        format: iso::world::SAVE_FORMAT.to_owned(),
        schema_version: iso::world::SAVE_SCHEMA_VERSION,
        chunks,
        player: serde_json::json!({}),
        systems: serde_json::json!({}),
    })
}
