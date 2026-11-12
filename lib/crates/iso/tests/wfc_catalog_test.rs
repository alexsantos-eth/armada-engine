//! Integration test for the wfc catalogue.
//! Loads `content/json/wfc.json` together with the biomes and the entity catalogues, the way the
//! client does, and checks that the shipped content can grow the rest of the world.

fn entities() -> iso::entities::EntityCatalog {
    serde_json::from_str(include_str!("../../../content/json/entities.json"))
        .expect("the entity catalog is valid JSON")
}

fn grass_columns(side: i32) -> Vec<iso::terrain::TerrainColumn> {
    use iso::grid::WorldCoord;
    use iso::terrain::{TerrainColumn, TerrainMaterial};
    (0..side)
        .flat_map(|x| {
            (0..side).map(move |y| TerrainColumn {
                coord: WorldCoord { x, y },
                elevation: 0,
                surface: TerrainMaterial::Grass,
                walkable: true,
            })
        })
        .collect()
}

#[test]
fn shipped_wfc_content_validates_against_entities_and_biomes() {
    let entities = entities();
    let biomes =
        iso::biomes::parse_biomes(include_str!("../../../content/json/biomes.json"), &entities)
            .expect("the shipped biomes content validates");
    let wfc = iso::entities::wfc::parse_wfc(
        include_str!("../../../content/json/wfc.json"),
        &entities,
        Some(&biomes),
    )
    .expect("the shipped wfc content validates");
    assert_eq!(wfc.schema_version, 2);
    assert_eq!(
        wfc.weights.len(),
        22,
        "every blueprint no biome claims has a weight"
    );
    assert_eq!(wfc.max_per_chunk["office"], 2.0);
    assert_eq!(wfc.max_per_chunk["hospital"], 1.0);
    assert_eq!(wfc.max_per_chunk["townhall"], 1.0);
}

#[test]
fn shipped_wfc_content_grows_deterministically_on_a_grass_chunk() {
    let entities = entities();
    let biomes =
        iso::biomes::parse_biomes(include_str!("../../../content/json/biomes.json"), &entities)
            .expect("the shipped biomes content validates");
    let wfc = iso::entities::wfc::parse_wfc(
        include_str!("../../../content/json/wfc.json"),
        &entities,
        Some(&biomes),
    )
    .expect("the shipped wfc content validates");
    let columns = grass_columns(24);
    let claimed = iso::entities::wfc::claimed_by_biomes(&entities, None);
    let first = iso::entities::wfc::solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed,
        &mut iso::grid::SpatialIndex::new(),
        iso::terrain::WORLD_SEED,
    );
    let second = iso::entities::wfc::solve_chunk(
        &columns,
        &entities,
        &wfc,
        &claimed,
        &mut iso::grid::SpatialIndex::new(),
        iso::terrain::WORLD_SEED,
    );
    let ids: Vec<_> = first.iter().map(|e| e.id()).collect();
    let ids_again: Vec<_> = second.iter().map(|e| e.id()).collect();
    assert_eq!(ids, ids_again);
    assert!(
        !first.is_empty(),
        "the shipped content must grow something on a grass chunk"
    );
    for entity in &first {
        let blueprint = entities
            .entities
            .iter()
            .find(|candidate| candidate.id == entity.type_())
            .expect("the grown entity exists in the catalog");
        let anchor = columns
            .iter()
            .find(|column| column.coord.x == entity.x() && column.coord.y == entity.y())
            .expect("the anchor is inside the chunk");
        assert_eq!(
            anchor.surface,
            blueprint.placement.surfaces[0],
            "{} anchors on its admitted surface",
            entity.type_()
        );
    }
}
