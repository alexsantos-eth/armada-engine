//! Tests for the item catalog: items, tools, harvest rules and their cross-validation.

use super::*;
use crate::entities::EntityCatalog;
use crate::entities::blueprint::*;
use crate::terrain::TerrainMaterial;

pub(crate) fn entities() -> EntityCatalog {
    let blueprint = |id: &str| EntityBlueprint {
        npc: (id == "rabbit").then_some(crate::npc::NpcLogic::Basic),
        id: id.to_owned(),
        asset: EntityAsset {
            sprite: format!("/assets/{id}.png"),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
            draw_under_player: false,
            fire: false,
            effect: None,
        },
        shape: EntityShape {
            height: 1,
            length: 1,
            axis: EntityLengthAxis::X,
            collision: vec![0.5],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            additional_surfaces: vec![],
            road_access: false,
        },
    };
    EntityCatalog {
        schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
        entities: [
            "tree",
            "tree_2",
            "rock_small",
            "tall_grass",
            "ore_vein",
            "rabbit",
        ]
        .into_iter()
        .map(blueprint)
        .collect(),
    }
}

pub(crate) fn catalog_json() -> &'static str {
    r#"{
        "schemaVersion": 1,
        "items": [
            { "id": "wood", "name": "Madera", "stack": 50, "rarity": "common", "color": "a0703c", "sprite": "/assets/items/wood.png" },
            { "id": "stone", "name": "Piedra", "stack": 50, "rarity": "common" },
            { "id": "fiber", "name": "Fibra", "stack": 99, "rarity": "common" },
            { "id": "copper_ore", "name": "Cobre", "stack": 30, "rarity": "rare" }
        ],
        "tools": [
            { "id": "flint_axe", "name": "Hacha de pedernal", "kind": "axe", "tier": 1 },
            { "id": "stone_pickaxe", "name": "Pico de piedra", "kind": "pickaxe", "tier": 1 },
            { "id": "copper_pickaxe", "name": "Pico de cobre", "kind": "pickaxe", "tier": 3 }
        ],
        "startingTools": ["flint_axe", "stone_pickaxe"],
        "harvest": [
            {
                "blueprints": ["tree", "tree_2"],
                "tool": "axe", "tier": 1, "ticks": 40,
                "yields": [{ "item": "wood", "amount": 3 }]
            },
            {
                "blueprints": ["rock_small"],
                "tool": "pickaxe", "tier": 1, "ticks": 30,
                "yields": [{ "item": "stone", "amount": 2 }]
            },
            {
                "blueprints": ["tall_grass"],
                "ticks": 10,
                "yields": [{ "item": "fiber", "amount": 1 }]
            },
            {
                "blueprints": ["ore_vein"],
                "tool": "pickaxe", "tier": 3, "ticks": 60,
                "yields": [{ "item": "copper_ore", "amount": 1 }, { "item": "stone", "amount": 1 }]
            }
        ]
    }"#
}

fn with(edit: impl FnOnce(&mut serde_json::Value)) -> String {
    let mut value: serde_json::Value = serde_json::from_str(catalog_json()).unwrap();
    edit(&mut value);
    value.to_string()
}

fn parsed() -> ItemCatalog {
    parse_items(catalog_json(), &entities()).expect("catalog validates")
}

#[test]
fn parses_items_tools_and_harvest_rules() {
    let catalog = parsed();
    assert_eq!(catalog.item("wood").unwrap().name, "Madera");
    assert_eq!(catalog.item("wood").unwrap().stack, 50);
    assert_eq!(catalog.item("copper_ore").unwrap().rarity, ItemRarity::Rare);
    let axe = catalog.tool("flint_axe").unwrap();
    assert_eq!((axe.kind, axe.tier), (ToolKind::Axe, 1));
    assert_eq!(catalog.starting_tools(), ["flint_axe", "stone_pickaxe"]);
}

#[test]
fn every_listed_blueprint_shares_its_rule() {
    let catalog = parsed();
    let tree = catalog.harvest_rule("tree_2").unwrap();
    assert_eq!(tree.tool, Some(ToolKind::Axe));
    assert_eq!(tree.tier, 1);
    assert_eq!(tree.ticks, 40);
    assert_eq!(tree.yields[0].item, "wood");
    assert_eq!(tree.yields[0].amount, 3);
    assert_eq!(catalog.harvest_rule("tree"), Some(tree));
}

#[test]
fn a_rule_without_a_tool_is_gathered_by_hand() {
    let grass = parsed().harvest_rule("tall_grass").unwrap().clone();
    assert_eq!(grass.tool, None);
    assert_eq!(grass.tier, 0);
}

#[test]
fn an_unlisted_blueprint_has_no_rule() {
    assert_eq!(parsed().harvest_rule("rabbit"), None);
    assert_eq!(parsed().harvest_rule("nothing"), None);
}

#[test]
fn tool_speed_follows_the_tier_table() {
    assert_eq!(tool_speed_tenths(0), 10);
    assert_eq!(tool_speed_tenths(1), 10);
    assert_eq!(tool_speed_tenths(2), 20);
    assert_eq!(tool_speed_tenths(3), 35);
    assert_eq!(tool_speed_tenths(10), 5000);
    assert_eq!(tool_speed_tenths(99), 5000);
}

#[test]
fn rejects_an_unsupported_schema() {
    let json = with(|value| value["schemaVersion"] = 2.into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::UnsupportedSchema {
            found: 2,
            expected: ITEMS_SCHEMA_VERSION
        })
    );
}

#[test]
fn rejects_malformed_json() {
    assert!(matches!(
        parse_items("{", &entities()),
        Err(ItemsError::Json(_))
    ));
}

#[test]
fn rejects_a_repeated_item() {
    let json = with(|value| {
        value["items"][1]["id"] = "wood".into();
    });
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::DuplicateId { id: "wood".into() })
    );
}

#[test]
fn rejects_an_item_that_does_not_stack() {
    let json = with(|value| value["items"][0]["stack"] = 0.into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::InvalidStack { id: "wood".into() })
    );
}

#[test]
fn rejects_a_tool_tier_outside_the_table() {
    let json = with(|value| value["tools"][0]["tier"] = 11.into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::InvalidTier {
            id: "flint_axe".into()
        })
    );
}

#[test]
fn rejects_an_unknown_starting_tool() {
    let json = with(|value| value["startingTools"][0] = "laser".into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::UnknownTool { id: "laser".into() })
    );
}

#[test]
fn rejects_a_blueprint_the_entity_catalog_lacks() {
    let json = with(|value| value["harvest"][0]["blueprints"][0] = "oak".into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::UnknownBlueprint { id: "oak".into() })
    );
}

#[test]
fn rejects_a_blueprint_in_two_rules() {
    let json = with(|value| value["harvest"][1]["blueprints"][0] = "tree".into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::HarvestedTwice { id: "tree".into() })
    );
}

#[test]
fn rejects_harvesting_a_character() {
    let json = with(|value| value["harvest"][2]["blueprints"][0] = "rabbit".into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::HarvestsACharacter {
            id: "rabbit".into()
        })
    );
}

#[test]
fn rejects_a_yield_of_an_unknown_item() {
    let json = with(|value| value["harvest"][0]["yields"][0]["item"] = "gold".into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::UnknownItem { id: "gold".into() })
    );
}

#[test]
fn rejects_an_empty_or_zero_yield() {
    let none = with(|value| value["harvest"][0]["yields"] = serde_json::json!([]));
    assert_eq!(
        parse_items(&none, &entities()),
        Err(ItemsError::InvalidYield { id: "tree".into() })
    );
    let zero = with(|value| value["harvest"][0]["yields"][0]["amount"] = 0.into());
    assert_eq!(
        parse_items(&zero, &entities()),
        Err(ItemsError::InvalidYield { id: "tree".into() })
    );
}

#[test]
fn rejects_a_rule_that_takes_no_work() {
    let json = with(|value| value["harvest"][0]["ticks"] = 0.into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::InvalidWork { id: "tree".into() })
    );
}

#[test]
fn rejects_a_tool_rule_without_a_tier() {
    let json = with(|value| value["harvest"][0]["tier"] = 0.into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::InvalidTier { id: "tree".into() })
    );
}

#[test]
fn rejects_a_hand_rule_with_a_tier() {
    let json = with(|value| value["harvest"][2]["tier"] = 2.into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::InvalidTier {
            id: "tall_grass".into()
        })
    );
}

#[test]
fn an_item_may_carry_the_colour_of_its_chips() {
    let catalog = parsed();
    assert_eq!(catalog.item("wood").unwrap().color(), Some(0xa0703c));
    assert_eq!(catalog.item("stone").unwrap().color(), None);
}

#[test]
fn rejects_a_colour_that_is_not_six_hex_digits() {
    let json = with(|value| value["items"][0]["color"] = "brown".into());
    assert_eq!(
        parse_items(&json, &entities()),
        Err(ItemsError::InvalidColor { id: "wood".into() })
    );
}

#[test]
fn an_item_may_name_the_sprite_of_its_heap_on_the_ground() {
    let catalog = parsed();
    assert_eq!(
        catalog.item("wood").unwrap().sprite.as_deref(),
        Some("/assets/items/wood.png")
    );
    assert_eq!(catalog.item("stone").unwrap().sprite, None);
}
