
use super::*;
use crate::entities::blueprint::EntityAsset;
use crate::terrain::TerrainMaterial;

fn blueprint(id: &str, length: i32, surface: TerrainMaterial) -> EntityBlueprint {
    EntityBlueprint {
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
