//! Integration test for the item catalogue.
//! Loads `content/json/items.json` against the shipped entity catalogue, the way the client does,
//! and checks the first loop of the game: a new player can fell a tree and break a rock.

use iso::harvest::{HarvestInput, HarvestStatus, HarvestTarget, Harvester};
use iso::inventory::{Carried, STARTING_SLOTS};
use iso::items::{ItemCatalog, parse_items};

fn items() -> ItemCatalog {
    let entities: iso::entities::EntityCatalog =
        serde_json::from_str(include_str!("../../../content/json/entities.json"))
            .expect("the entity catalog is valid JSON");
    parse_items(include_str!("../../../content/json/items.json"), &entities)
        .expect("the shipped item content validates")
}

fn gather(blueprint: &str, carried: &Carried, items: &ItemCatalog) -> HarvestStatus {
    let target = HarvestTarget {
        id: format!("{blueprint}@0,0"),
        anchor: iso::grid::WorldCoord { x: 0, y: 0 },
        blueprint: blueprint.to_owned(),
        elevation: 0,
        nearest: iso::grid::WorldCoord { x: 1, y: 0 },
        gap: 0.0,
        in_reach: true,
    };
    let mut harvester = Harvester::default();
    let mut status = HarvestStatus::Idle;
    for _ in 0..1_000 {
        status = harvester.step(
            HarvestInput {
                held: true,
                target: Some(&target),
                ticks: 1,
            },
            carried,
            items,
        );
        if !matches!(status, HarvestStatus::Working { .. }) {
            break;
        }
    }
    status
}

#[test]
fn a_new_player_gathers_wood_stone_and_fiber() {
    let items = items();
    let carried = Carried::starting(STARTING_SLOTS, &items);
    for (blueprint, item) in [
        ("tree", "wood"),
        ("rock_small", "stone"),
        ("tall_grass", "fiber"),
    ] {
        let HarvestStatus::Done { yields, .. } = gather(blueprint, &carried, &items) else {
            panic!("a new player could not gather {blueprint}");
        };
        assert_eq!(yields[0].item, item);
    }
}

#[test]
fn ore_and_large_groves_wait_for_better_tools() {
    let items = items();
    let carried = Carried::starting(STARTING_SLOTS, &items);
    for blueprint in ["ore_vein", "grove_x"] {
        assert!(
            matches!(
                gather(blueprint, &carried, &items),
                HarvestStatus::Blocked { .. }
            ),
            "{blueprint} should need a better tool"
        );
    }
}

#[test]
fn every_gatherable_entity_has_a_collectable_piece_for_each_item_it_yields() {
    let entities: iso::entities::EntityCatalog =
        serde_json::from_str(include_str!("../../../content/json/entities.json")).unwrap();
    let items = items();
    let parts =
        iso::debris::parse_parts(include_str!("../../../content/json/entity-parts.json")).unwrap();
    for entity in &entities.entities {
        let Some(rule) = items.harvest_rule(&entity.id) else {
            continue;
        };
        let built = parts
            .of_sprite(&entity.asset.sprite)
            .unwrap_or_else(|| panic!("{} has no parts", entity.id));
        for gained in &rule.yields {
            let names = &items.item(&gained.item).unwrap().pieces;
            assert!(
                built
                    .parts
                    .iter()
                    .any(|part| part.collect && names.contains(&part.piece)),
                "{} has no collectable piece for {}",
                entity.id,
                gained.item
            );
        }
    }
}
