//! Save and load for the Macroquad client.

use iso::world::ChunkManager;
use iso::world::{ChunkArchive, WorldSave, parse_world_save};

#[cfg(target_arch = "wasm32")]
const STORAGE_KEY: &str = "saves/iso_save.json";

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn iso_storage_get(
        key_ptr: *const u8,
        key_len: usize,
        output_ptr: *mut u8,
        output_capacity: usize,
    ) -> isize;
    fn iso_storage_set(
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
        iso_storage_get(
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
    unsafe { iso_storage_set(key.as_ptr(), key.len(), value.as_ptr(), value.len()) != 0 }
}

/// Tries to load a save file from disk. Returns `None` on any error or when running on WASM.
pub async fn load_save() -> Option<WorldSave> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let path = crate::app::save_path();
        let contents = std::fs::read_to_string(&path).ok()?;
        let json: serde_json::Value = serde_json::from_str(&contents).ok()?;
        parse_world_save(json).ok()
    }
    #[cfg(target_arch = "wasm32")]
    {
        let contents = local_storage_get(STORAGE_KEY)?;
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
    let json = match serde_json::to_string(&save) {
        Ok(j) => j,
        Err(_) => return,
    };
    #[cfg(not(target_arch = "wasm32"))]
    {
        let path = crate::app::save_path();
        if let Some(directory) = path.parent() {
            let _ = std::fs::create_dir_all(directory);
        }
        if let Err(err) = std::fs::write(&path, json.as_bytes()) {
            eprintln!(
                "warning: could not write the save at {}: {err}",
                path.display()
            );
        }
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = local_storage_set(STORAGE_KEY, &json);
    }
}

/// Syncs discovered chunks from a `ChunkManager` into a `ChunkArchive`, replacing any
pub fn sync_manager_to_archive(manager: &mut ChunkManager, archive: &mut ChunkArchive) {
    for saved in manager.save_all() {
        archive.put(saved);
    }
}

/// Loads saved chunks from an archive into a `ChunkManager`, bypassing terrain generation.
pub fn load_archive_into_manager(
    manager: &mut ChunkManager,
    archive: &ChunkArchive,
) -> Vec<String> {
    let save = archive.snapshot(serde_json::json!({}), serde_json::json!({}));
    manager.load_from_save(&save)
}

/// Replaces freshly generated chunks with their archived copy, where the archive has one.
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

#[cfg(test)]
#[path = "persistence.test.rs"]
mod tests;
