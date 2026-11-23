//! The item catalog: what can be carried, the tools that gather it and which entities yield it.

use std::collections::{HashMap, HashSet};

use crate::entities::EntityCatalog;

/// The item content schema this parser accepts.
pub const ITEMS_SCHEMA_VERSION: u32 = 1;

/// Highest tool tier, the last level of the tool progression.
pub const MAX_TOOL_TIER: u8 = 10;

/// Gathering speed of each tool tier, in tenths of the bare-hand speed (tier 1 is index 0).
pub const TOOL_SPEED_TENTHS: [u32; MAX_TOOL_TIER as usize] =
    [10, 20, 35, 60, 100, 180, 350, 600, 1000, 5000];

/// Gathering speed of `tier`, in tenths of the bare-hand speed; tier 0 is bare hands.
pub fn tool_speed_tenths(tier: u8) -> u32 {
    let index = usize::from(tier.clamp(1, MAX_TOOL_TIER)) - 1;
    TOOL_SPEED_TENTHS[index]
}

/// How rare an item is, which decides its price band in the economy.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemRarity {
    Common,
    Rare,
    Exotic,
}

/// The family a tool belongs to; a harvest rule asks for one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolKind {
    Axe,
    Pickaxe,
    Net,
}

/// One carriable item.
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ItemDef {
    pub id: String,
    /// Name shown to the player.
    pub name: String,
    /// Most units one inventory slot holds.
    pub stack: u32,
    pub rarity: ItemRarity,
    /// Colour of the chips a blow knocks off what yields it, as six hex digits (`a0703c`).
    #[serde(default)]
    color: Option<String>,
    /// Sprite of a heap of it lying on the ground, by its path in the asset manifest.
    #[serde(default)]
    pub sprite: Option<String>,
}

impl ItemDef {
    /// The colour of its chips as `0xRRGGBB`, if it declares one.
    pub fn color(&self) -> Option<u32> {
        self.color
            .as_deref()
            .and_then(|hex| u32::from_str_radix(hex, 16).ok())
    }
}

/// One tool: equipment kept apart from the inventory slots.
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolDef {
    pub id: String,
    pub name: String,
    pub kind: ToolKind,
    /// Level in the tool progression, `1..=MAX_TOOL_TIER`.
    pub tier: u8,
}

/// Units of one item a harvest gives.
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HarvestYield {
    pub item: String,
    pub amount: u32,
}

/// How an entity is gathered: the tool it needs, the work it takes and what it gives.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HarvestRule {
    /// Tool kind required; `None` is gathered by hand.
    pub tool: Option<ToolKind>,
    /// Lowest tier of `tool` that can gather it; `0` when gathered by hand.
    pub tier: u8,
    /// Ticks of work at bare-hand speed.
    pub ticks: u32,
    pub yields: Vec<HarvestYield>,
}

/// The validated item content.
#[derive(Clone, Debug, PartialEq)]
pub struct ItemCatalog {
    items: HashMap<String, ItemDef>,
    tools: HashMap<String, ToolDef>,
    starting_tools: Vec<String>,
    rules: Vec<HarvestRule>,
    rule_of: HashMap<String, usize>,
}

impl ItemCatalog {
    /// The item with `id`.
    pub fn item(&self, id: &str) -> Option<&ItemDef> {
        self.items.get(id)
    }

    /// The tool with `id`.
    pub fn tool(&self, id: &str) -> Option<&ToolDef> {
        self.tools.get(id)
    }

    /// The tools a new player lands with, in file order.
    pub fn starting_tools(&self) -> &[String] {
        &self.starting_tools
    }

    /// How entities of `blueprint` are gathered, if they can be.
    pub fn harvest_rule(&self, blueprint: &str) -> Option<&HarvestRule> {
        self.rule_of.get(blueprint).map(|index| &self.rules[*index])
    }
}

/// Everything the item content can declare wrong.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ItemsError {
    Json(String),
    UnsupportedSchema { found: u32, expected: u32 },
    EmptyId,
    DuplicateId { id: String },
    InvalidStack { id: String },
    InvalidTier { id: String },
    UnknownTool { id: String },
    UnknownBlueprint { id: String },
    HarvestedTwice { id: String },
    HarvestsACharacter { id: String },
    UnknownItem { id: String },
    InvalidYield { id: String },
    InvalidWork { id: String },
    InvalidColor { id: String },
}

impl std::fmt::Display for ItemsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json(err) => write!(f, "item content is not valid JSON: {err}"),
            Self::UnsupportedSchema { found, expected } => {
                write!(
                    f,
                    "item schema {found} is not supported, expected {expected}"
                )
            }
            Self::EmptyId => write!(f, "an item or tool has an empty id"),
            Self::DuplicateId { id } => write!(f, "id {id} is declared twice"),
            Self::InvalidStack { id } => write!(f, "item {id} must stack at least one unit"),
            Self::InvalidTier { id } => write!(f, "{id} has a tier outside the tool table"),
            Self::UnknownTool { id } => write!(f, "starting tool {id} is not declared"),
            Self::UnknownBlueprint { id } => {
                write!(f, "harvested blueprint {id} is not in the entity catalog")
            }
            Self::HarvestedTwice { id } => write!(f, "blueprint {id} is in two harvest rules"),
            Self::HarvestsACharacter { id } => {
                write!(
                    f,
                    "blueprint {id} is a character and cannot be harvested yet"
                )
            }
            Self::UnknownItem { id } => write!(f, "harvest yields undeclared item {id}"),
            Self::InvalidYield { id } => write!(f, "harvest of {id} yields nothing"),
            Self::InvalidWork { id } => write!(f, "harvest of {id} takes no work"),
            Self::InvalidColor { id } => {
                write!(f, "item {id} has a colour that is not six hex digits")
            }
        }
    }
}

impl std::error::Error for ItemsError {}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRule {
    blueprints: Vec<String>,
    #[serde(default)]
    tool: Option<ToolKind>,
    #[serde(default)]
    tier: u8,
    ticks: u32,
    yields: Vec<HarvestYield>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawCatalog {
    schema_version: u32,
    items: Vec<ItemDef>,
    tools: Vec<ToolDef>,
    #[serde(default)]
    starting_tools: Vec<String>,
    #[serde(default)]
    harvest: Vec<RawRule>,
}

/// Parses and validates the item content against the entity catalog its rules name.
pub fn parse_items(json: &str, entities: &EntityCatalog) -> Result<ItemCatalog, ItemsError> {
    let raw: RawCatalog =
        serde_json::from_str(json).map_err(|err| ItemsError::Json(err.to_string()))?;
    if raw.schema_version != ITEMS_SCHEMA_VERSION {
        return Err(ItemsError::UnsupportedSchema {
            found: raw.schema_version,
            expected: ITEMS_SCHEMA_VERSION,
        });
    }
    let mut seen = HashSet::new();
    let mut items = HashMap::new();
    for item in raw.items {
        check_id(&item.id, &mut seen)?;
        if item.stack == 0 {
            return Err(ItemsError::InvalidStack { id: item.id });
        }
        let hex_ok = |hex: &str| hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit());
        if item.color.as_deref().is_some_and(|hex| !hex_ok(hex)) {
            return Err(ItemsError::InvalidColor { id: item.id });
        }
        items.insert(item.id.clone(), item);
    }
    let mut tools = HashMap::new();
    for tool in raw.tools {
        check_id(&tool.id, &mut seen)?;
        if !(1..=MAX_TOOL_TIER).contains(&tool.tier) {
            return Err(ItemsError::InvalidTier { id: tool.id });
        }
        tools.insert(tool.id.clone(), tool);
    }
    if let Some(id) = raw
        .starting_tools
        .iter()
        .find(|id| !tools.contains_key(id.as_str()))
    {
        return Err(ItemsError::UnknownTool { id: id.clone() });
    }
    let mut rules = Vec::with_capacity(raw.harvest.len());
    let mut rule_of = HashMap::new();
    for raw_rule in raw.harvest {
        let index = rules.len();
        let name = raw_rule.blueprints.first().cloned().unwrap_or_default();
        for id in &raw_rule.blueprints {
            let blueprint = entities
                .entities
                .iter()
                .find(|blueprint| &blueprint.id == id)
                .ok_or_else(|| ItemsError::UnknownBlueprint { id: id.clone() })?;
            if blueprint.npc.is_some() {
                return Err(ItemsError::HarvestsACharacter { id: id.clone() });
            }
            if rule_of.insert(id.clone(), index).is_some() {
                return Err(ItemsError::HarvestedTwice { id: id.clone() });
            }
        }
        let tier_fits = match raw_rule.tool {
            Some(_) => (1..=MAX_TOOL_TIER).contains(&raw_rule.tier),
            None => raw_rule.tier == 0,
        };
        if !tier_fits {
            return Err(ItemsError::InvalidTier { id: name });
        }
        if raw_rule.ticks == 0 {
            return Err(ItemsError::InvalidWork { id: name });
        }
        if raw_rule.yields.is_empty() || raw_rule.yields.iter().any(|y| y.amount == 0) {
            return Err(ItemsError::InvalidYield { id: name });
        }
        if let Some(unknown) = raw_rule
            .yields
            .iter()
            .find(|y| !items.contains_key(y.item.as_str()))
        {
            return Err(ItemsError::UnknownItem {
                id: unknown.item.clone(),
            });
        }
        rules.push(HarvestRule {
            tool: raw_rule.tool,
            tier: raw_rule.tier,
            ticks: raw_rule.ticks,
            yields: raw_rule.yields,
        });
    }
    Ok(ItemCatalog {
        items,
        tools,
        starting_tools: raw.starting_tools,
        rules,
        rule_of,
    })
}

/// Rejects an empty id or one already declared by another item or tool.
fn check_id(id: &str, seen: &mut HashSet<String>) -> Result<(), ItemsError> {
    if id.is_empty() {
        return Err(ItemsError::EmptyId);
    }
    if !seen.insert(id.to_owned()) {
        return Err(ItemsError::DuplicateId { id: id.to_owned() });
    }
    Ok(())
}

#[cfg(test)]
#[path = "catalog.test.rs"]
pub(crate) mod tests;
