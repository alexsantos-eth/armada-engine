    use super::*;
    use crate::entities::blueprint::EntityPlacement;
    use crate::entities::blueprint::EntityAsset;
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

    fn blueprint(id: &str, length: i32, surfaces: Vec<TerrainMaterial>) -> EntityBlueprintV2 {
        EntityBlueprintV2 {
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
            placement: EntityPlacement { surfaces },
        }
    }

    /// Every instance the validity rules allow, which is what these tests are about; the
    /// world's own density and gap are covered by their own tests.
    fn dense() -> PlacementRules {
        PlacementRules { gap: 0, density: 1 }
    }

    fn catalog(blueprints: Vec<EntityBlueprintV2>) -> EntityCatalogV2 {
        EntityCatalogV2 {
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
        assert!(result
            .entities
            .iter()
            .any(|e| e.id() == "house@0,0"));
        assert!(result
            .entities
            .iter()
            .any(|e| e.id() == "house@1,0"));
        assert!(result.index.is_occupied(WorldCoord { x: 0, y: 0 }));
        assert!(!result.index.is_occupied(WorldCoord { x: 0, y: 1 }));
    }

    /// The returned index is the one built during the pass rather than a second one rebuilt from
    /// the entities, so it has to cover every entity over its whole footprint — including the
    /// multi-cell ones, where the two could most easily disagree.
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
        // And nothing beyond those footprints is claimed.
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
        // Use a gap of 1 so adjacent columns cannot both host a tree.
        let mut columns_map = CellMap::new();
        for column in &columns {
            let _ = columns_map.insert(column.coord, *column);
        }
        let mut placed = SpatialIndex::new();
        let bp = &catalog.entities[0];
        let p0 = find_placement(WorldCoord { x: 0, y: 0 }, bp, &mut PlacementContext::new(&columns_map, &mut placed), 1);
        assert!(p0.is_some());
        let placement = p0.unwrap();
        let entity = Entity::new(placement.anchor.x, placement.anchor.y, bp, placement.elevation);
        let _ = placed.insert(entity, &placement.footprint);
        // After placing at (0,0) with gap 1, (1,0) is within the gap rectangle.
        let p1 = find_placement(WorldCoord { x: 1, y: 0 }, bp, &mut PlacementContext::new(&columns_map, &mut placed), 1);
        assert!(p1.is_none());
        // (2,0) is at Chebyshev distance 2 from (0,0), outside gap 1.
        let p2 = find_placement(WorldCoord { x: 2, y: 0 }, bp, &mut PlacementContext::new(&columns_map, &mut placed), 1);
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
/// decide the same way on every run, and the rate is roughly what was asked for.
#[test]
fn density_thins_placement_deterministically() {
    let columns: Vec<TerrainColumn> = (0..64)
        .flat_map(|x| (0..64).map(move |y| column(x, y, grass(), 0)))
        .collect();
    let catalog = catalog(vec![blueprint("tree", 1, vec![grass()])]);

    let rules = PlacementRules { gap: 0, density: 50 };
    let result = place_entities_with(&columns, &catalog, rules);
    // 4096 columns at one in fifty: enough placed to be a world, nowhere near a carpet.
    assert!(
        (40..=130).contains(&result.entities.len()),
        "{} entities placed, expected around 82",
        result.entities.len()
    );
    let again = place_entities_with(&columns, &catalog, rules);
    let ids: Vec<&str> = result.entities.iter().map(|e| e.id()).collect();
    let ids_again: Vec<&str> = again.entities.iter().map(|e| e.id()).collect();
    assert_eq!(ids, ids_again, "the same world must generate the same way twice");

    // And a denser rule is a superset: raising the rate only ever adds instances, because the
    // roll of a column does not depend on the rate.
    let denser = place_entities_with(&columns, &catalog, PlacementRules { gap: 0, density: 25 });
    assert!(denser.entities.len() > result.entities.len());
}

/// The default rules leave room between instances of a type, so a forest cannot grow into a
/// solid block of trunks.
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
