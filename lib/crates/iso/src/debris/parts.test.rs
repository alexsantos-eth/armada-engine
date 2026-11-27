//! Tests for reading the pieces an entity is built from.

use super::*;

fn json() -> String {
    r#"{"schemaVersion":1,"voxelsPerTile":128,"voxelsPerBlock":85,"entities":{
        "tree/block_2":{"tiles":[1,1,2],"parts":[
            {"piece":"trunk","at":[0,0,0],"sprite":"debris/p_0123456789"}]}}}"#
        .to_owned()
}

#[test]
fn reads_the_parts_of_an_entity() {
    let catalog = parse_parts(&json()).unwrap();
    let tree = catalog.of_sprite("/assets/tree/block_2.png").unwrap();
    assert_eq!(tree.tiles, [1, 1, 2]);
    assert_eq!(tree.parts.len(), 1);
    assert_eq!(tree.parts[0].piece, "trunk");
    assert_eq!(tree.parts[0].sprite, "debris/p_0123456789");
}

#[test]
fn finds_a_sprite_with_or_without_its_folder_and_extension() {
    assert_eq!(parts_key("/assets/tree/block_2.png"), "tree/block_2");
    assert_eq!(parts_key("tree/block_2.svg"), "tree/block_2");
    assert_eq!(parts_key("tree/block_2"), "tree/block_2");
    let catalog = parse_parts(&json()).unwrap();
    assert!(catalog.of_sprite("/assets/tree/block_3.png").is_none());
    assert_eq!(catalog.len(), 1);
}

#[test]
fn rejects_other_units_and_other_json() {
    let other = json().replace("\"voxelsPerTile\":128", "\"voxelsPerTile\":64");
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
            entity
                .parts
                .iter()
                .all(|part| part.sprite.starts_with("debris/p_")),
            "{key}"
        );
    }
}

#[test]
fn every_piece_sprite_is_in_the_atlas_manifest() {
    let catalog = parse_parts(include_str!("../../../../content/json/entity-parts.json")).unwrap();
    let manifest = include_str!("../../../../content/json/assets.manifest.json");
    for (key, entity) in &catalog.entities {
        for part in &entity.parts {
            assert!(
                manifest.contains(&format!("\"/assets/{}\"", part.sprite))
                    || manifest.contains(&format!("/assets/{}.", part.sprite)),
                "{key}: {} is not in the atlas",
                part.sprite
            );
        }
    }
}

#[test]
fn every_collectable_piece_has_its_inked_twin_in_the_atlas() {
    let catalog = parse_parts(include_str!("../../../../content/json/entity-parts.json")).unwrap();
    let manifest = include_str!("../../../../content/json/assets.manifest.json");
    for (key, entity) in &catalog.entities {
        for part in entity.parts.iter().filter(|part| part.collect) {
            let inked = crate::drops::inked_sprite(&part.sprite);
            assert_ne!(
                inked, part.sprite,
                "{key}: {} has no inked twin",
                part.sprite
            );
            assert!(
                manifest.contains(&format!("/assets/{inked}.")),
                "{key}: {inked} is not in the atlas"
            );
        }
    }
}

#[test]
fn a_piece_sprite_turns_into_its_inked_twin() {
    assert_eq!(
        crate::drops::inked_sprite("debris/p_0123456789"),
        "debris/i_0123456789"
    );
    assert_eq!(crate::drops::inked_sprite("tree/block_2"), "tree/block_2");
}

#[test]
fn a_patch_of_mushrooms_only_lets_its_big_toadstools_be_collected() {
    let catalog = parse_parts(include_str!("../../../../content/json/entity-parts.json")).unwrap();
    let patch = catalog
        .of_sprite("/assets/field/block_mushrooms.png")
        .unwrap();
    let collectable: Vec<&str> = patch
        .parts
        .iter()
        .filter(|part| part.collect)
        .map(|part| part.piece.as_str())
        .collect();
    assert_eq!(collectable, ["toadstool"; 4]);
}
