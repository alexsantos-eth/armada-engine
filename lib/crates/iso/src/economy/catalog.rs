//! The economy content (`content/json/economy.json`) and the prices a planet and a day make of it.

use std::collections::{BTreeMap, HashSet};

use crate::entities::EntityCatalog;
use crate::items::ItemCatalog;
use crate::terrain::derive_seed;

/// The schema of `economy.json` this parser accepts.
pub const ECONOMY_SCHEMA_VERSION: u32 = 1;

/// Widest share, in percent, a planet may move its prices away from the base ones.
pub const MAX_PLANET_SPREAD: u32 = 90;

/// A tool a merchant may stock, with its base price in coins.
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
pub struct Good {
    pub tool: String,
    pub coins: u32,
}

#[derive(serde::Deserialize)]
struct RawPrice {
    item: String,
    coins: u32,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawEconomy {
    schema_version: u32,
    currency: String,
    merchants: Vec<String>,
    planet_spread: u32,
    catalog_size: usize,
    prices: Vec<RawPrice>,
    goods: Vec<Good>,
}

/// Everything the content can declare wrong.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EconomyError {
    Json(String),
    UnsupportedSchema {
        found: u32,
        expected: u32,
    },
    EmptyCurrency,
    /// A merchant blueprint the entity catalog does not have, or that is a character.
    UnknownMerchant {
        id: String,
    },
    NoMerchants,
    /// A price or good that names an item or tool the item catalog does not declare.
    UnknownItem {
        id: String,
    },
    UnknownTool {
        id: String,
    },
    /// An item priced twice, or a tool offered twice.
    Duplicate {
        id: String,
    },
    /// A price of zero coins.
    FreePrice {
        id: String,
    },
    /// A spread over [`MAX_PLANET_SPREAD`], which could take a price to zero.
    SpreadTooWide {
        found: u32,
    },
    /// A catalog that offers nothing, or no goods to stock it with.
    EmptyCatalog,
}

/// The validated economy.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EconomyCatalog {
    currency: String,
    merchants: Vec<String>,
    planet_spread: u32,
    catalog_size: usize,
    prices: BTreeMap<String, u32>,
    goods: Vec<Good>,
}

impl EconomyCatalog {
    /// What the money is called, plural, as the shop writes it.
    pub fn currency(&self) -> &str {
        &self.currency
    }

    /// Whether an entity of this blueprint trades.
    pub fn is_merchant(&self, blueprint: &str) -> bool {
        self.merchants.iter().any(|id| id == blueprint)
    }

    /// The base coins one unit of `item` fetches, if villages buy it.
    pub fn base_price(&self, item: &str) -> Option<u32> {
        self.prices.get(item).copied()
    }

    /// The tools merchants may stock, in file order.
    pub fn goods(&self) -> &[Good] {
        &self.goods
    }

    /// How many tools a merchant has on offer at once.
    pub const fn catalog_size(&self) -> usize {
        self.catalog_size
    }
}

/// Parses and validates the economy against the item and entity content it names.
pub fn parse_economy(
    json: &str,
    items: &ItemCatalog,
    entities: &EntityCatalog,
) -> Result<EconomyCatalog, EconomyError> {
    let raw: RawEconomy =
        serde_json::from_str(json).map_err(|err| EconomyError::Json(err.to_string()))?;
    if raw.schema_version != ECONOMY_SCHEMA_VERSION {
        return Err(EconomyError::UnsupportedSchema {
            found: raw.schema_version,
            expected: ECONOMY_SCHEMA_VERSION,
        });
    }
    if raw.currency.trim().is_empty() {
        return Err(EconomyError::EmptyCurrency);
    }
    if raw.merchants.is_empty() {
        return Err(EconomyError::NoMerchants);
    }
    for id in &raw.merchants {
        let known = entities
            .entities
            .iter()
            .any(|blueprint| &blueprint.id == id && blueprint.npc.is_none());
        if !known {
            return Err(EconomyError::UnknownMerchant { id: id.clone() });
        }
    }
    if raw.planet_spread > MAX_PLANET_SPREAD {
        return Err(EconomyError::SpreadTooWide {
            found: raw.planet_spread,
        });
    }
    if raw.catalog_size == 0 || raw.goods.is_empty() {
        return Err(EconomyError::EmptyCatalog);
    }
    let mut prices = BTreeMap::new();
    for price in raw.prices {
        if items.item(&price.item).is_none() {
            return Err(EconomyError::UnknownItem { id: price.item });
        }
        if price.coins == 0 {
            return Err(EconomyError::FreePrice { id: price.item });
        }
        if prices.insert(price.item.clone(), price.coins).is_some() {
            return Err(EconomyError::Duplicate { id: price.item });
        }
    }
    let mut stocked = HashSet::new();
    for good in &raw.goods {
        if items.tool(&good.tool).is_none() {
            return Err(EconomyError::UnknownTool {
                id: good.tool.clone(),
            });
        }
        if good.coins == 0 {
            return Err(EconomyError::FreePrice {
                id: good.tool.clone(),
            });
        }
        if !stocked.insert(good.tool.clone()) {
            return Err(EconomyError::Duplicate {
                id: good.tool.clone(),
            });
        }
    }
    Ok(EconomyCatalog {
        currency: raw.currency,
        merchants: raw.merchants,
        planet_spread: raw.planet_spread,
        catalog_size: raw.catalog_size,
        prices,
        goods: raw.goods,
    })
}

/// One tool on offer, at its price on this planet.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Offer {
    pub tool: String,
    pub coins: u32,
}

/// What a merchant pays and charges on one planet on one day: the planet moves every price by one
/// share, and the day picks which tools are on the shelf.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Market {
    percent: u32,
    day: u64,
    offers: Vec<Offer>,
}

/// `base` coins scaled by `percent`, rounded to the nearest coin and never below one.
fn scaled(base: u32, percent: u32) -> u32 {
    let coins = (u64::from(base) * u64::from(percent) + 50) / 100;
    u32::try_from(coins.max(1)).unwrap_or(u32::MAX)
}

impl Market {
    /// The market of the planet grown from `seed` on `day` (the world clock's day count).
    pub fn open(economy: &EconomyCatalog, seed: u64, day: u64) -> Self {
        let spread = economy.planet_spread;
        let draw = derive_seed(seed, "economy.prices") % u64::from(2 * spread + 1);
        let percent = 100 - spread + u32::try_from(draw).unwrap_or(0);
        let shelf = derive_seed(derive_seed(seed, "economy.stock"), &day.to_string());
        let mut ranked: Vec<&Good> = economy.goods.iter().collect();
        ranked.sort_by_key(|good| (derive_seed(shelf, &good.tool), good.tool.clone()));
        let mut offers: Vec<Offer> = ranked
            .into_iter()
            .take(economy.catalog_size)
            .map(|good| Offer {
                tool: good.tool.clone(),
                coins: scaled(good.coins, percent),
            })
            .collect();
        offers.sort_by_key(|offer| (offer.coins, offer.tool.clone()));
        Self {
            percent,
            day,
            offers,
        }
    }

    /// The share of the base prices this planet charges, in percent.
    pub const fn percent(&self) -> u32 {
        self.percent
    }

    /// The day this shelf was stocked for.
    pub const fn day(&self) -> u64 {
        self.day
    }

    /// The tools on the shelf, cheapest first.
    pub fn offers(&self) -> &[Offer] {
        &self.offers
    }

    /// The offer for `tool`, if it is on the shelf today.
    pub fn offer(&self, tool: &str) -> Option<&Offer> {
        self.offers.iter().find(|offer| offer.tool == tool)
    }

    /// The coins one unit of `item` fetches here, if villages buy it.
    pub fn sell_price(&self, economy: &EconomyCatalog, item: &str) -> Option<u32> {
        economy
            .base_price(item)
            .map(|base| scaled(base, self.percent))
    }
}

#[cfg(test)]
#[path = "catalog.test.rs"]
pub(crate) mod tests;
