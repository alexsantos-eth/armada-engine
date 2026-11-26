//! Tests for reading the pieces an entity is built from.

use super::*;

fn json(color: &str) -> String {
    format!(
        r#"{{"schemaVersion":1,"voxelsPerTile":128,"voxelsPerBlock":85,"entities":{{
        "tree/block_2":{{"tiles":[1,1,2],"parts":[
            {{"piece":"trunk","variant":"brown","at":[0,0,0],
              "boxes":[{{"c":[0,0,14],"h":[7,7,14],"color":"{color}"}}]}}]}}}}}}"#
    )
}

#[test]
fn reads_the_parts_of_an_entity() {
    let catalog = parse_parts(&json("8a5a30")).unwrap();
    let tree = catalog.of_sprite("/assets/tree/block_2.png").unwrap();
    assert_eq!(tree.tiles, [1, 1, 2]);
    assert_eq!(tree.parts.len(), 1);
    assert_eq!(tree.parts[0].piece, "trunk");
    assert_eq!(tree.parts[0].boxes[0].color, 0x8a5a30);
    assert_eq!(tree.parts[0].boxes[0].half, [7.0, 7.0, 14.0]);
}

#[test]
fn finds_a_sprite_with_or_without_its_folder_and_extension() {
    assert_eq!(parts_key("/assets/tree/block_2.png"), "tree/block_2");
    assert_eq!(parts_key("tree/block_2.svg"), "tree/block_2");
    assert_eq!(parts_key("tree/block_2"), "tree/block_2");
    let catalog = parse_parts(&json("8a5a30")).unwrap();
    assert!(catalog.of_sprite("/assets/tree/block_3.png").is_none());
    assert_eq!(catalog.len(), 1);
}

#[test]
fn rejects_a_bad_colour_and_other_units() {
    assert!(matches!(
        parse_parts(&json("8a5a3")),
        Err(PartsError::Color(_))
    ));
    assert!(matches!(
        parse_parts(&json("zzzzzz")),
        Err(PartsError::Color(_))
    ));
    let other = json("8a5a30").replace("\"voxelsPerTile\":128", "\"voxelsPerTile\":64");
    assert!(matches!(parse_parts(&other), Err(PartsError::Units)));
    assert!(matches!(parse_parts("{}"), Err(PartsError::Json(_))));
}

#[test]
fn the_models_axes_run_the_other_way_to_the_grids() {
    let point = model_to_grid(64.0, 0.0);
    assert_eq!((point.x, point.y), (0.0, -0.5));
    let point = model_to_grid(0.0, -128.0);
    assert_eq!((point.x, point.y), (1.0, 0.0));
}

#[test]
fn the_packed_entities_read_and_cover_every_harvestable_sprite() {
    let catalog = parse_parts(include_str!("../../../../content/json/entity-parts.json")).unwrap();
    assert!(!catalog.is_empty());
    for (key, entity) in &catalog.entities {
        assert!(!entity.parts.is_empty(), "{key} has no parts");
        assert!(
            entity.parts.iter().all(|part| !part.boxes.is_empty()),
            "{key}"
        );
    }
}
