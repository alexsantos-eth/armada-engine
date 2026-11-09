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
