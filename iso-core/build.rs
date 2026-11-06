fn main() {
    let atlas = "content/atlas.png";
    let manifest = "content/assets.manifest.json";

    if !std::path::Path::new(atlas).exists() {
        panic!(
            "missing {atlas}: run scripts/build-atlas.sh to generate the asset atlas from the SVG sources"
        );
    }
    if !std::path::Path::new(manifest).exists() {
        panic!("missing {manifest}: run scripts/build-atlas.sh to generate the asset manifest");
    }

    println!("cargo:rerun-if-changed={atlas}");
    println!("cargo:rerun-if-changed={manifest}");
}
