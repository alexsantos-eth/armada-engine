use super::connection_mask;
use crate::grid::WorldCoord;
use crate::terrain::TerrainMaterial;
use std::collections::HashMap;

fn columns(pairs: &[(i32, i32, TerrainMaterial)]) -> HashMap<(i32, i32), TerrainMaterial> {
    pairs
        .iter()
        .map(|&(x, y, material)| ((x, y), material))
        .collect()
}

#[test]
fn a_lone_path_has_no_connections() {
    let map = columns(&[(0, 0, TerrainMaterial::Path)]);
    let mask = connection_mask(WorldCoord { x: 0, y: 0 }, |at| {
        map.get(&(at.x, at.y)).copied()
    });
    assert_eq!(mask, 0);
}

#[test]
fn each_path_neighbour_sets_its_own_bit() {
    let centre = WorldCoord { x: 4, y: 7 };
    for (dx, dy, bit) in [(1, 0, 1), (0, 1, 2), (-1, 0, 4), (0, -1, 8)] {
        let map = columns(&[
            (centre.x, centre.y, TerrainMaterial::Path),
            (centre.x + dx, centre.y + dy, TerrainMaterial::Path),
        ]);
        let mask = connection_mask(centre, |at| map.get(&(at.x, at.y)).copied());
        assert_eq!(mask, bit, "a neighbour at ({dx}, {dy}) sets bit {bit}");
    }
}

#[test]
fn all_sixteen_masks_are_reachable() {
    let centre = WorldCoord { x: 0, y: 0 };
    for mask in 0..16u8 {
        let mut map = columns(&[(0, 0, TerrainMaterial::Path)]);
        for (dx, dy, bit) in [(1, 0, 1u8), (0, 1, 2), (-1, 0, 4), (0, -1, 8)] {
            if mask & bit != 0 {
                map.insert((dx, dy), TerrainMaterial::Path);
            }
        }
        let got = connection_mask(centre, |at| map.get(&(at.x, at.y)).copied());
        assert_eq!(got, mask);
    }
}

#[test]
fn non_path_and_missing_neighbours_are_not_joined() {
    let centre = WorldCoord { x: 0, y: 0 };
    let map = columns(&[
        (1, 0, TerrainMaterial::Grass),
        (0, 1, TerrainMaterial::Ground),
        (-1, 0, TerrainMaterial::Water),
        (0, -1, TerrainMaterial::Sand),
    ]);
    let mask = connection_mask(centre, |at| map.get(&(at.x, at.y)).copied());
    assert_eq!(mask, 0);
}

#[test]
fn a_flight_of_stairs_joins_like_any_other_road_block() {
    let centre = WorldCoord { x: 0, y: 0 };
    let map = columns(&[
        (0, 0, TerrainMaterial::Path),
        (1, 0, TerrainMaterial::Stairs),
        (0, -1, TerrainMaterial::Stairs),
    ]);
    let mask = connection_mask(centre, |at| map.get(&(at.x, at.y)).copied());
    assert_eq!(mask, 1 | 8);
}
