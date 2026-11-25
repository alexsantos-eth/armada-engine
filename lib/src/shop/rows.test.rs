//! Tests for the rows of the shop and the trades behind them.

use super::*;
use iso::economy::parse_economy;

fn world() -> (ItemCatalog, EconomyCatalog) {
    let entities: iso::entities::EntityCatalog =
        serde_json::from_str(include_str!("../../content/json/entities.json")).unwrap();
    let items =
        iso::items::parse_items(include_str!("../../content/json/items.json"), &entities).unwrap();
    let economy = parse_economy(
        include_str!("../../content/json/economy.json"),
        &items,
        &entities,
    )
    .unwrap();
    (items, economy)
}

fn market(economy: &EconomyCatalog) -> Market {
    Market::open(economy, 11, 0)
}

#[test]
fn the_sell_tab_lists_what_is_carried_and_paid_for() {
    let (items, economy) = world();
    let market = market(&economy);
    let mut carried = Carried::starting(6, &items);
    carried.inventory.add("wood", 70, &items);
    carried.inventory.add("stone", 4, &items);
    let wallet = Wallet::default();
    let stock = ShopStock {
        carried: &carried,
        wallet: &wallet,
        market: &market,
        economy: &economy,
        items: &items,
    };
    let sell = rows(Tab::Sell, &stock);
    let names: Vec<_> = sell.iter().map(|row| row.name.as_str()).collect();
    assert_eq!(names, ["Piedra", "Madera"].map(str::to_owned));
    assert_eq!(sell[1].detail, "x70", "two slots of wood are one row");
    let unit = u64::from(market.sell_price(&economy, "wood").unwrap());
    assert_eq!(sell[1].coins, unit * 70);
    assert!(sell.iter().all(|row| row.enabled && row.note.is_none()));
}

#[test]
fn the_buy_tab_shows_the_shelf_and_greys_out_what_cannot_be_bought() {
    let (items, economy) = world();
    let market = market(&economy);
    let mut carried = Carried::starting(6, &items);
    let owned = market.offers()[0].tool.clone();
    carried.toolbelt.give(&owned, &items);
    let wallet = Wallet::with(0);
    let stock = ShopStock {
        carried: &carried,
        wallet: &wallet,
        market: &market,
        economy: &economy,
        items: &items,
    };
    let buy = rows(Tab::Buy, &stock);
    assert_eq!(buy.len(), market.offers().len());
    assert_eq!(buy[0].note, Some("Ya la tienes"));
    assert!(!buy[0].enabled);
    // Too poor for it: greyed out, with no words about why.
    assert_eq!(buy[1].note, None);
    assert!(!buy[1].enabled);
    assert!(
        buy.iter()
            .all(|row| row.is_tool && row.icon.starts_with("tool_"))
    );
}

#[test]
fn choosing_a_row_trades_and_says_so() {
    let (items, economy) = world();
    let market = market(&economy);
    let mut carried = Carried::starting(6, &items);
    carried.inventory.add("wood", 5, &items);
    let mut wallet = Wallet::default();
    let stock = ShopStock {
        carried: &carried,
        wallet: &wallet,
        market: &market,
        economy: &economy,
        items: &items,
    };
    let sale = rows(Tab::Sell, &stock).remove(0);
    let said = trade(&sale, &mut carried, &mut wallet, &market, &economy, &items).unwrap();
    assert!(said.starts_with("Vendiste Madera por "), "{said}");
    assert_eq!(carried.inventory.count("wood"), 0);
    assert_eq!(wallet.coins(), sale.coins);
    // Selling the same row again finds nothing to sell.
    assert_eq!(
        trade(&sale, &mut carried, &mut wallet, &market, &economy, &items),
        Err("No hay nada que vender")
    );
    let offer = market.offers()[0].clone();
    let mut rich = Wallet::with(10_000);
    let pick = ShopRow {
        action: RowAction::Buy {
            tool: offer.tool.clone(),
        },
        icon: String::new(),
        is_tool: true,
        name: offer.tool.clone(),
        detail: String::new(),
        coins: u64::from(offer.coins),
        enabled: true,
        note: None,
    };
    let said = trade(&pick, &mut carried, &mut rich, &market, &economy, &items).unwrap();
    assert!(said.starts_with("Compraste "), "{said}");
    assert_eq!(rich.coins(), 10_000 - u64::from(offer.coins));
    assert_eq!(
        trade(&pick, &mut carried, &mut rich, &market, &economy, &items),
        Err("Ya la tienes")
    );
}
