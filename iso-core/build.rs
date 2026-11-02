// Build script for iso-core.
//
// Verifies that the asset atlas and manifest exist. They are produced by
// `./build-atlas.sh` (macOS, requires qlmanage) and committed to the repo.
// If they are missing, fail early with a helpful message.

fn main() {
    let atlas = "content/atlas.png";
    let manifest = "content/assets.manifest.json";

    if !std::path::Path::new(atlas).exists() {
        panic!(
            "missing {atlas}: run ./build-atlas.sh to generate the asset atlas from the SVG sources"
        );
    }
    if !std::path::Path::new(manifest).exists() {
        panic!(
            "missing {manifest}: run ./build-atlas.sh to generate the asset manifest"
        );
    }

    // Re-run this build script if the atlas or manifest changes.
    println!("cargo:rerun-if-changed={atlas}");
    println!("cargo:rerun-if-changed={manifest}");
}
