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

/// The terrace row: a beach column standing against a step up draws its top at its cell's
/// plane, so what is left of the climb reads as two small steps.
#[test]
fn a_beach_row_against_a_step_up_draws_a_flush_top() {
    assert!(top_is_flush(
        TerrainMaterial::Sand,
        0,
        [Some(1), Some(0), Some(0), None]
    ));
}

#[test]
fn the_open_beach_and_the_waterline_keep_their_sunken_top() {
    assert!(!top_is_flush(
        TerrainMaterial::Sand,
        0,
        [Some(0), Some(0), Some(0), Some(0)]
    ));
    assert!(!top_is_flush(
        TerrainMaterial::Sand,
        0,
        [Some(-1), Some(0), None, Some(0)]
    ));
}

/// Two blocks up is a cliff, not a step the terrace can split.
#[test]
fn a_cliff_above_the_beach_is_not_a_terrace() {
    assert!(!top_is_flush(
        TerrainMaterial::Sand,
        0,
        [Some(2), Some(0), Some(0), Some(0)]
    ));
}

/// Every other material fills its block, so its top is already its cell's plane.
#[test]
fn only_sand_has_a_sunken_top_to_lift() {
    for surface in [
        TerrainMaterial::Grass,
        TerrainMaterial::Ground,
        TerrainMaterial::Path,
        TerrainMaterial::Water,
    ] {
        assert!(!top_is_flush(surface, 0, [Some(1), None, None, None]));
    }
}
