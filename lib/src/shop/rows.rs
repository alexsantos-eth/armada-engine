//! The rows of each tab, and carrying out the trade a row stands for.

use iso::economy::{EconomyCatalog, Market, TradeError, Wallet, buy_tool, sell_item};
use iso::inventory::Carried;
use iso::items::{ItemCatalog, ToolKind};

use super::session::Tab;

/// What choosing a row does.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum RowAction {
    /// Sell every unit the player carries of this item.
    Sell { item: String },
    /// Buy this tool off the shelf.
    Buy { tool: String },
}

/// One line of the shop.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ShopRow {
    pub(crate) action: RowAction,
    /// The item id (its icon) for a sale, or the kit's tool piece for a purchase.
    pub(crate) icon: String,
    pub(crate) is_tool: bool,
    pub(crate) name: String,
    /// What is on the row besides its name: the units carried or the tool's level.
    pub(crate) detail: String,
    /// Coins the row pays or costs.
    pub(crate) coins: u64,
    /// Whether choosing it does anything now.
    pub(crate) enabled: bool,
    /// Why it cannot be chosen, when it cannot.
    pub(crate) note: Option<&'static str>,
}

/// Everything the rows are read from.
pub(crate) struct ShopStock<'a> {
    pub(crate) carried: &'a Carried,
    pub(crate) wallet: &'a Wallet,
    pub(crate) market: &'a Market,
    pub(crate) economy: &'a EconomyCatalog,
    pub(crate) items: &'a ItemCatalog,
}

/// The kit piece that draws a tool of this family.
pub(crate) const fn tool_piece(kind: ToolKind) -> &'static str {
    match kind {
        ToolKind::Axe => "tool_axe",
        ToolKind::Pickaxe => "tool_pickaxe",
        ToolKind::Net => "tool_net",
    }
}

/// The rows of `tab`: what the player can sell (items villages pay for, summed over the slots,
/// in the catalog's id order) or what is on today's shelf (cheapest first).
pub(crate) fn rows(tab: Tab, stock: &ShopStock<'_>) -> Vec<ShopRow> {
    match tab {
        Tab::Sell => stock
            .items
            .item_ids()
            .into_iter()
            .filter_map(|id| {
                let count = stock.carried.inventory.count(id);
                let unit = stock.market.sell_price(stock.economy, id)?;
                let def = stock.items.item(id)?;
                (count > 0).then(|| ShopRow {
                    action: RowAction::Sell {
                        item: id.to_owned(),
                    },
                    icon: id.to_owned(),
                    is_tool: false,
                    name: def.name.clone(),
                    detail: format!("x{count}"),
                    coins: u64::from(unit) * u64::from(count),
                    enabled: true,
                    note: None,
                })
            })
            .collect(),
        Tab::Buy => stock
            .market
            .offers()
            .iter()
            .filter_map(|offer| {
                let tool = stock.items.tool(&offer.tool)?;
                let owned = stock
                    .carried
                    .toolbelt
                    .tools()
                    .iter()
                    .any(|have| have == &offer.tool);
                let poor = stock.wallet.coins() < u64::from(offer.coins);
                Some(ShopRow {
                    action: RowAction::Buy {
                        tool: offer.tool.clone(),
                    },
                    icon: tool_piece(tool.kind).to_owned(),
                    is_tool: true,
                    name: tool.name.clone(),
                    detail: format!("Nivel {}", tool.tier),
                    coins: u64::from(offer.coins),
                    enabled: !owned && !poor,
                    // A tool that costs too much is only greyed out: no text says why.
                    note: owned.then_some("Ya la tienes"),
                })
            })
            .collect(),
    }
}

/// What a trade came to: the words for it and the money that moved.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Traded {
    /// «Vendiste Madera», «Compraste Pico de cobre».
    pub(crate) text: String,
    pub(crate) coins: u64,
    /// Whether the player got the coins (a sale) or paid them (a purchase).
    pub(crate) earned: bool,
}

/// Carries out what `row` stands for and says what happened.
pub(crate) fn trade(
    row: &ShopRow,
    carried: &mut Carried,
    wallet: &mut Wallet,
    market: &Market,
    economy: &EconomyCatalog,
    items: &ItemCatalog,
) -> Result<Traded, &'static str> {
    match &row.action {
        RowAction::Sell { item } => {
            let count = carried.inventory.count(item);
            sell_item(&mut carried.inventory, wallet, market, economy, item, count)
                .map(|coins| Traded {
                    text: format!("Vendiste {}", row.name),
                    coins,
                    earned: true,
                })
                .map_err(refusal)
        }
        RowAction::Buy { tool } => buy_tool(&mut carried.toolbelt, wallet, market, items, tool)
            .map(|coins| Traded {
                text: format!("Compraste {}", row.name),
                coins: u64::from(coins),
                earned: false,
            })
            .map_err(refusal),
    }
}

const fn refusal(error: TradeError) -> &'static str {
    match error {
        TradeError::NothingToSell => "No hay nada que vender",
        TradeError::NotOffered => "Ya no esta en venta",
        TradeError::AlreadyOwned => "Ya la tienes",
        TradeError::TooPoor => "Faltan monedas",
    }
}

#[cfg(test)]
#[path = "rows.test.rs"]
mod tests;
