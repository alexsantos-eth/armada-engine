//! Tests for the wallet and the two trades.

use super::*;
use crate::economy::catalog::tests::{economy, items};

fn market() -> Market {
    // A planet at 100% (spread 20 and a seed found below) keeps the arithmetic readable.
    let economy = economy();
    (0..500)
        .map(|seed| Market::open(&economy, seed, 0))
        .find(|market| market.percent() == 100 && market.offers().len() == 2)
        .unwrap()
}

fn market_of(tool: &str) -> Market {
    let economy = economy();
    (0..500)
        .flat_map(|seed| (0..20).map(move |day| (seed, day)))
        .map(|(seed, day)| Market::open(&economy, seed, day))
        .find(|market| market.percent() == 100 && market.offer(tool).is_some())
        .unwrap()
}

#[test]
fn a_wallet_earns_and_spends_within_what_it_has() {
    let mut wallet = Wallet::default();
    wallet.earn(10);
    assert!(wallet.spend(4));
    assert_eq!(wallet.coins(), 6);
    assert!(!wallet.spend(7));
    assert_eq!(wallet.coins(), 6);
    wallet.earn(u64::MAX);
    assert_eq!(wallet.coins(), u64::MAX);
}

#[test]
fn selling_takes_the_units_and_pays_for_them() {
    let (items, economy, market) = (items(), economy(), market());
    let mut inventory = Inventory::new(4);
    inventory.add("wood", 7, &items);
    let mut wallet = Wallet::default();
    let earned = sell_item(&mut inventory, &mut wallet, &market, &economy, "wood", 5).unwrap();
    assert_eq!(earned, 10);
    assert_eq!(wallet.coins(), 10);
    assert_eq!(inventory.count("wood"), 2);
}

#[test]
fn selling_more_than_carried_sells_what_there_is() {
    let (items, economy, market) = (items(), economy(), market());
    let mut inventory = Inventory::new(4);
    inventory.add("stone", 2, &items);
    let mut wallet = Wallet::default();
    let earned = sell_item(&mut inventory, &mut wallet, &market, &economy, "stone", 99).unwrap();
    assert_eq!(earned, 6);
    assert_eq!(inventory.count("stone"), 0);
}

#[test]
fn what_villages_do_not_buy_or_the_player_lacks_is_not_sold() {
    let (items, economy, market) = (items(), economy(), market());
    let mut inventory = Inventory::new(4);
    inventory.add("fiber", 3, &items);
    let mut wallet = Wallet::default();
    assert_eq!(
        sell_item(&mut inventory, &mut wallet, &market, &economy, "fiber", 1),
        Err(TradeError::NothingToSell)
    );
    assert_eq!(
        sell_item(&mut inventory, &mut wallet, &market, &economy, "wood", 1),
        Err(TradeError::NothingToSell)
    );
    assert_eq!(inventory.count("fiber"), 3);
    assert_eq!(wallet.coins(), 0);
}

#[test]
fn buying_a_tool_spends_the_coins_and_gives_the_tool() {
    let items = items();
    let market = market_of("copper_pickaxe");
    let mut belt = Toolbelt::starting(&items);
    let mut wallet = Wallet::with(130);
    let price = buy_tool(&mut belt, &mut wallet, &market, &items, "copper_pickaxe").unwrap();
    assert_eq!(price, 100);
    assert_eq!(wallet.coins(), 30);
    assert!(belt.tools().iter().any(|tool| tool == "copper_pickaxe"));
}

#[test]
fn a_tool_cannot_be_bought_without_the_coins_twice_or_off_the_shelf() {
    let items = items();
    let market = market_of("copper_pickaxe");
    let mut belt = Toolbelt::starting(&items);
    let mut wallet = Wallet::with(99);
    assert_eq!(
        buy_tool(&mut belt, &mut wallet, &market, &items, "copper_pickaxe"),
        Err(TradeError::TooPoor)
    );
    assert_eq!(wallet.coins(), 99);
    assert_eq!(
        buy_tool(&mut belt, &mut wallet, &market, &items, "laser"),
        Err(TradeError::NotOffered)
    );
    let mut rich = Wallet::with(500);
    buy_tool(&mut belt, &mut rich, &market, &items, "copper_pickaxe").unwrap();
    assert_eq!(
        buy_tool(&mut belt, &mut rich, &market, &items, "copper_pickaxe"),
        Err(TradeError::AlreadyOwned)
    );
    assert_eq!(rich.coins(), 400);
}
