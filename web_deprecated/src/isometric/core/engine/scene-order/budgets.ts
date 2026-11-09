/** Chunk loading, showing and hiding budgets shared by every client. Pure numbers. */

/** Chunks needed around each focus chunk (`stream()`): the ring a shown chunk needs for its edges. */
export const CHUNK_LOAD_RADIUS = 1;

/**
 * Chunks loaded ahead around each focus chunk once the needed ones are in, within the budget.
 * The ground is generated a few frames before the camera reaches it.
 */
export const CHUNK_PREFETCH_RADIUS = 2;

/**
 * Chunks kept loaded around each focus chunk, past those loaded ahead: a chunk is unloaded only
 * once it is further than this from every focus, so a focus going back and forth over a chunk
 * edge does not unload and generate the same chunks again (hysteresis).
 */
export const CHUNK_KEEP_RADIUS = 3;

/** Chunks generated per frame (`stream()` with `maxLoads`): one per frame, spread over frames. */
export const CHUNKS_LOADED_PER_FRAME = 1;

/** Chunks the scene starts showing per frame once it is built, so walking into new ground never
 * builds several chunks in one frame. */
export const CHUNKS_SHOWN_PER_FRAME = 1;

/** Chunks out of view the scene hides per frame: the others wait, out of view and culled. */
export const CHUNKS_HIDDEN_PER_FRAME = 1;
