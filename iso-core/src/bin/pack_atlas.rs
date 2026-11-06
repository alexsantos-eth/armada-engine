//! Build tool: pack the rasterized assets into the atlas and the player's sheet textures.
//!
//! Usage: cargo run --bin pack_atlas -- <input_dir> <output_atlas> <output_manifest> [svg_root]
//!
//! Input: the directory `scripts/rasterize.py` wrote — one PNG per asset, plus one directory per player
//! sheet under `sheets/`, holding a PNG per cell named `<facing>-<pose>.png` — and the SVG
//! sources those PNGs were rendered from, under `svg_root` (default `public`).
//! Output: the packed atlas PNG, one texture per sheet beside it, and the manifest JSON.
//!
//! **Nothing is resized here.** The rasterizer draws every asset at the same number of pixels
//! per tile of world, so a sprite's pixels already match the size it is drawn at, whether it is
//! a boulder or a three-cell pier. Fitting each sprite into a cell of one fixed size, as this
//! used to, gave a bush and a six-storey tower the same pixels: the tower was drawn at a third
//! of the detail, and a whole 8x9 sheet of player poses came out at about sixteen pixels a
//! pose. Sprites are trimmed to their artwork and packed in shelves instead, and the sheets get
//! textures of their own.
//!
//! Each sprite is trimmed to its opaque pixels, which is what loses the only thing that says
//! where the drawing belongs in the world, since the transparent margin around it *was* the
//! tile. So the geometry is read back out of the SVG and written into the manifest beside the
//! frame; see `armada_core::assets::ink` for a single asset and `armada_core::assets::sheet`
//! for the window a sheet's cells share.

use armada_core::assets::{
    AssetEntry, AssetKind, AssetManifest, InkBox, MANIFEST_SCHEMA_VERSION, SheetLayout, SpriteAnchor,
    SpriteFrame, asset_ink, data_tiles, parse_sheet,
};
use image::RgbaImage;
use std::fs;
use std::path::{Path, PathBuf};

/// Width of the atlas, in pixels. Both dimensions stay within the 4096 px a texture is safe at
/// everywhere; the height grows with the shelves and is reported when the atlas is written.
const ATLAS_WIDTH: u32 = 4096;

/// Transparent border left around every sprite in the atlas.
///
/// Frames are sampled half a texel in from their edges, but a sprite drawn larger than its
/// frame still reaches past that, and without a gap it would pick up the neighbour packed
/// against it. One transparent pixel on each side is cheaper than the artefact.
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
fn pack_assets(input_dir: &Path, svg_root: &str, entries: &mut Vec<AssetEntry>) -> (RgbaImage, SpriteFrame) {
    // Tallest first, so that a shelf is filled by sprites of a similar height and little of it
    // is left empty above the short ones.
    let mut sprites: Vec<(String, RgbaImage)> = read_pngs(input_dir)
        .into_iter()
        .map(|(name, image)| {
            let trimmed = trim(&image);
            (name, trimmed)
        })
        .collect();
    sprites.sort_by(|a, b| b.1.height().cmp(&a.1.height()).then(a.0.cmp(&b.0)));

    let places = shelve(sprites.iter().map(|(_, image)| (image.width(), image.height())));
    let height = places
        .iter()
        .zip(&sprites)
        .map(|(&(_, y), (_, image))| y + image.height() + PADDING)
        .max()
        .unwrap_or(1);
    let mut atlas = RgbaImage::new(ATLAS_WIDTH, height);
    for ((name, image), (x, y)) in sprites.iter().zip(places) {
        image::imageops::replace(&mut atlas, image, i64::from(x), i64::from(y));
        let source = source_path(name);
        let svg = read_svg(svg_root, &source);
        entries.push(AssetEntry {
            id: name.clone(),
            kind: AssetKind::Entity,
            source,
            data_tiles: data_tiles(&svg).map(str::to_owned),
            // The frame is the artwork, not a cell it was centred in: the padding is what the
            // trim removed, and drawing it back in would scale every sprite down to fit it.
            frame: Some(SpriteFrame { x, y, width: image.width(), height: image.height() }),
            frames: None,
            texture: None,
            texture_size: None,
            sheet: None,
            anchor: SpriteAnchor { x: 0.5, y: 1.0 },
            ink: asset_ink(&svg).map(InkBox::rounded),
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
        println!("  placed by anchor (no measurable geometry): {}", unmeasured.join(", "));
    }
    (atlas, SpriteFrame { x: 0, y: 0, width: ATLAS_WIDTH, height })
}

/// Packs each sheet of player poses into a texture of its own and appends its entry.
///
/// A sheet keeps its grid rather than being shelved: every cell is the same window on the
/// character, so the cells are equal and a grid wastes nothing, and the frame of a pose is then
/// the cell at `facing * columns + pose`.
fn pack_sheets(input_dir: &Path, output_atlas: &Path, svg_root: &str, entries: &mut Vec<AssetEntry>) {
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
        let source = source_path(&name);
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
        let mut frames = vec![SpriteFrame { x: 0, y: 0, width: cell_width, height: cell_height }; (columns * rows) as usize];
        let mut drawn = 0;
        for (cell, image) in &cells {
            let Some((row, column)) = cell
                .split_once('-')
                .and_then(|(row, column)| Some((row.parse::<u32>().ok()?, column.parse::<u32>().ok()?)))
                .filter(|&(row, column)| row < rows && column < columns)
            else {
                eprintln!("warning: {name} has a cell named {cell}, which is not a row and column of its grid");
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
                facings: grid.facings.iter().map(|facing| (*facing).to_owned()).collect(),
                poses: grid.poses.iter().map(|pose| (*pose).to_owned()).collect(),
            }),
            anchor: SpriteAnchor { x: 0.5, y: 1.0 },
            // Every cell shows the same window of the character's template, so one box places
            // the whole sheet and the figure keeps its spot as the pose changes.
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

/// The image with its fully transparent border cut off, or the image itself if it is empty.
fn trim(image: &RgbaImage) -> RgbaImage {
    let (mut min_x, mut min_y) = (image.width(), image.height());
    let (mut max_x, mut max_y) = (0u32, 0u32);
    for y in 0..image.height() {
        for x in 0..image.width() {
            // Any alpha at all: the rasterizer's antialiasing reaches a pixel past the artwork,
            // and cutting that off frays every outline.
            if image.get_pixel(x, y)[3] > 0 {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }
    if min_x > max_x || min_y > max_y {
        return image.clone();
    }
    image::imageops::crop_imm(image, min_x, min_y, max_x - min_x + 1, max_y - min_y + 1).to_image()
}

/// Where each sprite goes in an atlas [`ATLAS_WIDTH`] wide: left to right along a shelf, then a
/// new shelf under the tallest sprite of the one before it.
///
/// The sprites come tallest first, so a shelf holds sprites of a similar height; the waste is
/// the ragged right edge of each shelf and the strip under its shorter sprites.
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
/// separates the directory from the file name.
fn source_path(name: &str) -> String {
    let mut parts = name.splitn(2, '_');
    let directory = parts.next().unwrap_or(name);
    match parts.next() {
        Some(file) if !file.is_empty() => format!("/assets/{directory}/{file}.svg"),
        _ => format!("/assets/{directory}.svg"),
    }
}

/// The SVG an asset was rasterized from, or an empty document if it cannot be read: a missing
/// source costs the asset its measured geometry, not the whole atlas.
fn read_svg(svg_root: &str, source: &str) -> String {
    fs::read_to_string(format!("{svg_root}{source}")).unwrap_or_else(|err| {
        eprintln!("warning: no source for {source}: {err}");
        String::new()
    })
}

/// A written file's path as the manifest records it: relative to the client root, with forward
/// slashes, which is what the client passes to the loader.
fn path_for_manifest(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}
