//! Tests for finding the merchant the player is next to.

use super::*;
use crate::economy::catalog::tests::{economy, world_entities};
use crate::entities::Entity;
use crate::projection::GridPoint;

fn stall(id_x: i32, y: i32, elevation: i32) -> Entity {
    let catalog = world_entities();
    let blueprint = catalog
        .entities
        .iter()
        .find(|b| b.id == "market_stall")
        .unwrap();
    Entity::new(id_x, y, blueprint, elevation)
}

fn feet(x: f64, y: f64, elevation: f64) -> Feet {
    Feet {
        at: GridPoint { x, y },
        elevation,
    }
}

#[test]
fn the_nearest_stall_in_reach_is_the_merchant() {
    let world = [stall(2, 0, 0), stall(1, 1, 0)];
    let merchant = pick_merchant(feet(0.0, 0.0, 0.0), &world, &economy()).unwrap();
    assert_eq!(merchant.anchor, WorldCoord { x: 1, y: 1 });
    assert_eq!(merchant.blueprint, "market_stall");
}

#[test]
fn a_stall_too_far_or_too_high_is_ignored() {
    let far = [stall(5, 0, 0)];
    assert_eq!(pick_merchant(feet(0.0, 0.0, 0.0), &far, &economy()), None);
    let high = [stall(1, 0, 3)];
    assert_eq!(pick_merchant(feet(0.0, 0.0, 0.0), &high, &economy()), None);
}

#[test]
fn what_is_not_a_merchant_does_not_trade() {
    let catalog = world_entities();
    let tree = Entity::new(1, 0, &catalog.entities[0], 0);
    assert_eq!(
        pick_merchant(feet(0.0, 0.0, 0.0), [&tree], &economy()),
        None
    );
}

#[test]
fn ties_go_to_the_smaller_id_whatever_the_order() {
    let a = stall(1, 0, 0);
    let b = stall(-1, 0, 0);
    let first = pick_merchant(feet(0.0, 0.0, 0.0), [&a, &b], &economy()).unwrap();
    let second = pick_merchant(feet(0.0, 0.0, 0.0), [&b, &a], &economy()).unwrap();
    assert_eq!(first, second);
}
