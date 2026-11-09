use super::*;

#[test]
fn streaming_radii_grow_outward_and_work_is_budgeted() {
    assert!(CHUNK_LOAD_RADIUS > 0);
    assert!(CHUNK_PREFETCH_RADIUS >= CHUNK_LOAD_RADIUS);
    assert!(CHUNK_KEEP_RADIUS >= CHUNK_PREFETCH_RADIUS);
    assert!(CHUNKS_LOADED_PER_FRAME > 0);
    assert!(CHUNKS_SHOWN_PER_FRAME > 0);
    assert!(CHUNKS_HIDDEN_PER_FRAME > 0);
}
