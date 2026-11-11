use super::stairs_direction;
use crate::grid::WorldCoord;
use crate::terrain::TerrainMaterial;
use std::collections::HashMap;

fn world(
    pairs: &[(i32, i32, TerrainMaterial, i32)],
) -> HashMap<(i32, i32), (TerrainMaterial, i32)> {
    pairs
        .iter()
        .map(|&(x, y, material, elevation)| ((x, y), (material, elevation)))
        .collect()
}

fn direction_at(
    map: &HashMap<(i32, i32), (TerrainMaterial, i32)>,
    coord: WorldCoord,
    elevation: i32,
) -> Option<WorldCoord> {
    stairs_direction(coord, elevation, |at| map.get(&(at.x, at.y)).copied())
}

#[test]
fn a_road_over_a_road_one_block_lower_climbs_away_from_it() {
    for (dx, dy) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
        let map = world(&[
            (0, 0, TerrainMaterial::Path, 3),
            (dx, dy, TerrainMaterial::Path, 2),
        ]);
        assert_eq!(
            direction_at(&map, WorldCoord { x: 0, y: 0 }, 3),
            Some(WorldCoord { x: -dx, y: -dy }),
            "a lower road at ({dx}, {dy}) is climbed away from"
        );
    }
}

#[test]
fn a_flat_road_climbs_nowhere() {
    let map = world(&[
        (0, 0, TerrainMaterial::Path, 1),
        (1, 0, TerrainMaterial::Path, 1),
        (-1, 0, TerrainMaterial::Path, 1),
    ]);
    assert_eq!(direction_at(&map, WorldCoord { x: 0, y: 0 }, 1), None);
}

#[test]
fn only_a_drop_of_exactly_one_block_is_a_flight() {
    for drop in [2, 3] {
        let map = world(&[
            (0, 0, TerrainMaterial::Path, 4),
            (1, 0, TerrainMaterial::Path, 4 - drop),
        ]);
        assert_eq!(
            direction_at(&map, WorldCoord { x: 0, y: 0 }, 4),
            None,
            "a drop of {drop} blocks is not a flight"
        );
    }
}

#[test]
fn ground_below_the_road_is_not_a_flight() {
    let map = world(&[
        (0, 0, TerrainMaterial::Path, 2),
        (1, 0, TerrainMaterial::Grass, 1),
        (0, 1, TerrainMaterial::Sand, 1),
        (-1, 0, TerrainMaterial::Water, 1),
    ]);
    assert_eq!(direction_at(&map, WorldCoord { x: 0, y: 0 }, 2), None);
}

#[test]
fn stairs_below_continue_a_flight_of_two_blocks() {
    let map = world(&[
        (0, 0, TerrainMaterial::Path, 3),
        (1, 0, TerrainMaterial::Stairs, 2),
    ]);
    assert_eq!(
        direction_at(&map, WorldCoord { x: 0, y: 0 }, 3),
        Some(WorldCoord { x: -1, y: 0 })
    );
}

#[test]
fn two_lower_roads_pick_the_first_side_in_the_contract_order() {
    let map = world(&[
        (0, 0, TerrainMaterial::Path, 2),
        (0, 1, TerrainMaterial::Path, 1),
        (1, 0, TerrainMaterial::Path, 1),
    ]);
    assert_eq!(
        direction_at(&map, WorldCoord { x: 0, y: 0 }, 2),
        Some(WorldCoord { x: -1, y: 0 })
    );
}

#[test]
fn a_missing_neighbour_is_not_a_flight() {
    let map = world(&[(0, 0, TerrainMaterial::Path, 2)]);
    assert_eq!(direction_at(&map, WorldCoord { x: 0, y: 0 }, 2), None);
}
