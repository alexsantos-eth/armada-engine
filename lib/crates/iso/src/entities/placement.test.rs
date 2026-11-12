use super::*;
use crate::entities::blueprint::EntityAsset;
use crate::entities::blueprint::EntityPlacement;
use crate::entities::entity::Entity;
use crate::entities::validation::CATALOG_SCHEMA_VERSION;
use crate::grid::WorldCoord;
use crate::terrain::TerrainMaterial;

fn grass() -> TerrainMaterial {
    TerrainMaterial::Grass
}
fn water() -> TerrainMaterial {
    TerrainMaterial::Water
}
fn sand() -> TerrainMaterial {
    TerrainMaterial::Sand
}

fn column(x: i32, y: i32, surface: TerrainMaterial, elevation: i32) -> TerrainColumn {
    TerrainColumn {
        coord: WorldCoord { x, y },
        elevation,
        surface,
        walkable: surface != TerrainMaterial::Water,
    }
}

fn blueprint(id: &str, length: i32, surfaces: Vec<TerrainMaterial>) -> EntityBlueprint {
    EntityBlueprint {
        id: id.to_owned(),
        asset: EntityAsset {
            sprite: format!("/assets/{}/block.svg", id),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
        },
        shape: crate::entities::blueprint::EntityShape {
            height: 1,
            length,
            axis: EntityLengthAxis::X,
            collision: vec![1.0; length as usize],
        },
        placement: EntityPlacement {
            surfaces,
            road_access: false,
        },
    }
}

/// Every instance the validity rules allow, which is what these tests are about; the
fn dense() -> PlacementRules {
    PlacementRules { gap: 0, density: 1 }
}

fn catalog(blueprints: Vec<EntityBlueprint>) -> EntityCatalog {
    EntityCatalog {
        schema_version: CATALOG_SCHEMA_VERSION,
        entities: blueprints,
    }
}

#[test]
fn places_one_entity_per_eligible_column() {
    let columns = vec![
        column(0, 0, grass(), 0),
        column(1, 0, grass(), 0),
        column(0, 1, water(), -1),
    ];
    let catalog = catalog(vec![blueprint("house", 1, vec![grass()])]);
    let result = place_entities_with(&columns, &catalog, dense());
    assert_eq!(result.entities.len(), 2);
    assert!(result.entities.iter().any(|e| e.id() == "house@0,0"));
    assert!(result.entities.iter().any(|e| e.id() == "house@1,0"));
    assert!(result.index.is_occupied(WorldCoord { x: 0, y: 0 }));
    assert!(!result.index.is_occupied(WorldCoord { x: 0, y: 1 }));
}

/// The returned index is the one built during the pass rather than a second one rebuilt from
#[test]
fn the_returned_index_covers_every_entity_footprint() {
    let columns = vec![
        column(0, 0, water(), -1),
        column(1, 0, sand(), 0),
        column(2, 0, grass(), 0),
        column(3, 0, grass(), 0),
    ];
    let catalog = catalog(vec![
        blueprint("pier", 3, vec![water(), sand(), grass()]),
        blueprint("house", 1, vec![grass()]),
    ]);
    let result = place_entities_with(&columns, &catalog, dense());
    assert_eq!(result.entities.len(), 2);

    for entity in &result.entities {
        for cell in crate::entities::entity::get_entity_footprint_for(entity) {
            assert!(
                result.index.is_occupied(cell),
                "{} is missing from the index at {cell:?}",
                entity.id()
            );
        }
    }
    assert!(!result.index.is_occupied(WorldCoord { x: 4, y: 0 }));
}

#[test]
fn does_not_place_on_wrong_surface() {
    let columns = vec![column(0, 0, water(), -1)];
    let catalog = catalog(vec![blueprint("house", 1, vec![grass()])]);
    let result = place_entities_with(&columns, &catalog, dense());
    assert!(result.entities.is_empty());
}

#[test]
fn multi_cell_footprint_requires_matching_surfaces() {
    let columns = vec![
        column(0, 0, water(), -1),
        column(1, 0, sand(), 0),
        column(2, 0, grass(), 0),
    ];
    let catalog = catalog(vec![blueprint("pier", 3, vec![water(), sand(), grass()])]);
    let result = place_entities_with(&columns, &catalog, dense());
    assert_eq!(result.entities.len(), 1);
    assert_eq!(result.entities[0].id(), "pier@0,0");
    assert_eq!(result.entities[0].elevation(), 0);
}

#[test]
fn respects_gap_between_same_type_instances() {
    let columns = vec![
        column(0, 0, grass(), 0),
        column(1, 0, grass(), 0),
        column(2, 0, grass(), 0),
        column(3, 0, grass(), 0),
    ];
    let catalog = catalog(vec![blueprint("tree", 1, vec![grass()])]);
    let mut columns_map = CellMap::new();
    for column in &columns {
        let _ = columns_map.insert(column.coord, *column);
    }
    let mut placed = SpatialIndex::new();
    let bp = &catalog.entities[0];
    let p0 = find_placement(
        WorldCoord { x: 0, y: 0 },
        bp,
        &mut PlacementContext::new(&columns_map, &mut placed),
        1,
    );
    assert!(p0.is_some());
    let placement = p0.unwrap();
    let entity = Entity::new(
        placement.anchor.x,
        placement.anchor.y,
        bp,
        placement.elevation,
    );
    let _ = placed.insert(entity, &placement.footprint);
    let p1 = find_placement(
        WorldCoord { x: 1, y: 0 },
        bp,
        &mut PlacementContext::new(&columns_map, &mut placed),
        1,
    );
    assert!(p1.is_none());
    let p2 = find_placement(
        WorldCoord { x: 2, y: 0 },
        bp,
        &mut PlacementContext::new(&columns_map, &mut placed),
        1,
    );
    assert!(p2.is_some());
}

#[test]
fn entity_id_matches_blueprint_and_anchor() {
    let columns = vec![column(5, -3, grass(), 0)];
    let catalog = catalog(vec![blueprint("tree", 1, vec![grass()])]);
    let result = place_entities_with(&columns, &catalog, dense());
    assert_eq!(result.entities[0].id(), "tree@5,-3");
}

/// The density rule thins placement without making it random: the same blueprint and column
#[test]
fn density_thins_placement_deterministically() {
    let columns: Vec<TerrainColumn> = (0..64)
        .flat_map(|x| (0..64).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let catalog = catalog(vec![blueprint("tree", 1, vec![grass()])]);

    let rules = PlacementRules {
        gap: 0,
        density: 50,
    };
    let result = place_entities_with(&columns, &catalog, rules);
    assert!(
        (40..=130).contains(&result.entities.len()),
        "{} entities placed, expected around 82",
        result.entities.len()
    );
    let again = place_entities_with(&columns, &catalog, rules);
    let ids: Vec<&str> = result.entities.iter().map(|e| e.id()).collect();
    let ids_again: Vec<&str> = again.entities.iter().map(|e| e.id()).collect();
    assert_eq!(
        ids, ids_again,
        "the same world must generate the same way twice"
    );

    let denser = place_entities_with(
        &columns,
        &catalog,
        PlacementRules {
            gap: 0,
            density: 25,
        },
    );
    assert!(denser.entities.len() > result.entities.len());
}

/// The default rules leave room between instances of a type, so a forest cannot grow into a
#[test]
fn the_default_gap_keeps_instances_of_a_type_apart() {
    let columns: Vec<TerrainColumn> = (0..32)
        .flat_map(|x| (0..32).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let catalog = catalog(vec![blueprint("tree", 1, vec![grass()])]);
    let result = place_entities_with(
        &columns,
        &catalog,
        PlacementRules {
            density: 1,
            ..PlacementRules::default()
        },
    );
    for a in &result.entities {
        for b in &result.entities {
            if a.id() == b.id() {
                continue;
            }
            let apart = (a.x() - b.x()).abs().max((a.y() - b.y()).abs());
            assert!(apart > 1, "{} and {} are touching", a.id(), b.id());
        }
    }
}

fn trees_catalog() -> EntityCatalog {
    catalog(vec![
        blueprint("tree", 1, vec![grass()]),
        blueprint("tree_2", 1, vec![grass()]),
        blueprint("tree_3", 1, vec![grass()]),
        blueprint("rock", 1, vec![grass()]),
    ])
}

fn tree_biomes(entities: &EntityCatalog) -> crate::biomes::field::WorldBiomes {
    let json = r#"{
        "schemaVersion": 1,
        "biomes": [
            { "id": "temperate_forest", "share": 50.0, "treeCoverage": 0.30,
              "trees": [
                  { "blueprint": "tree", "weight": 60.0 },
                  { "blueprint": "tree_2", "weight": 40.0 }
              ],
              "grassTints": ["bfd5bd", "dde9d4"], "groundTints": ["fffbea", "ffffff"] },
            { "id": "taiga", "share": 50.0, "treeCoverage": 0.30,
              "trees": [
                  { "blueprint": "tree_3", "weight": 100.0 }
              ],
              "grassTints": ["8fa884", "a9bda0"], "groundTints": ["8f8878", "a49d8d"] }
        ]
    }"#;
    let parsed = crate::biomes::catalog::parse_biomes(json, entities).expect("valid biomes");
    crate::biomes::field::WorldBiomes::new(42, &parsed)
}

#[test]
fn a_biome_species_only_grows_in_its_own_biome() {
    let entities = trees_catalog();
    let biomes = tree_biomes(&entities);
    let columns: Vec<TerrainColumn> = (-64..64)
        .flat_map(|x| (-64..64).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let result = place_entities_with_biomes(&columns, &entities, dense(), Some(&biomes));
    assert!(!result.entities.is_empty());
    for entity in &result.entities {
        if !matches!(entity.type_(), "tree" | "tree_2" | "tree_3") {
            continue;
        }
        let biome = biomes.biome(entity.x(), entity.y());
        let listed = biome
            .trees
            .iter()
            .any(|tree| tree.blueprint == entity.type_());
        assert!(
            listed,
            "{} grew at ({}, {}) in biome {}",
            entity.type_(),
            entity.x(),
            entity.y(),
            biome.id
        );
    }
}

#[test]
fn each_biome_grows_its_own_groves_somewhere() {
    let entities = trees_catalog();
    let biomes = tree_biomes(&entities);
    let columns: Vec<TerrainColumn> = (-192..192)
        .flat_map(|x| (-192..192).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let result = place_entities_with_biomes(&columns, &entities, dense(), Some(&biomes));
    let mut temperate = 0;
    let mut taiga = 0;
    for entity in &result.entities {
        match entity.type_() {
            "tree" | "tree_2" => temperate += 1,
            "tree_3" => taiga += 1,
            _ => {}
        }
    }
    assert!(temperate > 0, "the temperate biome must grow its trees");
    assert!(taiga > 0, "the taiga biome must grow its trees");
}

#[test]
fn a_blueprint_no_biome_claims_grows_in_every_biome() {
    let entities = trees_catalog();
    let biomes = tree_biomes(&entities);
    let columns: Vec<TerrainColumn> = (-192..192)
        .flat_map(|x| (-192..192).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let result = place_entities_with_biomes(&columns, &entities, dense(), Some(&biomes));
    let mut rock_biomes = std::collections::HashSet::new();
    for entity in &result.entities {
        if entity.type_() == "rock" {
            rock_biomes.insert(biomes.biome_index(entity.x(), entity.y()));
        }
    }
    assert_eq!(
        rock_biomes.len(),
        2,
        "rocks grow in both biomes, found in {rock_biomes:?}"
    );
}

#[test]
fn biome_placement_is_deterministic() {
    let entities = trees_catalog();
    let biomes = tree_biomes(&entities);
    let columns: Vec<TerrainColumn> = (-48..48)
        .flat_map(|x| (-48..48).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let first = place_entities_with_biomes(&columns, &entities, dense(), Some(&biomes));
    let second = place_entities_with_biomes(&columns, &entities, dense(), Some(&biomes));
    let ids: Vec<&str> = first.entities.iter().map(|e| e.id()).collect();
    let ids_again: Vec<&str> = second.entities.iter().map(|e| e.id()).collect();
    assert_eq!(ids, ids_again);
}

#[test]
fn biome_placement_without_biomes_matches_the_old_path() {
    let entities = trees_catalog();
    let columns: Vec<TerrainColumn> = (-16..16)
        .flat_map(|x| (-16..16).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let with = place_entities_with_biomes(&columns, &entities, dense(), None);
    let without = place_entities_with(&columns, &entities, dense());
    let ids: Vec<&str> = with.entities.iter().map(|e| e.id()).collect();
    let ids_without: Vec<&str> = without.entities.iter().map(|e| e.id()).collect();
    assert_eq!(ids, ids_without);
}

fn tree_biomes_with_catalog(
    entities: &EntityCatalog,
) -> (
    crate::biomes::catalog::BiomeCatalog,
    crate::biomes::field::WorldBiomes,
) {
    let json = r#"{
        "schemaVersion": 1,
        "biomes": [
            { "id": "temperate_forest", "share": 50.0, "treeCoverage": 0.30,
              "trees": [
                  { "blueprint": "tree", "weight": 60.0 },
                  { "blueprint": "tree_2", "weight": 40.0 }
              ],
              "grassTints": ["bfd5bd", "dde9d4"], "groundTints": ["fffbea", "ffffff"] },
            { "id": "taiga", "share": 50.0, "treeCoverage": 0.30,
              "trees": [
                  { "blueprint": "tree_3", "weight": 100.0 }
              ],
              "grassTints": ["8fa884", "a9bda0"], "groundTints": ["8f8878", "a49d8d"] }
        ]
    }"#;
    let catalog = crate::biomes::catalog::parse_biomes(json, entities).expect("valid biomes");
    let field = crate::biomes::field::WorldBiomes::new(42, &catalog);
    (catalog, field)
}

#[test]
fn the_biome_and_wfc_passes_coexist_deterministically() {
    let entities = trees_catalog();
    let (biomes_catalog, biomes) = tree_biomes_with_catalog(&entities);
    let wfc = crate::entities::wfc::parse_wfc(
        r#"{ "schemaVersion": 2, "emptyWeight": 50.0, "weights": { "rock": 1.0 } }"#,
        &entities,
        Some(&biomes_catalog),
    )
    .expect("valid wfc content");
    let columns: Vec<TerrainColumn> = (-48..48)
        .flat_map(|x| (-48..48).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let content = || PlacementContent {
        biomes: Some(&biomes),
        wfc: Some(&wfc),
        seed: 123,
    };
    let first = place_entities_with_content(&columns, &entities, dense(), content());
    let second = place_entities_with_content(&columns, &entities, dense(), content());
    let ids: Vec<_> = first.entities.iter().map(|e| e.id()).collect();
    let ids_again: Vec<_> = second.entities.iter().map(|e| e.id()).collect();
    assert_eq!(ids, ids_again);
    let grew_biome = first
        .entities
        .iter()
        .any(|e| matches!(e.type_(), "tree" | "tree_2" | "tree_3"));
    let grew_wfc = first.entities.iter().any(|e| e.type_() == "rock");
    assert!(grew_biome, "the biome pass must grow its trees");
    assert!(grew_wfc, "the wfc pass must grow rocks");
    let mut seen = std::collections::HashSet::new();
    for entity in &first.entities {
        assert!(
            seen.insert((entity.x(), entity.y())),
            "two entities grew on the same cell: {:?}",
            (entity.x(), entity.y())
        );
    }
}

#[test]
fn the_content_path_with_no_wfc_matches_the_biome_path() {
    let entities = trees_catalog();
    let biomes = tree_biomes(&entities);
    let columns: Vec<TerrainColumn> = (-32..32)
        .flat_map(|x| (-32..32).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let with = place_entities_with_content(
        &columns,
        &entities,
        dense(),
        PlacementContent {
            biomes: Some(&biomes),
            wfc: None,
            seed: 123,
        },
    );
    let without = place_entities_with_biomes(&columns, &entities, dense(), Some(&biomes));
    let ids: Vec<_> = with.entities.iter().map(|e| e.id()).collect();
    let ids_without: Vec<_> = without.entities.iter().map(|e| e.id()).collect();
    assert_eq!(ids, ids_without);
}

#[cfg(test)]
mod by_hand {
    use super::*;
    use crate::entities::blueprint::EntityShape;

    fn grass_chunk() -> Vec<TerrainColumn> {
        crate::terrain::flat_chunk(
            crate::grid::ChunkCoord { cx: 0, cy: 0 },
            0,
            TerrainMaterial::Grass,
        )
    }

    fn hut(length: i32, axis: EntityLengthAxis) -> EntityBlueprint {
        EntityBlueprint {
            id: "hut".to_owned(),
            asset: EntityAsset {
                sprite: "/assets/hut.svg".to_owned(),
                reflection: None,
                color_replacements: None,
                sway: None,
                contact_shadow: None,
            },
            shape: EntityShape {
                height: 1,
                length,
                axis,
                collision: vec![0.5; length as usize],
            },
            placement: EntityPlacement {
                surfaces: vec![TerrainMaterial::Grass; length as usize],
                road_access: false,
            },
        }
    }

    #[test]
    fn a_hand_placement_lands_on_the_right_surface() {
        let columns = grass_chunk();
        let placement = placement_by_hand(
            WorldCoord { x: 4, y: 4 },
            &hut(1, EntityLengthAxis::X),
            &columns,
            &[],
        )
        .expect("grass takes a hut");
        assert_eq!(placement.anchor, WorldCoord { x: 4, y: 4 });
        assert_eq!(placement.elevation, 0);
        assert_eq!(placement.footprint.len(), 1);
    }

    #[test]
    fn a_hand_placement_is_refused_on_the_wrong_surface() {
        let mut columns = grass_chunk();
        for column in &mut columns {
            column.surface = TerrainMaterial::Sand;
        }
        assert!(
            placement_by_hand(
                WorldCoord { x: 4, y: 4 },
                &hut(1, EntityLengthAxis::X),
                &columns,
                &[]
            )
            .is_none()
        );
    }

    #[test]
    fn a_hand_placement_is_refused_over_an_entity_already_standing_there() {
        let columns = grass_chunk();
        let blueprint = hut(1, EntityLengthAxis::X);
        let standing = Entity::new(4, 4, &blueprint, 0);
        assert!(
            placement_by_hand(WorldCoord { x: 4, y: 4 }, &blueprint, &columns, &[standing])
                .is_none()
        );
    }

    #[test]
    fn a_hand_placement_ignores_the_spacing_rule_between_its_own_kind() {
        let columns = grass_chunk();
        let blueprint = hut(1, EntityLengthAxis::X);
        let neighbour = Entity::new(4, 4, &blueprint, 0);
        assert!(
            placement_by_hand(
                WorldCoord { x: 5, y: 4 },
                &blueprint,
                &columns,
                &[neighbour]
            )
            .is_some()
        );
    }

    #[test]
    fn a_hand_placement_needs_one_level_under_its_whole_footprint() {
        let mut columns = grass_chunk();
        for column in &mut columns {
            if column.coord == (WorldCoord { x: 5, y: 4 }) {
                column.elevation = 1;
            }
        }
        let blueprint = hut(2, EntityLengthAxis::X);
        assert!(placement_by_hand(WorldCoord { x: 4, y: 4 }, &blueprint, &columns, &[]).is_none());
        assert!(placement_by_hand(WorldCoord { x: 4, y: 6 }, &blueprint, &columns, &[]).is_some());
    }

    #[test]
    fn a_hand_placement_runs_along_the_blueprint_axis() {
        let columns = grass_chunk();
        let placement = placement_by_hand(
            WorldCoord { x: 4, y: 4 },
            &hut(2, EntityLengthAxis::Y),
            &columns,
            &[],
        )
        .expect("grass takes a hut");
        assert_eq!(
            placement.footprint,
            vec![WorldCoord { x: 4, y: 4 }, WorldCoord { x: 4, y: 5 }]
        );
    }
}
