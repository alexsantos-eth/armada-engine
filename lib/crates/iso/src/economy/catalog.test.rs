//! Tests for the economy content and the market a planet and a day make of it.

use super::*;
use crate::entities::EntityCatalog;
use crate::items::catalog::tests::{catalog_json, entities};
use crate::items::{ItemCatalog, parse_items};

pub(crate) fn items() -> ItemCatalog {
    parse_items(catalog_json(), &entities()).unwrap()
}

/// The item fixtures' entities plus a market stall.
pub(crate) fn world_entities() -> EntityCatalog {
    let mut catalog = entities();
    let mut stall = catalog.entities[0].clone();
    "market_stall".clone_into(&mut stall.id);
    catalog.entities.push(stall);
    catalog
}

pub(crate) fn economy_json() -> &'static str {
    r#"{
        "schemaVersion": 1,
        "currency": "Monedas",
        "merchants": ["market_stall"],
        "planetSpread": 20,
        "catalogSize": 2,
        "prices": [
            { "item": "wood", "coins": 2 },
            { "item": "stone", "coins": 3 },
            { "item": "copper_ore", "coins": 12 }
        ],
        "goods": [
            { "tool": "flint_axe", "coins": 10 },
            { "tool": "stone_pickaxe", "coins": 20 },
            { "tool": "copper_pickaxe", "coins": 100 }
        ]
    }"#
}

pub(crate) fn economy() -> EconomyCatalog {
    parse_economy(economy_json(), &items(), &world_entities()).unwrap()
}

fn with(edit: impl FnOnce(&mut serde_json::Value)) -> String {
    let mut value: serde_json::Value = serde_json::from_str(economy_json()).unwrap();
    edit(&mut value);
    value.to_string()
}

fn parse(json: &str) -> Result<EconomyCatalog, EconomyError> {
    parse_economy(json, &items(), &world_entities())
}

#[test]
fn the_fixture_parses() {
    let economy = economy();
    assert_eq!(economy.currency(), "Monedas");
    assert!(economy.is_merchant("market_stall"));
    assert!(!economy.is_merchant("tree"));
    assert_eq!(economy.base_price("stone"), Some(3));
    assert_eq!(economy.base_price("fiber"), None);
    assert_eq!(economy.goods().len(), 3);
    assert_eq!(economy.catalog_size(), 2);
}

#[test]
fn the_shipped_content_validates() {
    let entities: EntityCatalog =
        serde_json::from_str(include_str!("../../../../content/json/entities.json")).unwrap();
    let items = parse_items(
        include_str!("../../../../content/json/items.json"),
        &entities,
    )
    .unwrap();
    let economy = parse_economy(
        include_str!("../../../../content/json/economy.json"),
        &items,
        &entities,
    )
    .unwrap();
    for id in items.item_ids() {
        assert!(economy.base_price(id).is_some(), "{id} has no price");
    }
    for good in economy.goods() {
        assert!(
            !items.starting_tools().contains(&good.tool),
            "{} is a starting tool and is not worth selling",
            good.tool
        );
    }
}

#[test]
fn bad_content_is_refused_by_name() {
    fn set(path: &'static str, value: serde_json::Value) -> impl FnOnce(&mut serde_json::Value) {
        move |json| *json.pointer_mut(path).unwrap() = value
    }
    assert!(matches!(
        parse(&with(set("/schemaVersion", 2.into()))),
        Err(EconomyError::UnsupportedSchema { found: 2, .. })
    ));
    assert_eq!(
        parse(&with(set("/currency", " ".into()))),
        Err(EconomyError::EmptyCurrency)
    );
    assert_eq!(
        parse(&with(set("/merchants", serde_json::json!([])))),
        Err(EconomyError::NoMerchants)
    );
    assert_eq!(
        parse(&with(set("/merchants/0", "ghost".into()))),
        Err(EconomyError::UnknownMerchant { id: "ghost".into() })
    );
    assert_eq!(
        parse(&with(set("/merchants/0", "rabbit".into()))),
        Err(EconomyError::UnknownMerchant {
            id: "rabbit".into()
        })
    );
    assert_eq!(
        parse(&with(set("/planetSpread", 95.into()))),
        Err(EconomyError::SpreadTooWide { found: 95 })
    );
    assert_eq!(
        parse(&with(set("/catalogSize", 0.into()))),
        Err(EconomyError::EmptyCatalog)
    );
    assert_eq!(
        parse(&with(set("/prices/0/item", "gold".into()))),
        Err(EconomyError::UnknownItem { id: "gold".into() })
    );
    assert_eq!(
        parse(&with(set("/prices/0/coins", 0.into()))),
        Err(EconomyError::FreePrice { id: "wood".into() })
    );
    assert_eq!(
        parse(&with(set("/prices/1/item", "wood".into()))),
        Err(EconomyError::Duplicate { id: "wood".into() })
    );
    assert_eq!(
        parse(&with(set("/goods/0/tool", "laser".into()))),
        Err(EconomyError::UnknownTool { id: "laser".into() })
    );
    assert_eq!(
        parse(&with(set("/goods/1/tool", "flint_axe".into()))),
        Err(EconomyError::Duplicate {
            id: "flint_axe".into()
        })
    );
    assert!(matches!(parse("{"), Err(EconomyError::Json(_))));
}

#[test]
fn a_market_is_a_function_of_the_seed_and_the_day() {
    let economy = economy();
    assert_eq!(
        Market::open(&economy, 7, 3),
        Market::open(&economy, 7, 3),
        "same planet, same day"
    );
    let days: Vec<_> = (0..12)
        .map(|day| Market::open(&economy, 7, day).offers().to_vec())
        .collect();
    assert!(
        days.windows(2).any(|pair| pair[0] != pair[1]),
        "the shelf rotates with the days"
    );
    let planets: Vec<_> = (0..12)
        .map(|seed| Market::open(&economy, seed, 0).percent())
        .collect();
    assert!(planets.iter().any(|percent| *percent != planets[0]));
}

#[test]
fn a_planet_moves_prices_within_its_spread() {
    let economy = economy();
    for seed in 0..200 {
        let market = Market::open(&economy, seed, 0);
        assert!(
            (80..=120).contains(&market.percent()),
            "{}",
            market.percent()
        );
        assert!(market.sell_price(&economy, "wood").unwrap() >= 1);
    }
}

#[test]
fn the_shelf_holds_the_catalog_size_cheapest_first() {
    let economy = economy();
    for day in 0..10 {
        let market = Market::open(&economy, 1, day);
        assert_eq!(market.day(), day);
        assert_eq!(market.offers().len(), 2);
        assert!(market.offers()[0].coins <= market.offers()[1].coins);
        let tool = &market.offers()[0].tool;
        assert_eq!(market.offer(tool), Some(&market.offers()[0]));
    }
    assert_eq!(Market::open(&economy, 1, 0).offer("laser"), None);
}

#[test]
fn prices_scale_and_never_reach_zero() {
    assert_eq!(scaled(10, 100), 10);
    assert_eq!(scaled(10, 80), 8);
    assert_eq!(scaled(1, 10), 1);
    assert_eq!(scaled(3, 150), 5);
}
