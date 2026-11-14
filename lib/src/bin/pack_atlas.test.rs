use super::*;
use image::Rgba;

#[test]
fn trim_cuts_the_transparent_border() {
    let mut image = RgbaImage::new(5, 5);
    for y in 2..=3 {
        for x in 1..=2 {
            image.put_pixel(x, y, Rgba([9, 8, 7, 255]));
        }
    }
    let trimmed = trim(&image);
    assert_eq!((trimmed.width(), trimmed.height()), (2, 2));
    assert_eq!(trimmed.get_pixel(0, 0), &Rgba([9, 8, 7, 255]));
}

#[test]
fn trim_keeps_a_fully_transparent_image_as_it_is() {
    let image = RgbaImage::new(4, 3);
    let trimmed = trim(&image);
    assert_eq!((trimmed.width(), trimmed.height()), (4, 3));
}

#[test]
fn shelve_places_left_to_right_then_wraps_to_a_new_shelf() {
    let places = shelve([(100, 50), (4090, 10), (50, 20)].into_iter());
    assert_eq!(places, vec![(1, 1), (1, 52), (1, 63)]);
}

#[test]
fn shelve_keeps_a_sprite_that_exactly_fills_the_width() {
    let places = shelve([(4094, 33), (1, 1)].into_iter());
    assert_eq!(places, vec![(1, 1), (1, 35)]);
}

#[test]
fn shelve_never_overlaps() {
    let sizes = [
        (100, 50),
        (200, 60),
        (150, 40),
        (1000, 100),
        (3000, 30),
        (90, 90),
    ];
    let places = shelve(sizes.iter().copied());
    let rects: Vec<(u32, u32, u32, u32)> = places
        .iter()
        .zip(&sizes)
        .map(|(&(x, y), &(width, height))| (x, y, x + width, y + height))
        .collect();
    for (i, first) in rects.iter().enumerate() {
        for second in &rects[i + 1..] {
            let (ax, ay, aw, ah) = *first;
            let (bx, by, bw, bh) = *second;
            assert!(
                aw <= bx || bw <= ax || ah <= by || bh <= ay,
                "{first:?} overlaps {second:?}"
            );
        }
    }
}

#[test]
fn source_path_derives_the_svg_from_the_file_name() {
    // A root with nothing in it, so this measures only how a name becomes a path: whether an
    // asset is drawn or repainted is the next test's business, and this one must not move
    // every time one of them gains a PNG.
    let root = "/nonexistent-asset-root";
    assert_eq!(source_path(root, "house_block"), "/assets/house/block.svg");
    assert_eq!(
        source_path(root, "cloud_cloud-shadow"),
        "/assets/cloud/cloud-shadow.svg"
    );
    assert_eq!(source_path(root, "block"), "/assets/block.svg");
    assert_eq!(source_path(root, "a_"), "/assets/a.svg");
}

#[test]
fn a_raster_asset_overrides_the_svg_beside_it() {
    let dir = std::env::temp_dir().join("pack_atlas_source_path");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("assets/house")).expect("make the asset tree");
    let root = dir.to_string_lossy().to_string();
    // With neither file there, a name is read as the SVG it would have been drawn as.
    assert_eq!(source_path(&root, "house_block"), "/assets/house/block.svg");
    fs::write(dir.join("assets/house/block.svg"), "<svg/>").expect("write the svg");
    assert_eq!(source_path(&root, "house_block"), "/assets/house/block.svg");
    // The repainted asset wins while it is there, and the drawing it came from stays.
    fs::write(dir.join("assets/house/block.png"), []).expect("write the png");
    assert_eq!(source_path(&root, "house_block"), "/assets/house/block.png");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn raster_tiles_reads_the_json_or_the_drawing_beside_the_image() {
    let dir = std::env::temp_dir().join("pack_atlas_sidecar_tiles");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("assets/house")).expect("make the asset tree");
    let root = dir.to_string_lossy().to_string();
    let source = "/assets/house/block_viking.png";
    assert_eq!(raster_tiles(&root, source), None, "nothing beside it yet");
    // A repaint takes the footprint of the drawing it overrides.
    fs::write(
        dir.join("assets/house/block_viking.svg"),
        r#"<svg data-tiles="1x1x2"/>"#,
    )
    .expect("write the drawing");
    assert_eq!(raster_tiles(&root, source), Some("1x1x2".to_owned()));
    fs::write(
        dir.join("assets/house/block_viking.json"),
        r#"{"tiles": "2x1x2"}"#,
    )
    .expect("write the sidecar");
    assert_eq!(
        raster_tiles(&root, source),
        Some("2x1x2".to_owned()),
        "the sidecar wins over the drawing"
    );
    // An SVG source carries its footprint itself.
    assert_eq!(raster_tiles(&root, "/assets/house/block.svg"), None);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn opaque_bounds_is_the_box_of_the_drawn_pixels() {
    let mut image = RgbaImage::new(8, 6);
    assert_eq!(opaque_bounds(&image), None, "nothing is drawn");
    image.put_pixel(2, 1, image::Rgba([1, 2, 3, 255]));
    image.put_pixel(5, 4, image::Rgba([1, 2, 3, 255]));
    assert_eq!(opaque_bounds(&image), Some((2, 1, 6, 5)));
    assert_eq!(trim(&image).dimensions(), (4, 4));
}

#[test]
fn path_for_manifest_joins_components_with_forward_slashes() {
    assert_eq!(
        path_for_manifest(Path::new("content/images/atlas.png")),
        "content/images/atlas.png"
    );
    assert_eq!(
        path_for_manifest(Path::new("content/images/sheets/player-16_walk.png")),
        "content/images/sheets/player-16_walk.png"
    );
}
