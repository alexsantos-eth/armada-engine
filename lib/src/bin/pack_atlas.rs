//! Build tool: pack the rasterized assets into the atlas and the player's sheet textures.

use image::RgbaImage;
use iso::assets::{
    AssetEntry, AssetKind, AssetManifest, InkBox, MANIFEST_SCHEMA_VERSION, SheetLayout,
    SpriteAnchor, SpriteFrame, asset_ink, data_tiles, parse_sheet, raster_ink,
};
use std::fs;
use std::path::{Path, PathBuf};

/// Width of the atlas, in pixels. Both dimensions stay within the 4096 px a texture is safe at
const ATLAS_WIDTH: u32 = 4096;

/// Transparent border left around every sprite in the atlas.
const PADDING: u32 = 1;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!(
            "Usage: {} <input_dir> <output_atlas> <output_manifest> [svg_root]",
            args[0]
        );
        std::process::exit(1);
    }
    let input_dir = Path::new(&args[1]);
    let output_atlas = Path::new(&args[2]);
    let output_manifest = &args[3];
    let svg_root = args.get(4).map(String::as_str).unwrap_or("public");

    let mut entries = Vec::new();
    let (atlas, atlas_size) = pack_assets(input_dir, svg_root, &mut entries);
    atlas.save(output_atlas).expect("save atlas");
    println!(
        "Atlas saved: {} ({}x{})",
        output_atlas.display(),
        atlas_size.width,
        atlas_size.height
    );
    pack_sheets(input_dir, output_atlas, svg_root, &mut entries);

    entries.sort_by(|a, b| a.id.cmp(&b.id));
    let manifest = AssetManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        atlas: path_for_manifest(output_atlas),
        atlas_size,
        entries,
    };
    let json = serde_json::to_string_pretty(&manifest).expect("serialize manifest");
    fs::write(output_manifest, json).expect("write manifest");
    println!(
        "Manifest saved: {} ({} entries)",
        output_manifest,
        manifest.entries.len()
    );
}

/// Packs every single-asset PNG into one atlas and appends an entry for each.
fn pack_assets(
    input_dir: &Path,
    svg_root: &str,
    entries: &mut Vec<AssetEntry>,
) -> (RgbaImage, SpriteFrame) {
    // An asset drawn as a raster has no geometry to measure, so its ink comes from where its
    // opaque pixels sit on the template canvas — which is only knowable before the trim.
    let mut sprites: Vec<(String, RgbaImage, Option<InkBox>)> = read_pngs(input_dir)
        .into_iter()
        .map(|(name, image)| {
            let canvas = (image.width(), image.height());
            let source = source_path(svg_root, &name);
            let ink = if source.ends_with(".png") {
                opaque_bounds(&image).and_then(|bounds| {
                    raster_ink(canvas, bounds, raster_tiles(svg_root, &source).as_deref())
                })
            } else {
                asset_ink(&read_svg(svg_root, &source))
            };
            (name, trim(&image), ink.map(InkBox::rounded))
        })
        .collect();
    sprites.sort_by(|a, b| b.1.height().cmp(&a.1.height()).then(a.0.cmp(&b.0)));

    let places = shelve(
        sprites
            .iter()
            .map(|(_, image, _)| (image.width(), image.height())),
    );
    let height = places
        .iter()
        .zip(&sprites)
        .map(|(&(_, y), (_, image, _))| y + image.height() + PADDING)
        .max()
        .unwrap_or(1);
    let mut atlas = RgbaImage::new(ATLAS_WIDTH, height);
    for ((name, image, ink), (x, y)) in sprites.iter().zip(places) {
        image::imageops::replace(&mut atlas, image, i64::from(x), i64::from(y));
        let source = source_path(svg_root, name);
        let tiles = if source.ends_with(".png") {
            raster_tiles(svg_root, &source)
        } else {
            data_tiles(&read_svg(svg_root, &source)).map(str::to_owned)
        };
        entries.push(AssetEntry {
            id: name.clone(),
            kind: AssetKind::Entity,
            source,
            data_tiles: tiles,
            frame: Some(SpriteFrame {
                x,
                y,
                width: image.width(),
                height: image.height(),
            }),
            frames: None,
            texture: None,
            texture_size: None,
            sheet: None,
            anchor: SpriteAnchor { x: 0.5, y: 1.0 },
            ink: *ink,
            color_variants: 1,
            sway: None,
        });
    }
    let unmeasured: Vec<&str> = entries
        .iter()
        .filter(|entry| entry.ink.is_none())
        .map(|entry| entry.id.as_str())
        .collect();
    if !unmeasured.is_empty() {
        println!(
            "  placed by anchor (no measurable geometry): {}",
            unmeasured.join(", ")
        );
    }
    (
        atlas,
        SpriteFrame {
            x: 0,
            y: 0,
            width: ATLAS_WIDTH,
            height,
        },
    )
}

/// Packs each sheet of player poses into a texture of its own and appends its entry.
fn pack_sheets(
    input_dir: &Path,
    output_atlas: &Path,
    svg_root: &str,
    entries: &mut Vec<AssetEntry>,
) {
    let sheets_dir = input_dir.join("sheets");
    let Ok(dirs) = fs::read_dir(&sheets_dir) else {
        println!("no sheets in {}", sheets_dir.display());
        return;
    };
    let mut dirs: Vec<PathBuf> = dirs
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    dirs.sort();

    for dir in dirs {
        let name = dir.file_name().unwrap().to_string_lossy().to_string();
        let source = source_path(svg_root, &name);
        let svg = read_svg(svg_root, &source);
        let Some(grid) = parse_sheet(&svg) else {
            eprintln!("warning: {source} is not a sprite sheet; its cells are skipped");
            continue;
        };
        let cells = read_pngs(&dir);
        let (Some(cell_width), Some(cell_height)) = (
            cells.iter().map(|(_, image)| image.width()).max(),
            cells.iter().map(|(_, image)| image.height()).max(),
        ) else {
            eprintln!("warning: no cells were rasterized for {source}");
            continue;
        };
        let (columns, rows) = (grid.columns as u32, grid.rows() as u32);
        let mut texture = RgbaImage::new(columns * cell_width, rows * cell_height);
        let mut frames = vec![
            SpriteFrame {
                x: 0,
                y: 0,
                width: cell_width,
                height: cell_height
            };
            (columns * rows) as usize
        ];
        let mut drawn = 0;
        for (cell, image) in &cells {
            let Some((row, column)) = cell
                .split_once('-')
                .and_then(|(row, column)| {
                    Some((row.parse::<u32>().ok()?, column.parse::<u32>().ok()?))
                })
                .filter(|&(row, column)| row < rows && column < columns)
            else {
                eprintln!(
                    "warning: {name} has a cell named {cell}, which is not a row and column of its grid"
                );
                continue;
            };
            let (x, y) = (column * cell_width, row * cell_height);
            image::imageops::replace(&mut texture, image, i64::from(x), i64::from(y));
            frames[(row * columns + column) as usize] = SpriteFrame {
                x,
                y,
                width: image.width(),
                height: image.height(),
            };
            drawn += 1;
        }
        let path = output_atlas.with_file_name(format!("{name}.png"));
        texture.save(&path).expect("save sheet texture");
        println!(
            "Sheet saved: {} ({}x{}, {drawn} of {} cells)",
            path.display(),
            texture.width(),
            texture.height(),
            columns * rows
        );
        entries.push(AssetEntry {
            id: name,
            kind: AssetKind::Player,
            source,
            data_tiles: data_tiles(&svg).map(str::to_owned),
            frame: None,
            frames: Some(frames),
            texture: Some(path_for_manifest(&path)),
            texture_size: Some(SpriteFrame {
                x: 0,
                y: 0,
                width: texture.width(),
                height: texture.height(),
            }),
            sheet: Some(SheetLayout {
                columns,
                rows,
                facings: grid
                    .facings
                    .iter()
                    .map(|facing| (*facing).to_owned())
                    .collect(),
                poses: grid.poses.iter().map(|pose| (*pose).to_owned()).collect(),
            }),
            anchor: SpriteAnchor { x: 0.5, y: 1.0 },
            ink: Some(grid.ink().rounded()),
            color_variants: 1,
            sway: None,
        });
    }
}

/// Every PNG directly inside `dir`, by file stem, in name order.
fn read_pngs(dir: &Path) -> Vec<(String, RgbaImage)> {
    let mut paths: Vec<PathBuf> = fs::read_dir(dir)
        .unwrap_or_else(|err| panic!("read {}: {err}", dir.display()))
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "png"))
        .collect();
    paths.sort();
    paths
        .into_iter()
        .map(|path| {
            let name = path.file_stem().unwrap().to_string_lossy().to_string();
            (name, image::open(&path).expect("open png").to_rgba8())
        })
        .collect()
}

/// The box of the image's opaque pixels, as `(min_x, min_y, max_x, max_y)` with the maxima one
/// past the last opaque column and row, or `None` if nothing in it is opaque.
fn opaque_bounds(image: &RgbaImage) -> Option<(u32, u32, u32, u32)> {
    let (mut min_x, mut min_y) = (image.width(), image.height());
    let (mut max_x, mut max_y) = (0u32, 0u32);
    for y in 0..image.height() {
        for x in 0..image.width() {
            if image.get_pixel(x, y)[3] > 0 {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }
    (min_x <= max_x && min_y <= max_y).then(|| (min_x, min_y, max_x + 1, max_y + 1))
}

/// The image with its fully transparent border cut off, or the image itself if it is empty.
fn trim(image: &RgbaImage) -> RgbaImage {
    let Some((min_x, min_y, max_x, max_y)) = opaque_bounds(image) else {
        return image.clone();
    };
    image::imageops::crop_imm(image, min_x, min_y, max_x - min_x, max_y - min_y).to_image()
}

/// Where each sprite goes in an atlas [`ATLAS_WIDTH`] wide: left to right along a shelf, then a
fn shelve(sizes: impl Iterator<Item = (u32, u32)>) -> Vec<(u32, u32)> {
    let (mut x, mut y, mut shelf) = (PADDING, PADDING, 0);
    sizes
        .map(|(width, height)| {
            if x + width + PADDING > ATLAS_WIDTH {
                x = PADDING;
                y += shelf + PADDING;
                shelf = 0;
            }
            let place = (x, y);
            x += width + PADDING;
            shelf = shelf.max(height);
            place
        })
        .collect()
}

/// The asset source path a rasterized file's name came from: only the first underscore
fn source_path(svg_root: &str, name: &str) -> String {
    let mut parts = name.splitn(2, '_');
    let directory = parts.next().unwrap_or(name);
    let stem = match parts.next() {
        Some(file) if !file.is_empty() => format!("/assets/{directory}/{file}"),
        _ => format!("/assets/{directory}"),
    };
    // An asset is authored either as vector geometry or as a raster drawn on the same template.
    // A raster beside an SVG overrides it, so an asset is repainted by adding the PNG and put
    // back by deleting it, and the drawing that shaped it stays in the tree either way.
    let png = format!("{stem}.png");
    if Path::new(&format!("{svg_root}{png}")).exists() {
        png
    } else {
        format!("{stem}.svg")
    }
}

/// The `data-tiles` of a raster asset: from the JSON file beside the image, or, for an asset
/// repainted over a drawing, from the drawing it overrides.
fn raster_tiles(svg_root: &str, source: &str) -> Option<String> {
    let stem = source.strip_suffix(".png")?;
    if let Some(tiles) = fs::read_to_string(format!("{svg_root}{stem}.json"))
        .ok()
        .and_then(|text| iso::assets::sidecar_tiles(&text).map(str::to_owned))
    {
        return Some(tiles);
    }
    let svg = fs::read_to_string(format!("{svg_root}{stem}.svg")).ok()?;
    data_tiles(&svg).map(str::to_owned)
}

/// The SVG an asset was rasterized from, or an empty document if it cannot be read: a missing
fn read_svg(svg_root: &str, source: &str) -> String {
    fs::read_to_string(format!("{svg_root}{source}")).unwrap_or_else(|err| {
        eprintln!("warning: no source for {source}: {err}");
        String::new()
    })
}

/// A written file's path as the manifest records it: relative to the client root, with forward
fn path_for_manifest(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
#[path = "pack_atlas.test.rs"]
mod tests;
