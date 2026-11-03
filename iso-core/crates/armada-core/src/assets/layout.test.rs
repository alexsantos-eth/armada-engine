use super::{SpriteLayout, sprite_layout};
use crate::entities::EntityLengthAxis;
use crate::projection::{ProjectionConfig, ScreenPoint};

fn config() -> ProjectionConfig {
    ProjectionConfig {
        tile_width: 80.0,
        tile_height: 40.0,
        elevation_step: Some(25.0),
        origin_x: 0.0,
        origin_y: 0.0,
    }
}

fn ground() -> ScreenPoint {
    ScreenPoint { x: 0.0, y: 0.0 }
}

/// The artwork's bottom is the south corner of the ground diamond and its top is one tile plus
/// `height` steps above that, whatever the frame's own aspect ratio is.
fn artwork_bounds(layout: SpriteLayout, artwork_height: f64) -> (f64, f64) {
    let centre_y = layout.y + layout.size / 2.0;
    (centre_y - artwork_height / 2.0, centre_y + artwork_height / 2.0)
}

#[test]
fn a_single_block_is_drawn_one_tile_wide_over_the_ground_it_stands_on() {
    let layout = sprite_layout(ground(), 1, 1, EntityLengthAxis::X, config());
    // One tile across, so the square is a tile wide; the artwork is 40 + 25 = 65 tall inside it.
    assert_eq!(layout, SpriteLayout { x: -40.0, y: -52.5, size: 80.0 });
    let (top, bottom) = artwork_bounds(layout, 65.0);
    assert_eq!(bottom, 20.0, "artwork rests on the ground diamond's south corner");
    assert_eq!(top, -45.0, "one tile height plus one elevation step above it");
}

#[test]
fn a_tall_block_is_sized_by_its_height_not_by_its_footprint() {
    // Six storeys: 40 + 6 * 25 = 190 tall, taller than the 80 it is wide, so the frame — which
    // was fitted to the artwork's longer side — is drawn 190 across.
    let layout = sprite_layout(ground(), 1, 6, EntityLengthAxis::X, config());
    assert_eq!(layout.size, 190.0);
    let (top, bottom) = artwork_bounds(layout, 190.0);
    assert_eq!((top, bottom), (-170.0, 20.0));
    assert_eq!(layout.x, -95.0, "still centred over its one cell");
}

#[test]
fn a_long_footprint_widens_the_sprite_and_shifts_it_along_its_axis() {
    let along_x = sprite_layout(ground(), 3, 1, EntityLengthAxis::X, config());
    let along_y = sprite_layout(ground(), 3, 1, EntityLengthAxis::Y, config());
    // Three cells span four half-tiles across: 160 wide, 105 tall, so the square is 160.
    assert_eq!(along_x.size, 160.0);
    assert_eq!(along_y.size, 160.0);
    // The two run in opposite screen directions from the same anchor cell.
    let centre_x = |l: SpriteLayout| l.x + l.size / 2.0;
    assert_eq!(centre_x(along_x), 40.0);
    assert_eq!(centre_x(along_y), -40.0);
    // Both reach the same height, since x and y rise equally on screen.
    assert_eq!(along_x.y, along_y.y);
    assert_eq!(artwork_bounds(along_x, 105.0), (-85.0, 20.0));
}

#[test]
fn ground_position_translates_the_sprite_unchanged() {
    let at_origin = sprite_layout(ground(), 2, 2, EntityLengthAxis::X, config());
    let moved = sprite_layout(
        ScreenPoint { x: 300.0, y: -120.0 },
        2,
        2,
        EntityLengthAxis::X,
        config(),
    );
    assert_eq!(moved.size, at_origin.size);
    assert_eq!(moved.x - at_origin.x, 300.0);
    assert_eq!(moved.y - at_origin.y, -120.0);
}

#[test]
fn missing_elevation_step_falls_back_to_half_a_tile_height() {
    let config = ProjectionConfig {
        elevation_step: None,
        ..config()
    };
    let layout = sprite_layout(ground(), 1, 1, EntityLengthAxis::X, config);
    // 40 + 20 = 60 tall, still 80 wide.
    assert_eq!(layout.size, 80.0);
    assert_eq!(artwork_bounds(layout, 60.0), (-40.0, 20.0));
}

/// A blueprint with a nonsensical footprint must not produce a sprite of zero or negative size.
#[test]
fn degenerate_footprints_are_clamped() {
    let flat = sprite_layout(ground(), 1, 0, EntityLengthAxis::X, config());
    assert_eq!(flat.size, 80.0);
    let broken = sprite_layout(ground(), -4, -4, EntityLengthAxis::X, config());
    assert_eq!(broken, sprite_layout(ground(), 1, 0, EntityLengthAxis::X, config()));
}
