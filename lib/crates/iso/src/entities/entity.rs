//! Entity instances and their spatial footprint, independent of rendering.

use crate::entities::blueprint::{EntityBlueprintV2, EntityLengthAxis, EntitySway};
use crate::grid::{SpatialIndex, WorldCoord};

/// How an entity blocks movement, block by block: a single fraction for the whole footprint, or
#[derive(Clone, Debug, PartialEq)]
pub enum EntityCollision {
    /// Same fraction for every occupied cell.
    Uniform(f64),
    /// One fraction per cell, in order from the anchor along the footprint axis.
    PerCell(Vec<f64>),
}

/// All serializable data of one entity instance.
#[derive(Clone, Debug)]
pub struct EntityData {
    /// Stable instance id, unique within a world. Assigned once at creation and never changed.
    pub id: String,
    /// Stable blueprint id this instance was created from.
    pub type_: String,
    /// Whether other entities (including the player) can walk on this entity.
    pub walkable: bool,
    /// World elevation of the entity's base.
    pub elevation: i32,
    /// Height of the entity's body, in blocks.
    pub height: i32,
    /// Length of the footprint, in blocks.
    pub length: i32,
    /// Axis the footprint runs along. `None` means a single cell.
    pub length_axis: Option<EntityLengthAxis>,
    /// Minimum free blocks (Chebyshev, diagonals included) between instances of this entity.
    pub gap: Option<i32>,
    /// Path to the entity's sprite asset.
    pub texture_source: String,
    /// Debug flag, only for definitions that asked for it.
    pub debug: Option<bool>,
    /// Color replacement lists, if the definition has any.
    pub color_replacements: Option<std::sync::Arc<serde_json::Value>>,
    /// Chosen color variation index, kept in the data so it survives saves.
    pub color_variant: Option<u32>,
    /// Wind sway parameters, single-tile entities only.
    pub sway: Option<EntitySway>,
    /// Per-cell or whole-footprint collision fraction.
    pub collision: Option<EntityCollision>,
    /// Whether to add a static contact shadow at the footprint.
    pub contact_shadow: Option<bool>,
    /// Sprite reflected in water, multi-tile entities only.
    pub reflection_source: Option<String>,
    /// Free-form metadata.
    pub metadata: serde_json::Value,
}

/// Builds the default id of an entity spawned with its anchor at `(x, y)`.
pub fn create_entity_id(type_: &str, x: i32, y: i32) -> String {
    format!("{}@{},{}", type_, x, y)
}

/// One configured non-terrain entity in the world grid.
#[derive(Clone)]
pub struct Entity {
    x: i32,
    y: i32,
    data: EntityData,
}

impl PartialEq for Entity {
    fn eq(&self, other: &Self) -> bool {
        self.data.id == other.data.id
    }
}
impl Eq for Entity {}
impl std::hash::Hash for Entity {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.data.id.hash(state);
    }
}

impl Entity {
    /// Creates a standing entity anchored at `(x, y)` on `elevation`, from a validated blueprint.
    pub fn new(x: i32, y: i32, blueprint: &EntityBlueprintV2, elevation: i32) -> Self {
        let collision = match blueprint.shape.collision.as_slice() {
            [size] => Some(EntityCollision::Uniform(*size)),
            sizes => Some(EntityCollision::PerCell(sizes.to_vec())),
        };
        let data = EntityData {
            id: create_entity_id(&blueprint.id, x, y),
            type_: blueprint.id.clone(),
            walkable: false,
            elevation,
            height: blueprint.shape.height,
            length: blueprint.shape.length,
            length_axis: Some(blueprint.shape.axis),
            gap: None,
            texture_source: blueprint.asset.sprite.clone(),
            debug: None,
            color_replacements: blueprint.asset.color_replacements.clone(),
            color_variant: None,
            sway: blueprint.asset.sway.clone(),
            collision,
            contact_shadow: blueprint.asset.contact_shadow,
            reflection_source: blueprint.asset.reflection.clone(),
            metadata: serde_json::Value::Object(Default::default()),
        };
        Self { x, y, data }
    }

    /// Restores an entity from previously produced data (e.g. from a save).
    pub fn from_data(x: i32, y: i32, data: EntityData) -> Self {
        Self { x, y, data }
    }

    /// Restores a saved instance of `blueprint`.
    pub fn restore(
        x: i32,
        y: i32,
        blueprint: &EntityBlueprintV2,
        elevation: i32,
        id: String,
        color_variant: Option<u32>,
        metadata: serde_json::Value,
    ) -> Self {
        let mut entity = Self::new(x, y, blueprint, elevation);
        entity.data.id = id;
        entity.data.color_variant = color_variant;
        entity.data.metadata = metadata;
        entity
    }

    pub fn x(&self) -> i32 {
        self.x
    }
    pub fn y(&self) -> i32 {
        self.y
    }
    pub fn id(&self) -> &str {
        &self.data.id
    }
    pub fn type_(&self) -> &str {
        &self.data.type_
    }
    pub fn walkable(&self) -> bool {
        self.data.walkable
    }
    pub fn elevation(&self) -> i32 {
        self.data.elevation
    }
    pub fn height(&self) -> i32 {
        self.data.height
    }
    pub fn length(&self) -> i32 {
        self.data.length
    }
    pub fn length_axis(&self) -> Option<EntityLengthAxis> {
        self.data.length_axis
    }
    pub fn gap(&self) -> Option<i32> {
        self.data.gap
    }
    pub fn texture_source(&self) -> &str {
        &self.data.texture_source
    }
    pub fn debug(&self) -> Option<bool> {
        self.data.debug
    }
    pub fn color_replacements(&self) -> Option<&serde_json::Value> {
        self.data.color_replacements.as_deref()
    }
    pub fn color_variant(&self) -> Option<u32> {
        self.data.color_variant
    }
    pub fn sway(&self) -> Option<&EntitySway> {
        self.data.sway.as_ref()
    }
    pub fn collision(&self) -> Option<&EntityCollision> {
        self.data.collision.as_ref()
    }
    pub fn contact_shadow(&self) -> Option<bool> {
        self.data.contact_shadow
    }
    pub fn reflection_source(&self) -> Option<&str> {
        self.data.reflection_source.as_deref()
    }
    pub fn metadata(&self) -> &serde_json::Value {
        &self.data.metadata
    }

    /// Side of the square, centred on column `(x, y)`, the entity blocks movement in, as a
    pub fn collision_at(&self, x: i32, y: i32) -> f64 {
        let along_x = self.data.length_axis != Some(EntityLengthAxis::Y);
        let index = if along_x { x - self.x } else { y - self.y };
        if (along_x && y != self.y)
            || (!along_x && x != self.x)
            || index < 0
            || index as usize >= self.data.length as usize
        {
            return 0.0;
        }
        let index = index as usize;
        match &self.data.collision {
            None => 1.0,
            Some(EntityCollision::Uniform(size)) => *size,
            Some(EntityCollision::PerCell(sizes)) => sizes.get(index).copied().unwrap_or(1.0),
        }
    }

    /// Returns a clone of the entity's data.
    pub fn get_data(&self) -> EntityData {
        EntityData {
            metadata: self.data.metadata.clone(),
            ..self.data.clone()
        }
    }
}

/// Columns covered by a footprint of `length` blocks anchored at `anchor`, along `lengthAxis`
pub fn get_entity_footprint(
    anchor: WorldCoord,
    length: i32,
    axis: EntityLengthAxis,
) -> Vec<WorldCoord> {
    let mut footprint = Vec::with_capacity(length as usize);
    for index in 0..length {
        footprint.push(WorldCoord {
            x: if axis == EntityLengthAxis::X {
                anchor.x + index
            } else {
                anchor.x
            },
            y: if axis == EntityLengthAxis::Y {
                anchor.y + index
            } else {
                anchor.y
            },
        });
    }
    footprint
}

/// Columns covered by an entity.
pub fn get_entity_footprint_for(entity: &Entity) -> Vec<WorldCoord> {
    get_entity_footprint(
        WorldCoord {
            x: entity.x,
            y: entity.y,
        },
        entity.length(),
        entity.data.length_axis.unwrap_or(EntityLengthAxis::X),
    )
}

/// Builds the spatial index of `entities` over their whole footprints: what occupies each
pub fn index_entities(entities: &[Entity]) -> SpatialIndex<Entity> {
    let mut index = SpatialIndex::new();
    for entity in entities {
        let footprint = get_entity_footprint_for(entity);
        let _ = index.insert(entity.clone(), &footprint);
    }
    index
}

#[cfg(test)]
#[path = "entity.test.rs"]
mod tests;
