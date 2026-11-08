use super::*;

#[test]
fn dry_column_has_ground_support_and_grass_top() {
    let column = TerrainColumn {
        coord: WorldCoord { x: 2, y: -1 },
        elevation: 2,
        surface: TerrainMaterial::Grass,
        walkable: true,
    };
    assert_eq!(column.material_at(3), None);
    assert_eq!(column.material_at(2), Some(TerrainMaterial::Grass));
    assert_eq!(column.material_at(1), Some(TerrainMaterial::Ground));
    assert_eq!(
        column
            .blocks_from(-1)
            .map(|block| block.material)
            .collect::<Vec<_>>(),
        vec![
            TerrainMaterial::Ground,
            TerrainMaterial::Ground,
            TerrainMaterial::Ground,
            TerrainMaterial::Grass
        ]
    );
}

#[test]
fn water_column_stays_below_sea_level() {
    let column = TerrainColumn {
        coord: WorldCoord { x: 0, y: 0 },
        elevation: -1,
        surface: TerrainMaterial::Water,
        walkable: false,
    };
    assert_eq!(
        column
            .blocks_from(-3)
            .map(|block| (block.elevation, block.material))
            .collect::<Vec<_>>(),
        vec![
            (-3, TerrainMaterial::Water),
            (-2, TerrainMaterial::Water),
            (-1, TerrainMaterial::Water)
        ]
    );
    assert_eq!(column.material_at(0), None);
}

#[test]
fn a_dry_sand_column_has_a_ground_support() {
    let column = TerrainColumn {
        coord: WorldCoord { x: 0, y: 0 },
        elevation: 0,
        surface: TerrainMaterial::Sand,
        walkable: true,
    };
    assert_eq!(column.material_at(0), Some(TerrainMaterial::Sand));
    assert_eq!(column.material_at(-1), Some(TerrainMaterial::Ground));
}
