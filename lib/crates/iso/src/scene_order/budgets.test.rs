use super::*;

// The streaming budgets are constants by design, so their relationships are checked at
// compile time rather than at runtime: a bad edit fails the build here.
const _: () = {
    assert!(CHUNK_LOAD_RADIUS > 0);
    assert!(CHUNK_PREFETCH_RADIUS >= CHUNK_LOAD_RADIUS);
    assert!(CHUNK_KEEP_RADIUS >= CHUNK_PREFETCH_RADIUS);
    assert!(CHUNKS_LOADED_PER_FRAME > 0);
    assert!(CHUNKS_SHOWN_PER_FRAME > 0);
    assert!(CHUNKS_HIDDEN_PER_FRAME > 0);
};
