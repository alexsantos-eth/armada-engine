//! Build tool: write the geometry of an existing atlas back into its manifest.

use image::RgbaImage;
use iso::assets::{AssetManifest, SpriteFrame, asset_ink, data_tiles, raster_ink, sidecar_tiles};

/// Bounding box of everything that is not fully transparent inside `frame`.
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
    (min_x <= max_x).then(|| SpriteFrame {
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

    let (mut measured, mut unmeasured, mut sheets) = (0, Vec::new(), Vec::new());
    for entry in &mut manifest.entries {
        if entry.sheet.is_some() {
            sheets.push(entry.id.clone());
            continue;
        }
        if let Some(frame) = entry.frame.and_then(|frame| opaque_bounds(&atlas, frame)) {
            entry.frame = Some(frame);
        }
        let measurement = if entry.source.ends_with(".png") {
            // A raster asset is measured from its own source, which still carries the whole
            // template canvas that the atlas frame was trimmed out of.
            let stem = entry.source.trim_end_matches(".png");
            let tiles = std::fs::read_to_string(format!("{svg_root}{stem}.json"))
                .ok()
                .and_then(|json| sidecar_tiles(&json).map(str::to_owned))
                .or_else(|| {
                    // An asset repainted over a drawing takes the drawing's footprint.
                    let svg = std::fs::read_to_string(format!("{svg_root}{stem}.svg")).ok()?;
                    data_tiles(&svg).map(str::to_owned)
                });
            entry.data_tiles = tiles.clone();
            image::open(format!("{svg_root}{}", entry.source))
                .ok()
                .map(|source| source.to_rgba8())
                .and_then(|source| {
                    let canvas = (source.width(), source.height());
                    let whole = SpriteFrame {
                        x: 0,
                        y: 0,
                        width: canvas.0,
                        height: canvas.1,
                    };
                    let box_ = opaque_bounds(&source, whole)?;
                    let bounds = (box_.x, box_.y, box_.x + box_.width, box_.y + box_.height);
                    raster_ink(canvas, bounds, tiles.as_deref())
                })
        } else {
            let svg = std::fs::read_to_string(format!("{svg_root}{}", entry.source)).ok();
            entry.data_tiles = svg.as_deref().and_then(data_tiles).map(str::to_owned);
            svg.as_deref().and_then(asset_ink)
        };
        match measurement {
            Some(ink) => {
                entry.ink = Some(ink.rounded());
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
    println!(
        "{manifest_path}: {measured} of {} measured",
        manifest.entries.len()
    );
    if !sheets.is_empty() {
        println!("left as packed (sheets of poses): {}", sheets.join(", "));
    }
    if !unmeasured.is_empty() {
        println!("placed by anchor: {}", unmeasured.join(", "));
    }
}

#[cfg(test)]
#[path = "remeasure_atlas.test.rs"]
mod tests;
