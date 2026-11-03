//! Build tool: rasterize SVG thumbnails into a packed atlas.
//!
//! Usage: cargo run --bin pack_atlas -- <input_dir> <output_atlas> <output_manifest>
//!
//! Usage: cargo run --bin pack_atlas -- <input_dir> <output_atlas> <output_manifest> [svg_root]
//!
//! Input: directory of PNG files (produced by qlmanage or similar), and the SVG sources those
//! thumbnails were rendered from, under `svg_root` (default `public`).
//! Output: a packed atlas PNG and a manifest JSON.
//!
//! Each sprite is trimmed to its opaque pixels before being fitted into a cell, which is what
//! keeps the atlas small — and what loses the only thing that says where the drawing belongs in
//! the world, since the transparent margin around it *was* the tile. So the geometry is read
//! back out of the SVG and written into the manifest beside the frame; see
//! `armada_core::assets::ink`.

use armada_core::assets::{
    AssetEntry, AssetKind, AssetManifest, MANIFEST_SCHEMA_VERSION, SpriteAnchor, SpriteFrame,
    asset_ink, data_tiles,
};
use image::RgbaImage;
use std::fs;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!(
            "Usage: {} <input_dir> <output_atlas> <output_manifest> [svg_root]",
            args[0]
        );
        std::process::exit(1);
    }
    let input_dir = &args[1];
    let output_atlas = &args[2];
    let output_manifest = &args[3];
    let svg_root = args.get(4).map(String::as_str).unwrap_or("public");

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

        // Trim transparent padding: find the bounding box of non-transparent pixels.
        let mut min_x = img.width();
        let mut min_y = img.height();
        let mut max_x = 0u32;
        let mut max_y = 0u32;
        for py in 0..img.height() {
            for px in 0..img.width() {
                if img.get_pixel(px, py)[3] > 10 {
                    min_x = min_x.min(px);
                    min_y = min_y.min(py);
                    max_x = max_x.max(px);
                    max_y = max_y.max(py);
                }
            }
        }

        let trimmed = if min_x < max_x && min_y < max_y {
            let w = max_x - min_x + 1;
            let h = max_y - min_y + 1;
            image::imageops::crop_imm(img, min_x, min_y, w, h).to_image()
        } else {
            img.clone()
        };

        // Scale to fit the cell while preserving aspect ratio.
        let scale = (cell_size as f64 / trimmed.width() as f64)
            .min(cell_size as f64 / trimmed.height() as f64);
        let new_w = (trimmed.width() as f64 * scale).round().max(1.0) as u32;
        let new_h = (trimmed.height() as f64 * scale).round().max(1.0) as u32;
        let resized = image::imageops::resize(
            &trimmed,
            new_w,
            new_h,
            image::imageops::FilterType::Lanczos3,
        );

        // Center in the cell with transparent padding.
        let off_x = (cell_size - new_w) / 2;
        let off_y = (cell_size - new_h) / 2;
        for py in 0..new_h {
            for px in 0..new_w {
                let p = resized.get_pixel(px, py);
                atlas.put_pixel(x + off_x + px, y + off_y + py, *p);
            }
        }

        let source = {
            // Only the first underscore separates directory from file name.
            let mut parts = name.splitn(2, '_');
            let dir = parts.next().unwrap_or(name.as_str());
            let file = parts.next().unwrap_or("");
            if file.is_empty() {
                format!("/assets/{dir}.svg")
            } else {
                format!("/assets/{dir}/{file}.svg")
            }
        };
        let svg = fs::read_to_string(format!("{svg_root}{source}"));
        let svg = svg.unwrap_or_else(|err| {
            eprintln!("warning: no source for {source}: {err}");
            String::new()
        });
        let ink = asset_ink(&svg);
        if ink.is_none() {
            // A sheet, or anything else that is not one drawing in the template: the client
            // places these by their anchor.
            println!("  {name}: no measurable geometry, placed by anchor");
        }

        manifest_entries.push(AssetEntry {
            id: name.clone(),
            kind: AssetKind::Entity,
            source,
            data_tiles: data_tiles(&svg).map(str::to_owned),
            // The frame is the artwork, not the cell it was centred in: the padding is what the
            // trim removed, and drawing it back in would scale every sprite down to fit it.
            frame: Some(SpriteFrame {
                x: x + off_x,
                y: y + off_y,
                width: new_w,
                height: new_h,
            }),
            frames: None,
            anchor: SpriteAnchor { x: 0.5, y: 1.0 },
            ink,
            color_variants: 1,
            sway: None,
        });
    }

    // Save atlas.
    atlas.save(output_atlas).expect("save atlas");
    println!("Atlas saved: {} ({}x{})", output_atlas, atlas_w, atlas_h);

    // Save manifest.
    let manifest = AssetManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        atlas: output_atlas.to_string(),
        atlas_size: SpriteFrame { x: 0, y: 0, width: atlas_w, height: atlas_h },
        entries: manifest_entries,
    };
    let json = serde_json::to_string_pretty(&manifest).expect("serialize manifest");
    fs::write(output_manifest, json).expect("write manifest");
    println!("Manifest saved: {} ({} entries)", output_manifest, manifest.entries.len());
}
