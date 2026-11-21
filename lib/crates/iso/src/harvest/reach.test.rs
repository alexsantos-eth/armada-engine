//! Tests for picking what the player can gather: the nearest harvestable entity within reach.

use super::*;
use crate::entities::{Entity, EntityCatalog};
use crate::items::catalog::tests::{catalog_json, entities};
use crate::items::{ItemCatalog, parse_items};

fn items() -> ItemCatalog {
    parse_items(catalog_json(), &entities()).unwrap()
}

fn spawn(catalog: &EntityCatalog, id: &str, x: i32, y: i32, elevation: i32) -> Entity {
    let blueprint = catalog.entities.iter().find(|b| b.id == id).unwrap();
    Entity::new(x, y, blueprint, elevation)
}

fn feet(x: f64, y: f64, elevation: f64) -> Feet {
    Feet {
        at: GridPoint { x, y },
        elevation,
    }
}

#[test]
fn picks_the_nearest_harvestable_entity_in_reach() {
    let catalog = entities();
    let world = [
        spawn(&catalog, "tree", 3, 1, 0),
        spawn(&catalog, "rock_small", 1, 0, 0),
        spawn(&catalog, "tall_grass", 0, 1, 0),
    ];
    let target = pick_harvest_target(feet(0.1, 0.0, 0.0), &world, &items()).unwrap();
    assert_eq!(target.blueprint, "rock_small");
    assert_eq!(target.anchor, WorldCoord { x: 1, y: 0 });
    assert_eq!(target.id, "rock_small@1,0");
}

#[test]
fn nothing_out_of_sight_is_picked() {
    let catalog = entities();
    let world = [spawn(&catalog, "tree", 5, 0, 0)];
    assert_eq!(
        pick_harvest_target(feet(0.0, 0.0, 0.0), &world, &items()),
        None
    );
}

#[test]
fn a_target_in_sight_but_out_of_reach_is_walked_to() {
    let catalog = entities();
    let world = [spawn(&catalog, "tree", 3, 0, 0)];
    let target = pick_harvest_target(feet(0.0, 0.0, 0.0), &world, &items()).unwrap();
    assert!(!target.in_reach);
    assert_eq!(target.nearest, WorldCoord { x: 3, y: 0 });
    let near = pick_harvest_target(feet(1.8, 0.0, 0.0), &world, &items()).unwrap();
    assert!(near.in_reach);
}

#[test]
fn a_harvest_forgets_the_shadows_of_the_chunks_around_it() {
    let chunks = shadow_chunks(WorldCoord { x: 0, y: 0 });
    assert!(chunks.contains(&crate::grid::ChunkCoord { cx: 0, cy: 0 }));
    assert!(chunks.contains(&crate::grid::ChunkCoord { cx: -1, cy: -1 }));
    assert_eq!(chunks.len(), 4);
    let inside = shadow_chunks(WorldCoord { x: 16, y: 16 });
    assert_eq!(inside, vec![crate::grid::ChunkCoord { cx: 0, cy: 0 }]);
}

#[test]
fn an_entity_without_a_rule_is_ignored() {
    let catalog = entities();
    let world = [
        spawn(&catalog, "rabbit", 1, 0, 0),
        spawn(&catalog, "tree", 1, 1, 0),
    ];
    let target = pick_harvest_target(feet(0.0, 0.0, 0.0), &world, &items()).unwrap();
    assert_eq!(target.blueprint, "tree");
}

#[test]
fn an_entity_on_another_level_is_out_of_reach() {
    let catalog = entities();
    let world = [spawn(&catalog, "tree", 1, 0, 3)];
    assert_eq!(
        pick_harvest_target(feet(0.0, 0.0, 0.0), &world, &items()),
        None
    );
    assert!(pick_harvest_target(feet(0.0, 0.0, 2.0), &world, &items()).is_some());
}

#[test]
fn a_tie_goes_to_the_smaller_id_whatever_the_order() {
    let catalog = entities();
    let left = spawn(&catalog, "tree", -1, 0, 0);
    let right = spawn(&catalog, "tree_2", 1, 0, 0);
    let one = pick_harvest_target(
        feet(0.0, 0.0, 0.0),
        &[left.clone(), right.clone()],
        &items(),
    );
    let other = pick_harvest_target(feet(0.0, 0.0, 0.0), &[right, left], &items());
    assert_eq!(one, other);
    assert_eq!(one.unwrap().id, "tree@-1,0");
}

#[test]
fn the_approach_heads_straight_for_the_nearest_cell() {
    let catalog = entities();
    let world = [spawn(&catalog, "tree", 3, 4, 0)];
    let target = pick_harvest_target(feet(1.2, 1.6, 0.0), &world, &items()).unwrap();
    let walk = approach_walk(&target, GridPoint { x: 1.2, y: 1.6 });
    assert!((walk.x - 0.6).abs() < 1e-9 && (walk.y - 0.8).abs() < 1e-9);
    assert_eq!(
        approach_walk(&target, GridPoint { x: 3.0, y: 4.0 }),
        GridPoint { x: 0.0, y: 0.0 }
    );
}
