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
