//! Chunk loading, showing and hiding budgets shared by every client. Pure numbers.

/// Chunks needed around each focus chunk (`stream()`): the ring a shown chunk needs for its edges.
pub const CHUNK_LOAD_RADIUS: i32 = 1;

/**
 * Chunks loaded ahead around each focus chunk once the needed ones are in, within the budget.
 * The ground is generated a few frames before the camera reaches it, never all at once.
 */
pub const CHUNK_PREFETCH_RADIUS: i32 = 2;

/**
 * Chunks kept loaded around each focus chunk, past those loaded ahead: a chunk is unloaded only
 * once it is further than this from every focus, so a focus going back and forth over a chunk
 * edge does not unload and generate the same chunks again (hysteresis).
 */
pub const CHUNK_KEEP_RADIUS: i32 = 3;

/** Chunks generated per frame (`stream()` with `max_loads`): one per frame, spread over frames. */
pub const CHUNKS_LOADED_PER_FRAME: i32 = 1;

/** Chunks the scene starts showing per frame once it is built. */
pub const CHUNKS_SHOWN_PER_FRAME: i32 = 1;

/** Chunks out of view the scene hides per frame; the others wait, out of view and culled. */
pub const CHUNKS_HIDDEN_PER_FRAME: i32 = 1;

// Every budget is positive and the radii grow outwards, checked at compile time so a bad edit
// never reaches a client: a keep radius below the prefetch radius would unload a chunk the
// streamer is still asking for, and the two would fight every frame.
const _: () = {
    assert!(CHUNK_LOAD_RADIUS > 0);
    assert!(CHUNK_PREFETCH_RADIUS >= CHUNK_LOAD_RADIUS);
    assert!(CHUNK_KEEP_RADIUS >= CHUNK_PREFETCH_RADIUS);
    assert!(CHUNKS_LOADED_PER_FRAME > 0);
    assert!(CHUNKS_SHOWN_PER_FRAME > 0);
    assert!(CHUNKS_HIDDEN_PER_FRAME > 0);
};

#[cfg(test)]
#[path = "budgets.test.rs"]
mod tests;
