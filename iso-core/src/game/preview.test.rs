use super::*;
use armada_core::grid::CHUNK_SIZE;
use armada_core::terrain::TerrainMaterial;

#[test]
fn preview_contains_four_chunks_in_far_to_near_order() {
    let world = PreviewWorld::new();
    assert_eq!(
        world.columns().len(),
        4 * (CHUNK_SIZE * CHUNK_SIZE) as usize
    );
    assert_eq!(
        world.elevation_at(PREVIEW_CENTRE),
        world
            .columns()
            .iter()
            .find(|c| c.coord == PREVIEW_CENTRE)
            .map(|c| c.elevation)
    );
    assert!(
        world
            .columns()
            .windows(2)
            .all(|pair| pair[0].coord.x + pair[0].coord.y >= pair[1].coord.x + pair[1].coord.y)
    );
    let nearby: std::collections::HashSet<_> = world
        .columns()
        .iter()
        .filter(|column| {
            (column.coord.x - PREVIEW_CENTRE.x).abs() <= 8
                && (column.coord.y - PREVIEW_CENTRE.y).abs() <= 8
        })
        .map(|column| column.surface)
        .collect();
    for material in [
        TerrainMaterial::Water,
        TerrainMaterial::Sand,
        TerrainMaterial::Ground,
        TerrainMaterial::Grass,
    ] {
        assert!(nearby.contains(&material));
    }
}
