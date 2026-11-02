use super::*;
use crate::grid::CHUNK_SIZE;

#[test]
fn generator_has_varied_heights_and_all_fundamental_materials() {
    let generator = TerrainGenerator::new(TerrainConfig::default()).unwrap();
    let mut elevations = std::collections::HashSet::new();
    let mut materials = std::collections::HashSet::new();
    for cx in -3..=3 {
        for cy in -3..=3 {
            for column in generator.generate_chunk(ChunkCoord { cx, cy }) {
                elevations.insert(column.elevation);
                materials.insert(column.surface);
                assert_eq!(column.walkable, column.surface != TerrainMaterial::Water);
                assert_eq!(
                    column.surface == TerrainMaterial::Water,
                    column.elevation < 0
                );
                assert_eq!(column.material_at(column.elevation), Some(column.surface));
                if column.surface == TerrainMaterial::Sand {
                    assert!((0..=1).contains(&column.elevation));
                }
            }
        }
    }
    assert!(elevations.len() >= 4, "heights must vary");
    for material in [
        TerrainMaterial::Sand,
        TerrainMaterial::Water,
        TerrainMaterial::Ground,
        TerrainMaterial::Grass,
    ] {
        assert!(materials.contains(&material), "missing {material:?}");
    }
}

#[test]
fn chunk_edges_use_absolute_coordinates_without_seams() {
    let generator = TerrainGenerator::new(TerrainConfig::default()).unwrap();
    for chunk in [
        ChunkCoord { cx: -2, cy: 0 },
        ChunkCoord { cx: -1, cy: -1 },
        ChunkCoord { cx: 0, cy: 0 },
        ChunkCoord { cx: 1, cy: -2 },
    ] {
        let columns = generator.generate_chunk(chunk);
        assert_eq!(columns.len(), (CHUNK_SIZE * CHUNK_SIZE) as usize);
        for column in columns {
            assert_eq!(column, generator.column_at(column.coord));
        }
        let east = generator.generate_chunk(ChunkCoord {
            cx: chunk.cx + 1,
            cy: chunk.cy,
        });
        for y in 0..CHUNK_SIZE {
            let left = generator.column_at(WorldCoord {
                x: (chunk.cx + 1) * CHUNK_SIZE - 1,
                y: chunk.cy * CHUNK_SIZE + y,
            });
            let right = east
                .iter()
                .find(|column| column.coord.x == left.coord.x + 1 && column.coord.y == left.coord.y)
                .unwrap();
            assert_eq!(*right, generator.column_at(right.coord));
            assert!(left.elevation.abs_diff(right.elevation) <= 1);
        }
    }
}

#[test]
fn config_rejects_invalid_height_and_noise_ranges() {
    let config = TerrainConfig::default();
    assert!(
        TerrainGenerator::new(TerrainConfig {
            min_elevation: 0,
            ..config
        })
        .is_err()
    );
    assert!(
        TerrainGenerator::new(TerrainConfig {
            max_elevation: 0,
            ..config
        })
        .is_err()
    );
    assert!(
        TerrainGenerator::new(TerrainConfig {
            height_scale: f64::NAN,
            ..config
        })
        .is_err()
    );
    assert!(
        TerrainGenerator::new(TerrainConfig {
            detail_scale: 0.01,
            ..config
        })
        .is_err()
    );
    assert!(
        TerrainGenerator::new(TerrainConfig {
            max_elevation: i32::MAX,
            ..config
        })
        .is_err()
    );
    assert!(
        TerrainGenerator::new(TerrainConfig {
            ground_threshold: 1.2,
            ..config
        })
        .is_err()
    );
}
