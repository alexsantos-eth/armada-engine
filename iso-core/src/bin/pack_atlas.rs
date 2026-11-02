//! Build tool: rasterize SVG thumbnails into a packed atlas.
//!
//! Usage: cargo run --bin pack_atlas -- <input_dir> <output_atlas> <output_manifest>
//!
//! Input: directory of PNG files (produced by qlmanage or similar).
//! Output: a packed atlas PNG and a manifest JSON.

use image::RgbaImage;
use serde::Serialize;
use std::fs;

#[derive(Serialize)]
struct SpriteFrame {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
struct SpriteAnchor {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct AssetEntry {
    id: String,
    kind: String,
    source: String,
    #[serde(rename = "dataTiles")]
    data_tiles: String,
    frame: SpriteFrame,
    anchor: SpriteAnchor,
    #[serde(rename = "colorVariants")]
    color_variants: u32,
}

#[derive(Serialize)]
struct AtlasSize {
    width: u32,
    height: u32,
}

#[derive(Serialize)]
struct Manifest {
    #[serde(rename = "schemaVersion")]
    schema_version: u32,
    atlas: String,
    #[serde(rename = "atlasSize")]
    atlas_size: AtlasSize,
    entries: Vec<AssetEntry>,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("Usage: {} <input_dir> <output_atlas> <output_manifest>", args[0]);
        std::process::exit(1);
    }
    let input_dir = &args[1];
    let output_atlas = &args[2];
    let output_manifest = &args[3];

    // Read all PNGs from input dir, sorted by name.
    let mut files: Vec<(String, RgbaImage)> = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(input_dir)
        .expect("input dir")
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|x| x == "png").unwrap_or(false))
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        let img = image::open(&path).expect("open png").to_rgba8();
        files.push((name, img));
    }

    // Pack into a grid atlas. Use 8 columns.
    let cols = 8u32;
    let cell_size = 128u32;
    let rows = (files.len() as u32).div_ceil(cols);
    let atlas_w = cols * cell_size;
    let atlas_h = rows * cell_size;

    let mut atlas = RgbaImage::new(atlas_w, atlas_h);

    let mut manifest_entries = Vec::new();
    for (i, (name, img)) in files.iter().enumerate() {
        let col = (i as u32) % cols;
        let row = (i as u32) / cols;
        let x = col * cell_size;
        let y = row * cell_size;

        // Resize image to cell_size if needed.
        let resized = if img.width() != cell_size || img.height() != cell_size {
            image::imageops::resize(img, cell_size, cell_size, image::imageops::FilterType::Lanczos3)
        } else {
            img.clone()
        };

        // Copy into atlas.
        for py in 0..cell_size {
            for px in 0..cell_size {
                let p = resized.get_pixel(px, py);
                atlas.put_pixel(x + px, y + py, *p);
            }
        }

        manifest_entries.push(AssetEntry {
            id: name.clone(),
            kind: "entity".to_owned(),
            source: format!("/assets/{}.svg", name.replace('_', "/")),
            data_tiles: "1x1x1".to_owned(),
            frame: SpriteFrame {
                x,
                y,
                width: cell_size,
                height: cell_size,
            },
            anchor: SpriteAnchor { x: 0.5, y: 1.0 },
            color_variants: 1,
        });
    }

    // Save atlas.
    atlas.save(output_atlas).expect("save atlas");
    println!("Atlas saved: {} ({}x{})", output_atlas, atlas_w, atlas_h);

    // Save manifest.
    let manifest = Manifest {
        schema_version: 1,
        atlas: output_atlas.to_string(),
        atlas_size: AtlasSize { width: atlas_w, height: atlas_h },
        entries: manifest_entries,
    };
    let json = serde_json::to_string_pretty(&manifest).expect("serialize manifest");
    fs::write(output_manifest, json).expect("write manifest");
    println!("Manifest saved: {} ({} entries)", output_manifest, manifest.entries.len());
}