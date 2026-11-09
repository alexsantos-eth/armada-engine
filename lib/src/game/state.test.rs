//! `Game::new` itself is exercised by booting the game; the only pure rule here is where the
//! client fetches a manifest path from, which differs between the native and the WASM build.

use super::*;

#[cfg(not(target_arch = "wasm32"))]
#[test]
fn native_builds_fetch_manifest_paths_as_is() {
    assert_eq!(client_path("content/atlas.png"), "content/atlas.png");
}

#[cfg(target_arch = "wasm32")]
#[test]
fn wasm_builds_fetch_manifest_paths_relative_to_root() {
    assert_eq!(client_path("content/atlas.png"), "./content/atlas.png");
}
