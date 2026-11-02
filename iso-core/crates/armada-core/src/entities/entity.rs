//! Entity instances and their spatial footprint, independent of rendering.
//!
//! Mirrors `engine/entities/entities.ts` in the TypeScript game. An entity occupies one or more
//! world columns and can block movement. Instances are identified by their stable `id`, so they
//! survive saves and can be referenced by AI, events and the view layer.

use crate::entities::blueprint::{EntityBlueprintV2, EntityLengthAxis, EntitySway};
use crate::grid::{SpatialIndex, WorldCoord};

/// How an entity blocks movement, block by block: a single fraction for the whole footprint, or
/// one fraction per occupied cell along the footprint axis.
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
    pub color_replacements: Option<serde_json::Value>,
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

// Entity instances are identified by their stable id. Metadata and collision values are not
// part of identity: two handles with the same id are the same entity.
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
        self.data.color_replacements.as_ref()
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
    /// fraction of the block. `0` off the footprint or where it does not block.
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
/// (`"x"` by default), in order from the anchor.
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
/// column, for collision, neighbourhood and placement queries. Derived data — rebuild it from
/// the entities, never serialize it.
pub fn index_entities(entities: &[Entity]) -> SpatialIndex<Entity> {
    let mut index = SpatialIndex::new();
    for entity in entities {
        let footprint = get_entity_footprint_for(entity);
        let _ = index.insert(entity.clone(), &footprint);
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::blueprint::EntityAsset;
    use crate::terrain::TerrainMaterial;

    fn blueprint(id: &str, length: i32, surface: TerrainMaterial) -> EntityBlueprintV2 {
        EntityBlueprintV2 {
            id: id.to_owned(),
            asset: EntityAsset {
                sprite: format!("/assets/{}/block.svg", id),
                reflection: None,
                color_replacements: None,
                sway: None,
                contact_shadow: None,
            },
            shape: crate::entities::blueprint::EntityShape {
                height: 1,
                length,
                axis: EntityLengthAxis::X,
                collision: vec![1.0; length as usize],
            },
            placement: crate::entities::blueprint::EntityPlacement {
                surfaces: vec![surface],
            },
        }
    }

    #[test]
    fn entity_id_is_stable_and_based_on_anchor() {
        assert_eq!(create_entity_id("tree", 3, -2), "tree@3,-2");
    }

    #[test]
    fn entity_exposes_blueprint_data() {
        let bp = blueprint("tree", 1, TerrainMaterial::Grass);
        let entity = Entity::new(5, 7, &bp, 2);
        assert_eq!(entity.id(), "tree@5,7");
        assert_eq!(entity.type_(), "tree");
        assert_eq!(entity.elevation(), 2);
        assert_eq!(entity.height(), 1);
        assert_eq!(entity.length(), 1);
        assert_eq!(entity.texture_source(), "/assets/tree/block.svg");
        assert_eq!(entity.collision_at(5, 7), 1.0);
        assert_eq!(entity.collision_at(6, 7), 0.0);
    }

    #[test]
    fn footprint_covers_length_cells_along_axis() {
        let bp = blueprint("pier", 3, TerrainMaterial::Water);
        let entity = Entity::new(0, 0, &bp, 0);
        let footprint = get_entity_footprint_for(&entity);
        assert_eq!(
            footprint,
            vec![
                WorldCoord { x: 0, y: 0 },
                WorldCoord { x: 1, y: 0 },
                WorldCoord { x: 2, y: 0 },
            ]
        );
    }

    #[test]
    fn collision_per_cell_respects_axis() {
        let bp = blueprint("house_2x1", 2, TerrainMaterial::Grass);
        let mut entity = Entity::new(0, 0, &bp, 0);
        entity.data.collision = Some(EntityCollision::PerCell(vec![1.0, 0.0]));
        assert_eq!(entity.collision_at(0, 0), 1.0);
        assert_eq!(entity.collision_at(1, 0), 0.0);
        assert_eq!(entity.collision_at(0, 1), 0.0);
    }

    #[test]
    fn index_entities_occupies_whole_footprint() {
        let bp = blueprint("house", 1, TerrainMaterial::Grass);
        let entity = Entity::new(0, 0, &bp, 0);
        let index = index_entities(std::slice::from_ref(&entity));
        assert!(index.is_occupied(WorldCoord { x: 0, y: 0 }));
        assert!(!index.is_occupied(WorldCoord { x: 1, y: 0 }));
        assert!(index.contains(&entity));
    }
}
