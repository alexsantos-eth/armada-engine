//! Build tool: write the geometry of an existing atlas back into its manifest.
//!
//! Usage: cargo run --bin remeasure_atlas -- <manifest> <atlas> [svg_root]
//!
//! [`pack_atlas`](../bin/pack_atlas.rs) now records where each sprite's artwork sits in the
//! world, but it only runs over the PNG thumbnails, and those are not kept in the repository —
//! the atlas and its manifest are. So this tool brings an atlas that was packed without that
//! geometry up to date without rasterizing anything: it measures each frame's opaque pixels in
//! the atlas, which is where the artwork actually is, and reads the artwork's position in the
//! world out of the SVG it came from.
//!
//! Writing the manifest is safe to repeat: measuring the opaque pixels of a frame that is
//! already their bounding box gives the same frame back.

use armada_core::assets::{AssetManifest, InkBox, SpriteFrame, asset_ink, data_tiles};
use image::RgbaImage;

/// Bounding box of everything that is not fully transparent inside `frame`.
///
/// Any alpha at all counts: the rasterizer's antialiasing reaches a pixel past the artwork's
/// edge, and cutting it off would both fray the outline and shrink the frame a little more
/// every time this tool ran.
fn opaque_bounds(atlas: &RgbaImage, frame: SpriteFrame) -> Option<SpriteFrame> {
    let (mut min_x, mut min_y) = (u32::MAX, u32::MAX);
    let (mut max_x, mut max_y) = (0u32, 0u32);
    for y in frame.y..(frame.y + frame.height).min(atlas.height()) {
        for x in frame.x..(frame.x + frame.width).min(atlas.width()) {
            if atlas.get_pixel(x, y)[3] > 0 {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }
    (min_x <= max_x).then_some(SpriteFrame {
        x: min_x,
        y: min_y,
        width: max_x - min_x + 1,
        height: max_y - min_y + 1,
    })
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: {} <manifest> <atlas> [svg_root]", args[0]);
        std::process::exit(1);
    }
    let (manifest_path, atlas_path) = (&args[1], &args[2]);
    let svg_root = args.get(3).map(String::as_str).unwrap_or("public");

    let json = std::fs::read_to_string(manifest_path).expect("read manifest");
    let mut manifest: AssetManifest = serde_json::from_str(&json).expect("parse manifest");
    let atlas = image::open(atlas_path).expect("open atlas").to_rgba8();

    let (mut measured, mut unmeasured) = (0, Vec::new());
    for entry in &mut manifest.entries {
        if let Some(frame) = entry.frame.and_then(|frame| opaque_bounds(&atlas, frame)) {
            entry.frame = Some(frame);
        }
        let svg = std::fs::read_to_string(format!("{svg_root}{}", entry.source));
        let svg = svg.ok();
        // The packer used to hard-code this; the asset says what it really is.
        entry.data_tiles = svg.as_deref().and_then(data_tiles).map(str::to_owned);
        match svg.as_deref().and_then(asset_ink) {
            Some(ink) => {
                entry.ink = Some(round(ink));
                measured += 1;
            }
            None => {
                entry.ink = None;
                unmeasured.push(entry.id.clone());
            }
        }
    }

    std::fs::write(
        manifest_path,
        serde_json::to_string_pretty(&manifest).expect("serialize manifest"),
    )
    .expect("write manifest");
    println!("{manifest_path}: {measured} of {} measured", manifest.entries.len());
    if !unmeasured.is_empty() {
        // Sheets and anything drawn with transforms: the client places these by their anchor.
        println!("placed by anchor: {}", unmeasured.join(", "));
    }
}

/// Six decimals of a tile width is a thousandth of a pixel on screen, and keeps the manifest
/// readable instead of full of 17-digit tails.
fn round(ink: InkBox) -> InkBox {
    let r = |v: f64| (v * 1e6).round() / 1e6;
    InkBox {
        x: r(ink.x),
        y: r(ink.y),
        width: r(ink.width),
        height: r(ink.height),
    }
}
