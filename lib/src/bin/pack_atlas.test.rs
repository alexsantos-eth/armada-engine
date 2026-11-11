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
    assert_eq!(source_path("house_block"), "/assets/house/block.svg");
    assert_eq!(
        source_path("cloud_cloud-shadow"),
        "/assets/cloud/cloud-shadow.svg"
    );
    assert_eq!(source_path("block"), "/assets/block.svg");
    assert_eq!(source_path("a_"), "/assets/a.svg");
}

#[test]
fn path_for_manifest_joins_components_with_forward_slashes() {
    assert_eq!(
        path_for_manifest(Path::new("content/atlas.png")),
        "content/atlas.png"
    );
    assert_eq!(
        path_for_manifest(Path::new("content/sheets/player-16_walk.png")),
        "content/sheets/player-16_walk.png"
    );
}
