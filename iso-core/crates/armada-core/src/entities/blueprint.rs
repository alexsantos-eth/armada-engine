//! Version 2 entity blueprint types.
//!
//! Mirrors `core/types/entities.ts` (`EntityBlueprintV2`) and the versioned catalog
//! `src/isometric/content/entities.v2.json`. Visual identity (`asset`), physical footprint
//! (`shape`) and placement rules (`placement`) are kept separate, so Rust can design its own
//! density, grouping and biome rules without touching this file.

use crate::terrain::TerrainMaterial;

/// Horizontal axis followed by a multi-tile footprint from its anchor.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityLengthAxis {
    #[default]
    X,
    Y,
}

/// How an entity sways in the wind (a tree): its sprite is cut in two at `cut`, the trunk stays
/// still and the canopy leans. Single-tile entities only.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct EntitySway {
    /// Where the sprite is cut, as a fraction of its height from its top (`0`–`1`, both excluded).
    pub cut: f64,
    /// How far the top of the sprite leans to each side, in world pixels.
    pub amplitude: f64,
    /// Milliseconds of one sway there and back.
    pub period: f64,
}

/// Visual asset of an entity blueprint.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct EntityAsset {
    pub sprite: String,
    pub reflection: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "colorReplacements")]
    pub color_replacements: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sway: Option<EntitySway>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "contactShadow")]
    pub contact_shadow: Option<bool>,
}

/// Physical footprint of an entity: one collision size per occupied cell.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct EntityShape {
    pub height: i32,
    pub length: i32,
    pub axis: EntityLengthAxis,
    pub collision: Vec<f64>,
}

/// Placement rule: the surface required beneath each footprint cell, starting at the anchor.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct EntityPlacement {
    pub surfaces: Vec<TerrainMaterial>,
}

/// One entry of the versioned entity catalog.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct EntityBlueprintV2 {
    pub id: String,
    pub asset: EntityAsset,
    pub shape: EntityShape,
    pub placement: EntityPlacement,
}

/// Versioned entity catalog. `schema_version` is `1`; changes to the schema raise it.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct EntityCatalogV2 {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub entities: Vec<EntityBlueprintV2>,
}
