use super::*;

const PROJECTION: ProjectionConfig = ProjectionConfig {
    tile_width: 40.0,
    tile_height: 20.0,
    elevation_step: None,
    origin_x: 0.0,
    origin_y: 0.0,
};
const VIEWPORT: ScreenSize = ScreenSize {
    width: 800.0,
    height: 600.0,
};

fn chunk(cx: i32, cy: i32) -> ChunkCoord {
    ChunkCoord { cx, cy }
}

#[test]
fn culling_margin_and_movement_follow_screen_axes() {
    assert_eq!(
        cull_rect(VIEWPORT, 0.25),
        ScreenRect {
            x: -200.0,
            y: -150.0,
            width: 1200.0,
            height: 900.0
        }
    );
    let start = Camera {
        x: 0.0,
        y: 0.0,
        zoom: 2.0,
    };
    assert!(needs_cull(None, start, VIEWPORT, PROJECTION, 0.25));
    assert!(!needs_cull(
        Some(start),
        Camera {
            x: 2.5,
            y: -2.5,
            zoom: 2.0
        },
        VIEWPORT,
        PROJECTION,
        0.25
    ));
    assert!(needs_cull(
        Some(start),
        Camera {
            x: 2.6,
            y: -2.6,
            zoom: 2.0
        },
        VIEWPORT,
        PROJECTION,
        0.25
    ));
}

#[test]
fn visible_chunks_match_documented_camera_examples() {
    assert_eq!(
        visible_chunks(
            Camera {
                x: 15.5,
                y: 15.5,
                zoom: 4.0
            },
            VIEWPORT,
            PROJECTION,
            CHUNK_VIEW_MARGIN
        ),
        vec![chunk(0, 0)]
    );
    assert_eq!(
        visible_chunks(
            Camera {
                x: 31.5,
                y: 31.5,
                zoom: 4.0
            },
            VIEWPORT,
            PROJECTION,
            0.0
        ),
        vec![chunk(0, 0), chunk(1, 0), chunk(0, 1), chunk(1, 1)]
    );
    assert_eq!(
        visible_chunks(
            Camera {
                x: 15.5,
                y: 15.5,
                zoom: 1.0
            },
            VIEWPORT,
            PROJECTION,
            CHUNK_VIEW_MARGIN
        ),
        vec![
            chunk(0, 0),
            chunk(0, -1),
            chunk(-1, 0),
            chunk(1, 0),
            chunk(0, 1),
            chunk(-1, -1),
            chunk(1, 1)
        ]
    );
}
