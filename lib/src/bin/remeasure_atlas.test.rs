use super::*;
use image::Rgba;

fn frame() -> SpriteFrame {
    SpriteFrame {
        x: 2,
        y: 2,
        width: 6,
        height: 6,
    }
}

#[test]
fn opaque_bounds_finds_the_content_inside_the_frame() {
    let mut atlas = RgbaImage::new(10, 10);
    atlas.put_pixel(5, 3, Rgba([255, 0, 0, 255]));
    atlas.put_pixel(6, 7, Rgba([255, 0, 0, 255]));
    assert_eq!(
        opaque_bounds(&atlas, frame()),
        Some(SpriteFrame {
            x: 5,
            y: 3,
            width: 2,
            height: 5,
        })
    );
}

#[test]
fn opaque_bounds_is_none_when_the_frame_is_transparent() {
    let atlas = RgbaImage::new(10, 10);
    assert_eq!(opaque_bounds(&atlas, frame()), None);
}

#[test]
fn opaque_bounds_ignores_what_is_outside_the_frame() {
    let mut atlas = RgbaImage::new(10, 10);
    atlas.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
    assert_eq!(opaque_bounds(&atlas, frame()), None);
}

#[test]
fn opaque_bounds_clamps_a_frame_that_reaches_past_the_atlas() {
    let mut atlas = RgbaImage::new(8, 8);
    atlas.put_pixel(7, 7, Rgba([0, 0, 0, 200]));
    let oversized = SpriteFrame {
        x: 6,
        y: 6,
        width: 100,
        height: 100,
    };
    assert_eq!(
        opaque_bounds(&atlas, oversized),
        Some(SpriteFrame {
            x: 7,
            y: 7,
            width: 1,
            height: 1,
        })
    );
}
