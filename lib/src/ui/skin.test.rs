//! Tests for reading the exported kit's manifest.

use super::*;

const MANIFEST: &str = include_str!("../../content/ui/ui.json");

#[test]
fn the_committed_manifest_has_every_piece_the_hud_draws() {
    let manifest = parse_manifest(MANIFEST).unwrap();
    for name in REQUIRED_PIECES {
        assert!(manifest.pieces.contains_key(*name), "missing piece {name}");
    }
    assert_eq!(manifest.scale, 2.0);
    assert_eq!(manifest.items, "ui/items");
}

#[test]
fn colours_are_read_from_the_css_tokens() {
    let manifest = parse_manifest(MANIFEST).unwrap();
    let palette = manifest.palette().unwrap();
    assert_eq!(palette.ink, [0x1a, 0x12, 0x0d]);
    assert_eq!(palette.red, [0xe0, 0x54, 0x3a]);
}

#[test]
fn a_missing_piece_or_a_bad_version_is_an_error() {
    assert!(
        parse_manifest(
            r#"{"schemaVersion":1,"scale":2,"items":"ui/items","colors":{},"pieces":{}}"#
        )
        .is_err()
    );
    let newer = MANIFEST.replacen("\"schemaVersion\": 1", "\"schemaVersion\": 9", 1);
    assert!(parse_manifest(&newer).is_err());
}

#[test]
fn hex_colours_parse_with_or_without_the_hash() {
    assert_eq!(hex_rgb("#ff8000"), Some([255, 128, 0]));
    assert_eq!(hex_rgb("ff8000"), Some([255, 128, 0]));
    assert_eq!(hex_rgb("#fff"), None);
}
