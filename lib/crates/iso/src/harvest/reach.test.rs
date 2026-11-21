//! Tests for picking what the player can gather and how close it has to come to strike it.

use super::*;
use crate::entities::{Entity, EntityCatalog};
use crate::items::catalog::tests::{catalog_json, entities};
use crate::items::{ItemCatalog, parse_items};
use crate::player::physics::PLAYER_RADIUS;

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

/// Where the player's body touches a fixture entity's square (side 0.5) along one axis.
const TOUCH: f64 = PLAYER_RADIUS + 0.25;

#[test]
fn picks_the_nearest_harvestable_entity_in_sight() {
    let catalog = entities();
    let world = [
        spawn(&catalog, "tree", 3, 1, 0),
        spawn(&catalog, "rock_small", 1, 0, 0),
        spawn(&catalog, "tall_grass", 0, 2, 0),
    ];
    let target = pick_harvest_target(feet(0.1, 0.0, 0.0), &world, &items()).unwrap();
    assert_eq!(target.blueprint, "rock_small");
    assert_eq!(target.anchor, WorldCoord { x: 1, y: 0 });
    assert_eq!(target.id, "rock_small@1,0");
}

#[test]
fn nothing_out_of_sight_is_picked() {
    let catalog = entities();
    let world = [spawn(&catalog, "tree", 6, 0, 0)];
    assert_eq!(
        pick_harvest_target(feet(0.0, 0.0, 0.0), &world, &items()),
        None
    );
}

#[test]
fn the_gap_is_what_is_left_before_the_bodies_touch() {
    let catalog = entities();
    let world = [spawn(&catalog, "tree", 3, 0, 0)];
    let far = pick_harvest_target(feet(0.0, 0.0, 0.0), &world, &items()).unwrap();
    assert!((far.gap - (3.0 - TOUCH)).abs() < 1e-9);
    assert!(!far.in_reach);
    assert_eq!(far.nearest, WorldCoord { x: 3, y: 0 });
    let one_cell_off = pick_harvest_target(feet(2.0, 0.0, 0.0), &world, &items()).unwrap();
    assert!(
        !one_cell_off.in_reach,
        "a whole cell away is not close enough"
    );
    let touching = pick_harvest_target(feet(3.0 - TOUCH, 0.1, 0.0), &world, &items()).unwrap();
    assert!(touching.gap.abs() < 1e-9);
    assert!(touching.in_reach);
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
fn the_approach_heads_for_the_nearest_cell_and_slows_down_at_the_end() {
    let catalog = entities();
    let world = [spawn(&catalog, "tree", 3, 4, 0)];
    let at = GridPoint { x: 1.2, y: 1.6 };
    let target = pick_harvest_target(feet(at.x, at.y, 0.0), &world, &items()).unwrap();
    let walk = approach_walk(&target, at);
    assert!((walk.x - 0.6).abs() < 1e-9 && (walk.y - 0.8).abs() < 1e-9);
    let close = GridPoint {
        x: 3.0 - TOUCH - 0.1,
        y: 4.0,
    };
    let near = pick_harvest_target(feet(close.x, close.y, 0.0), &world, &items()).unwrap();
    let slow = approach_walk(&near, close);
    assert!(slow.x > 0.0 && slow.x < 1.0, "{slow:?}");
}

#[test]
fn a_harvest_forgets_the_shadows_of_the_area_around_it() {
    let area = shadow_area(WorldCoord { x: 0, y: 0 });
    assert_eq!(area.min_x, -HARVEST_SHADOW_SPAN);
    assert_eq!(area.max_y, HARVEST_SHADOW_SPAN);
}
