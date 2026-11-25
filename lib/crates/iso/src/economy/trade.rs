//! Coins and the two ways to trade them: selling what was gathered, buying a tool.

use crate::economy::{EconomyCatalog, Market};
use crate::inventory::{Inventory, Toolbelt};
use crate::items::ItemCatalog;

/// The coins a player has. Money is carried by the player, not by a planet: it survives travel.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Wallet {
    coins: u64,
}

impl Wallet {
    /// A wallet holding `coins`.
    pub const fn with(coins: u64) -> Self {
        Self { coins }
    }

    /// The coins in it.
    pub const fn coins(&self) -> u64 {
        self.coins
    }

    /// Adds coins, stopping at the largest count there is.
    pub fn earn(&mut self, coins: u64) {
        self.coins = self.coins.saturating_add(coins);
    }

    /// Takes `coins` out if there are that many.
    pub fn spend(&mut self, coins: u64) -> bool {
        match self.coins.checked_sub(coins) {
            Some(left) => {
                self.coins = left;
                true
            }
            None => false,
        }
    }
}

/// Why a trade did not happen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TradeError {
    /// Villages do not buy that, or the player does not carry that many.
    NothingToSell,
    /// The tool is not on today's shelf.
    NotOffered,
    /// The tool is already in the belt.
    AlreadyOwned,
    /// The wallet holds fewer coins than the price.
    TooPoor,
}

/// Sells up to `amount` units of `item` at this market and returns the coins earned. Selling
/// less than asked is fine when the player carries less; selling nothing is an error.
pub fn sell_item(
    inventory: &mut Inventory,
    wallet: &mut Wallet,
    market: &Market,
    economy: &EconomyCatalog,
    item: &str,
    amount: u32,
) -> Result<u64, TradeError> {
    let price = market
        .sell_price(economy, item)
        .ok_or(TradeError::NothingToSell)?;
    let units = amount.min(inventory.count(item));
    if units == 0 || !inventory.take(item, units) {
        return Err(TradeError::NothingToSell);
    }
    let coins = u64::from(price) * u64::from(units);
    wallet.earn(coins);
    Ok(coins)
}

/// Buys `tool` off today's shelf into the belt and returns its price.
pub fn buy_tool(
    toolbelt: &mut Toolbelt,
    wallet: &mut Wallet,
    market: &Market,
    items: &ItemCatalog,
    tool: &str,
) -> Result<u32, TradeError> {
    let offer = market.offer(tool).ok_or(TradeError::NotOffered)?;
    if toolbelt.tools().iter().any(|owned| owned == tool) {
        return Err(TradeError::AlreadyOwned);
    }
    if wallet.coins() < u64::from(offer.coins) {
        return Err(TradeError::TooPoor);
    }
    if !toolbelt.give(tool, items) {
        return Err(TradeError::NotOffered);
    }
    wallet.spend(u64::from(offer.coins));
    Ok(offer.coins)
}

#[cfg(test)]
#[path = "trade.test.rs"]
mod tests;
