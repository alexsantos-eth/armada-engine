use super::*;
use iso::grid::WorldCoord;

fn column(surface: TerrainMaterial, elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x: 3, y: 7 },
        elevation,
        surface,
        walkable: surface != TerrainMaterial::Water,
    }
}

#[test]
fn open_water_answers_with_its_own_level_and_elevation() {
    let cell = water_cell_of(Some(column(TerrainMaterial::Water, 2))).expect("water cell");

    assert_eq!(
        cell,
        WaterCell {
            level: 2.0,
            elevation: 2.0,
        },
        "a reflection mirrors in the surface plane of the column it stands on",
    );
}

#[test]
fn whatever_is_not_water_mirrors_nothing() {
    for surface in [
        TerrainMaterial::Sand,
        TerrainMaterial::Ground,
        TerrainMaterial::Grass,
        TerrainMaterial::Path,
    ] {
        assert_eq!(
            water_cell_of(Some(column(surface, 0))),
            None,
            "{surface:?} is not water"
        );
    }
}

#[test]
fn an_undiscovered_column_mirrors_nothing() {
    assert_eq!(water_cell_of(None), None);
}

fn cell(x: i32, y: i32, surface: TerrainMaterial, elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x, y },
        elevation,
        surface,
        walkable: surface != TerrainMaterial::Water,
    }
}

#[test]
fn the_water_field_keeps_only_the_water_of_every_chunk() {
    let first = vec![
        cell(1, 2, TerrainMaterial::Water, -1),
        cell(1, 3, TerrainMaterial::Grass, 1),
        cell(1, 4, TerrainMaterial::Water, -2),
    ];
    let second = vec![cell(40, 2, TerrainMaterial::Water, -3)];

    let field = WaterField::from_chunks([first.as_slice(), second.as_slice()].into_iter());

    assert_eq!(
        field.at(1, 2),
        Some(WaterCell {
            level: -1.0,
            elevation: -1.0,
        })
    );
    assert_eq!(field.at(1, 3), None, "dry ground mirrors nothing");
    assert_eq!(
        field.at(40, 2),
        Some(WaterCell {
            level: -3.0,
            elevation: -3.0,
        }),
        "the field spans every chunk it was built from"
    );
    assert_eq!(field.at(1, 4).map(|water| water.level), Some(-2.0));
}

#[test]
fn a_frame_without_water_holds_an_empty_field() {
    let land = vec![
        cell(1, 2, TerrainMaterial::Grass, 1),
        cell(1, 3, TerrainMaterial::Sand, 0),
    ];

    let field = WaterField::from_chunks([land.as_slice()].into_iter());

    assert!(field.is_empty());
    assert_eq!(field.at(1, 2), None);
}
