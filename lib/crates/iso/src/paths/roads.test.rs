use super::*;
use crate::grid::WorldCoord;
use crate::terrain::{TerrainColumn, TerrainMaterial};

fn column(x: i32, y: i32, surface: TerrainMaterial) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x, y },
        elevation: 0,
        surface,
        walkable: surface != TerrainMaterial::Water,
    }
}

#[test]
fn connects_every_access_point_without_crossing_water_or_occupied_cells() {
    let mut columns: Vec<_> = (0..7)
        .flat_map(|x| (0..5).map(move |y| column(x, y, TerrainMaterial::Grass)))
        .collect();
    for column in columns
        .iter_mut()
        .filter(|column| column.coord == WorldCoord { x: 3, y: 2 })
    {
        column.surface = TerrainMaterial::Water;
        column.walkable = false;
    }
    let connectors = [
        RoadConnector::new(WorldCoord { x: 1, y: 2 }, [WorldCoord { x: 1, y: 2 }]),
        RoadConnector::new(WorldCoord { x: 5, y: 2 }, [WorldCoord { x: 5, y: 2 }]),
        RoadConnector::new(WorldCoord { x: 3, y: 4 }, [WorldCoord { x: 3, y: 4 }]),
    ];
    let occupied = [WorldCoord { x: 2, y: 2 }];

    let carved = connect_roads(&mut columns, &connectors, &occupied);

    assert_eq!(carved, 3);
    assert_eq!(surface_at(&columns, 3, 2), Some(TerrainMaterial::Water));
    assert_eq!(surface_at(&columns, 2, 2), Some(TerrainMaterial::Grass));
    for connector in connectors {
        assert!(
            connector
                .access_cells()
                .iter()
                .any(|cell| surface_at(&columns, cell.x, cell.y) == Some(TerrainMaterial::Path))
        );
    }
}

#[test]
fn is_repeatable_when_connectors_are_supplied_in_another_order() {
    let columns: Vec<_> = (0..5)
        .flat_map(|x| (0..5).map(move |y| column(x, y, TerrainMaterial::Grass)))
        .collect();
    let connectors = [
        RoadConnector::new(WorldCoord { x: 1, y: 1 }, [WorldCoord { x: 1, y: 1 }]),
        RoadConnector::new(WorldCoord { x: 3, y: 1 }, [WorldCoord { x: 3, y: 1 }]),
        RoadConnector::new(WorldCoord { x: 2, y: 3 }, [WorldCoord { x: 2, y: 3 }]),
    ];
    let mut first = columns.clone();
    let mut second = columns;

    connect_roads(&mut first, &connectors, &[]);
    connect_roads(
        &mut second,
        &connectors.into_iter().rev().collect::<Vec<_>>(),
        &[],
    );

    assert_eq!(first, second);
}

fn surface_at(columns: &[TerrainColumn], x: i32, y: i32) -> Option<TerrainMaterial> {
    columns
        .iter()
        .find(|column| column.coord == WorldCoord { x, y })
        .map(|column| column.surface)
}

fn road(x: i32, y: i32, elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x, y },
        elevation,
        surface: TerrainMaterial::Path,
        walkable: true,
    }
}

#[test]
fn a_road_block_over_the_road_beside_it_becomes_a_flight() {
    let mut columns = vec![road(0, 0, 0), road(1, 0, 1), road(2, 0, 1)];

    let laid = place_stairs(&mut columns);

    assert_eq!(laid, 1);
    assert_eq!(columns[0].surface, TerrainMaterial::Path);
    assert_eq!(columns[1].surface, TerrainMaterial::Stairs);
    assert_eq!(columns[2].surface, TerrainMaterial::Path);
}

#[test]
fn a_climb_of_two_levels_lays_one_flight_per_level() {
    let mut columns = vec![road(0, 0, 0), road(1, 0, 1), road(2, 0, 2)];

    assert_eq!(place_stairs(&mut columns), 2);
    assert_eq!(columns[1].surface, TerrainMaterial::Stairs);
    assert_eq!(columns[2].surface, TerrainMaterial::Stairs);
}

#[test]
fn a_level_road_and_plain_ground_lay_no_flight() {
    let mut columns = vec![
        road(0, 0, 0),
        road(1, 0, 0),
        TerrainColumn {
            coord: WorldCoord { x: 2, y: 0 },
            elevation: -1,
            surface: TerrainMaterial::Grass,
            walkable: true,
        },
    ];

    assert_eq!(place_stairs(&mut columns), 0);
    assert!(
        columns
            .iter()
            .all(|column| column.surface != TerrainMaterial::Stairs)
    );
}

#[test]
fn carving_a_road_up_a_slope_lays_its_flights() {
    let mut columns: Vec<_> = (0..5)
        .map(|x| TerrainColumn {
            coord: WorldCoord { x, y: 0 },
            elevation: i32::from(x >= 3),
            surface: TerrainMaterial::Grass,
            walkable: true,
        })
        .collect();
    let connectors = [
        RoadConnector::new(WorldCoord { x: 0, y: 0 }, [WorldCoord { x: 0, y: 0 }]),
        RoadConnector::new(WorldCoord { x: 4, y: 0 }, [WorldCoord { x: 4, y: 0 }]),
    ];

    connect_roads(&mut columns, &connectors, &[]);

    assert_eq!(surface_at(&columns, 2, 0), Some(TerrainMaterial::Path));
    assert_eq!(surface_at(&columns, 3, 0), Some(TerrainMaterial::Stairs));
    assert_eq!(surface_at(&columns, 4, 0), Some(TerrainMaterial::Path));
}
