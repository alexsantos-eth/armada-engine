//! Save and load for the Macroquad client.

use iso::world::ChunkManager;
use iso::world::{ChunkArchive, WorldSave, parse_world_save};

#[cfg(target_arch = "wasm32")]
const STORAGE_KEY: &str = "saves/iso_save.json";
/// Where `web/adapter.js` leaves the seed it drew for `?fresh`, read once and cleared at boot.
#[cfg(target_arch = "wasm32")]
const FRESH_SEED_KEY: &str = "saves/iso_fresh_seed";
/// The argument that starts a native run on a fresh world: no save, a new seed.
#[cfg(any(not(target_arch = "wasm32"), test))]
const FRESH_FLAG: &str = "--fresh";
/// The environment variable that keeps a run in fresh mode forever: the save is neither loaded
/// nor written, whatever the route says.
const FLUSH_VAR: &str = "FLUSH";

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

/// The systems a save carries besides the world's seed: what the player carries and the heaps
/// on the ground.
#[derive(Clone, Copy)]
pub struct SavedSystems<'a> {
    pub carried: &'a iso::inventory::Carried,
    pub drops: &'a iso::drops::Drops,
}

/// The save written for `archive` in a world of `seed`: its chunks and the seed, so the world
/// reopens as itself even when it was started from a fresh seed, and what the player `carried`.
pub fn snapshot_of(
    archive: &ChunkArchive,
    seed: u64,
    parts: Option<SavedSystems<'_>>,
) -> WorldSave {
    let systems = iso::world::seed_systems(seed);
    let systems = match parts {
        Some(parts) => iso::drops::with_drops(
            iso::inventory::with_carried(systems, parts.carried),
            parts.drops,
        ),
        None => systems,
    };
    archive.snapshot(serde_json::json!({}), systems)
}

/// The seed a world boots with: a scene's own, else one freshly drawn for `?fresh`, else the
/// one the save recorded, else the default world's.
pub fn boot_seed(scene: Option<u64>, fresh: Option<u64>, saved: Option<u64>, default: u64) -> u64 {
    scene.or(fresh).or(saved).unwrap_or(default)
}

/// Whether the variable that asks for a run that never saves is set; only its presence matters.
fn flush_variable_set(variable: Option<std::ffi::OsString>) -> bool {
    variable.is_some()
}

/// Whether the FLUSH environment variable asks for a run that never saves: the game boots a
/// fresh world and writes nothing, whatever the route says.
pub fn flush_requested() -> bool {
    flush_variable_set(std::env::var_os(FLUSH_VAR))
}

/// Reads the seed note `web/adapter.js` leaves for `?fresh`: a decimal `u64`, or nothing.
#[cfg_attr(
    not(target_arch = "wasm32"),
    allow(dead_code, reason = "read by the wasm build")
)]
pub(crate) fn parse_fresh_seed(note: &str) -> Option<u64> {
    note.trim().parse().ok()
}

/// Whether native arguments ask for a fresh world.
#[cfg(any(not(target_arch = "wasm32"), test))]
pub(crate) fn asks_for_fresh<'a>(mut arguments: impl Iterator<Item = &'a String>) -> bool {
    arguments.any(|argument| argument == FRESH_FLAG)
}

/// A freshly drawn seed when this run starts a fresh world, wiping the save it would otherwise
/// reopen. On the web the page draws it for `?fresh` and leaves it in storage, read and cleared
/// here; natively `--fresh` deletes the save file and draws it from the clock.
pub fn take_fresh_seed() -> Option<u64> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let arguments: Vec<String> = std::env::args().collect();
        if !asks_for_fresh(arguments.iter()) {
            return None;
        }
        let _ = std::fs::remove_file(crate::app::save_path());
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos() as u64);
        Some(iso::world::fresh_seed(
            nanos ^ u64::from(std::process::id()),
        ))
    }
    #[cfg(target_arch = "wasm32")]
    {
        let note = local_storage_get(FRESH_SEED_KEY)?;
        let _ = local_storage_set(FRESH_SEED_KEY, "");
        parse_fresh_seed(&note).map(iso::world::fresh_seed)
    }
}

/// Persists the archive of a world of `seed` to disk, or to browser storage on WASM.
pub fn save_archive(archive: &ChunkArchive, seed: u64, parts: SavedSystems<'_>) {
    let save = snapshot_of(archive, seed, Some(parts));
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
