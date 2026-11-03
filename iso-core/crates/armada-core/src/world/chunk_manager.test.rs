    use super::*;
    use crate::entities::blueprint::{
        EntityAsset, EntityBlueprintV2, EntityLengthAxis, EntityPlacement, EntityShape,
    };
    use crate::entities::validation::CATALOG_SCHEMA_VERSION;
    use crate::terrain::{TerrainConfig, TerrainGenerator, TerrainMaterial};

    fn catalog() -> EntityCatalogV2 {
        EntityCatalogV2 {
            schema_version: CATALOG_SCHEMA_VERSION,
            entities: vec![EntityBlueprintV2 {
                id: "tree".to_owned(),
                asset: EntityAsset {
                    sprite: "/assets/tree/block.svg".to_owned(),
                    reflection: None,
                    color_replacements: None,
                    sway: None,
                    contact_shadow: None,
                },
                shape: EntityShape {
                    height: 2,
                    length: 1,
                    axis: EntityLengthAxis::X,
                    collision: vec![0.15],
                },
                placement: EntityPlacement {
                    surfaces: vec![TerrainMaterial::Grass],
                },
            }],
        }
    }

    fn generator() -> TerrainGenerator {
        TerrainGenerator::new(TerrainConfig {
            seed: 1,
            min_elevation: -2,
            max_elevation: 2,
            height_scale: 48.0,
            detail_scale: 16.0,
            ground_threshold: 0.5,
        })
        .expect("valid config")
    }

    #[test]
    fn discovers_and_shows_chunks_within_load_radius() {
        let mut manager = ChunkManager::new(generator(), catalog());
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        let discovered = manager.tick();
        assert!(!discovered.is_empty());
        // The first discovered chunk is immediately visible.
        assert!(manager.visible_chunks().contains(&discovered[0]));
    }

    #[test]
    fn respects_load_budget_one_chunk_per_frame() {
        let mut manager = ChunkManager::new(generator(), catalog());
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        // Many chunks are wanted but only one is loaded per frame.
        let first = manager.tick();
        let second = manager.tick();
        assert_eq!(first.len(), 1);
        assert_eq!(second.len(), 1);
        assert_ne!(first[0], second[0]);
    }

    #[test]
    fn hides_chunks_outside_keep_radius() {
        let mut manager = ChunkManager::new(generator(), catalog());
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        manager.tick();
        manager.set_focus(vec![ChunkCoord { cx: 10, cy: 10 }]);
        // Hide up to CHUNKS_HIDDEN_PER_FRAME per frame; repeat until origin is hidden.
        for _ in 0..10 {
            manager.tick();
            if !manager.visible_chunks().contains(&ChunkCoord { cx: 0, cy: 0 }) {
                break;
            }
        }
        assert!(!manager.visible_chunks().contains(&ChunkCoord { cx: 0, cy: 0 }));
        // Discovery is not undone by hiding.
        assert!(manager.discovered_count() > 0);
    }

    #[test]
    fn generates_entities_for_discovered_chunks() {
        let mut manager = ChunkManager::new(generator(), catalog());
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        manager.tick();
        // The origin chunk may or may not have grass; placement must run without panicking and
        // store something (maybe empty) for the chunk.
        let _ = manager.entities_chunk(ChunkCoord { cx: 0, cy: 0 });
    }

    #[test]
    fn save_and_restore_round_trip() {
        let mut manager = ChunkManager::new(generator(), catalog());
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        manager.tick();
        manager.tick();

        // Save discovered chunks.
        let saved = manager.save_all();
        assert!(!saved.is_empty());

        // Build an archive and restore into a fresh manager.
        let mut archive = crate::world::save::ChunkArchive::new();
        for chunk in saved {
            archive.put(chunk);
        }
        let save = archive.snapshot(
            serde_json::json!({}),
            serde_json::json!({}),
        );

        let mut restored = ChunkManager::new(generator(), catalog());
        assert!(restored.load_from_save(&save).is_empty());

        // Discovered count should match.
        assert_eq!(restored.discovered_count(), manager.discovered_count());
    }

    /// Streaming reaches past the load radius so the ground is generated before the camera gets
    /// there, which is what `CHUNK_PREFETCH_RADIUS` is for.
    #[test]
    fn loads_ahead_up_to_the_prefetch_radius() {
        let mut manager = ChunkManager::new(generator(), catalog());
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        let wanted = (2 * CHUNK_PREFETCH_RADIUS + 1).pow(2);
        for _ in 0..wanted {
            manager.tick();
        }
        assert_eq!(manager.discovered_count(), wanted as usize);
        // A chunk loaded ahead exists but is not drawn until it comes within the load radius.
        let ahead = ChunkCoord { cx: CHUNK_PREFETCH_RADIUS, cy: 0 };
        assert!(manager.is_discovered(ahead));
        assert!(!manager.visible_chunks().contains(&ahead));
    }

    /// The nearest missing chunk is always generated first, so the ground under the camera never
    /// waits behind one loaded ahead of it.
    #[test]
    fn loads_the_nearest_missing_chunk_first() {
        let mut manager = ChunkManager::new(generator(), catalog());
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        let mut order = Vec::new();
        for _ in 0..(2 * CHUNK_PREFETCH_RADIUS + 1).pow(2) {
            order.extend(manager.tick());
        }
        let distances: Vec<i32> = order
            .iter()
            .map(|c| c.cx.abs().max(c.cy.abs()))
            .collect();
        assert!(
            distances.windows(2).all(|pair| pair[0] <= pair[1]),
            "chunks were not generated nearest first: {distances:?}"
        );
    }

    /// Hiding a chunk keeps it in memory; unloading is what bounds a long session.
    #[test]
    fn unloading_frees_terrain_and_entities_and_returns_the_saved_chunk() {
        let mut manager = ChunkManager::new(generator(), catalog());
        let origin = ChunkCoord { cx: 0, cy: 0 };
        manager.set_focus(vec![origin]);
        manager.tick();
        assert!(manager.is_discovered(origin));

        manager.set_focus(vec![ChunkCoord { cx: 40, cy: 40 }]);
        let candidates = manager.unload_candidates();
        assert!(candidates.contains(&origin));

        let before = manager.discovered_count();
        let saved = manager.unload_chunk(origin).expect("origin was discovered");
        assert_eq!((saved.cx, saved.cy), (origin.cx, origin.cy));
        assert_eq!(manager.discovered_count(), before - 1);
        assert!(!manager.is_discovered(origin));
        assert!(manager.entities_chunk(origin).is_none());
        assert!(manager.terrain_chunk(origin).is_none());
    }

    #[test]
    fn unloading_an_undiscovered_chunk_returns_none() {
        let mut manager = ChunkManager::new(generator(), catalog());
        assert!(manager.unload_chunk(ChunkCoord { cx: 7, cy: 7 }).is_none());
    }

    /// The client asks for one candidate a frame, so it uses the allocation-free form; it has
    /// to agree with the list, including when a focus moves and the distances change.
    #[test]
    fn the_next_candidate_is_the_first_of_the_list() {
        let mut manager = ChunkManager::new(generator(), catalog());
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        for _ in 0..12 {
            manager.tick();
        }
        for focus in [
            ChunkCoord { cx: 0, cy: 0 },
            ChunkCoord { cx: 5, cy: 0 },
            ChunkCoord { cx: -4, cy: 6 },
            ChunkCoord { cx: 40, cy: 40 },
        ] {
            manager.set_focus(vec![focus]);
            assert_eq!(
                manager.next_unload_candidate(),
                manager.unload_candidates().first().copied(),
                "disagreed with the list at focus {focus:?}"
            );
        }
    }

    /// A chunk kept near a focus is never offered for unloading, which is the hysteresis that
    /// stops a focus crossing a chunk edge from unloading and regenerating the same ground.
    #[test]
    fn chunks_within_the_keep_radius_are_never_unload_candidates() {
        let mut manager = ChunkManager::new(generator(), catalog());
        let origin = ChunkCoord { cx: 0, cy: 0 };
        manager.set_focus(vec![origin]);
        for _ in 0..9 {
            manager.tick();
        }
        for coord in manager.unload_candidates() {
            assert!(coord.cx.abs().max(coord.cy.abs()) > CHUNK_KEEP_RADIUS);
        }
    }

    /// Unloading then restoring from the archive must give back the same ground, which is the
    /// whole point of persisting a chunk before dropping it.
    #[test]
    fn an_unloaded_chunk_comes_back_unchanged_from_its_archive() {
        let mut manager = ChunkManager::new(generator(), catalog());
        let origin = ChunkCoord { cx: 0, cy: 0 };
        manager.set_focus(vec![origin]);
        manager.tick();
        let columns_before = manager.terrain_chunk(origin).expect("discovered").to_vec();
        let entities_before = manager.entities_chunk(origin).unwrap_or_default().len();

        manager.set_focus(vec![ChunkCoord { cx: 40, cy: 40 }]);
        let mut archive = crate::world::save::ChunkArchive::new();
        archive.put(manager.unload_chunk(origin).expect("discovered"));
        let save = archive.snapshot(serde_json::json!({}), serde_json::json!({}));

        assert!(manager.load_from_save(&save).is_empty());
        assert_eq!(manager.terrain_chunk(origin), Some(columns_before.as_slice()));
        assert_eq!(
            manager.entities_chunk(origin).unwrap_or_default().len(),
            entities_before
        );
    }

    /// Saved terrain has to win over generated terrain, or restoring a save over a chunk the
    /// generator already touched would silently throw the save away.
    #[test]
    fn a_save_replaces_terrain_the_generator_already_produced() {
        let mut manager = ChunkManager::new(generator(), catalog());
        let origin = ChunkCoord { cx: 0, cy: 0 };
        manager.set_focus(vec![origin]);
        manager.tick();

        let generated = manager.terrain_chunk(origin).expect("discovered")[0].walkable;
        let mut saved = manager.save_chunk(origin).expect("discovered");
        saved.columns[0].walkable = !generated;
        let mut archive = crate::world::save::ChunkArchive::new();
        archive.put(saved);
        let save = archive.snapshot(serde_json::json!({}), serde_json::json!({}));

        assert!(manager.load_from_save(&save).is_empty());
        assert_eq!(
            manager.terrain_chunk(origin).expect("loaded")[0].walkable,
            !generated,
            "the generated chunk was kept instead of the saved one"
        );
    }

    /// A save naming a blueprint the catalog no longer defines is reported, not swallowed.
    #[test]
    fn restoring_reports_blueprints_the_catalog_does_not_define() {
        let mut manager = ChunkManager::new(generator(), catalog());
        let save = crate::world::save::WorldSave {
            format: crate::world::save::SAVE_FORMAT.to_owned(),
            schema_version: crate::world::save::SAVE_SCHEMA_VERSION,
            chunks: vec![crate::world::save::SavedChunk {
                cx: 0,
                cy: 0,
                columns: Vec::new(),
                entities: vec![crate::world::save::SavedEntity {
                    instance_id: "ghost@0,0".to_owned(),
                    blueprint_id: "ghost".to_owned(),
                    x: 0,
                    y: 0,
                    elevation: 0,
                    state: serde_json::json!({}),
                }],
                changes: serde_json::json!({}),
            }],
            player: serde_json::json!({}),
            systems: serde_json::json!({}),
        };
        assert_eq!(manager.load_from_save(&save), vec!["ghost".to_owned()]);
        assert!(manager.entities_chunk(ChunkCoord { cx: 0, cy: 0 }).unwrap().is_empty());
    }

    /// An entity's colour variation and metadata have to survive a save, because the restore
    /// path reads them back out of the saved state.
    #[test]
    fn entity_state_survives_a_save_round_trip() {
        let mut manager = ChunkManager::new(generator(), catalog());
        let origin = ChunkCoord { cx: 0, cy: 0 };
        manager.world.load_chunk(origin, Vec::new());
        manager.entities.insert(
            origin,
            vec![crate::entities::Entity::restore(
                3,
                4,
                &catalog().entities[0],
                1,
                "tree@3,4".to_owned(),
                Some(2),
                serde_json::json!({ "planted": true }),
            )],
        );

        let saved = manager.save_chunk(origin).expect("discovered");
        assert_eq!(saved.entities[0].state["colorVariant"], 2);
        assert_eq!(saved.entities[0].state["planted"], true);

        let mut archive = crate::world::save::ChunkArchive::new();
        archive.put(saved);
        let save = archive.snapshot(serde_json::json!({}), serde_json::json!({}));
        let mut restored = ChunkManager::new(generator(), catalog());
        assert!(restored.load_from_save(&save).is_empty());

        let entity = &restored.entities_chunk(origin).expect("restored")[0];
        assert_eq!(entity.id(), "tree@3,4");
        assert_eq!(entity.color_variant(), Some(2));
        assert_eq!(entity.metadata()["planted"], true);
    }

    /// A client that draws a small view can stream less than the shared defaults, and then no
    /// chunk is discovered past the radius it asked for.
    #[test]
    fn streams_only_as_far_as_the_requested_radii() {
        let radii = ChunkRadii { load: 1, prefetch: 1, keep: 2 };
        let mut manager = ChunkManager::with_radii(generator(), catalog(), radii);
        assert_eq!(manager.radii(), radii);
        manager.set_focus(vec![ChunkCoord { cx: 0, cy: 0 }]);
        for _ in 0..(2 * CHUNK_PREFETCH_RADIUS + 1).pow(2) {
            manager.tick();
        }
        assert_eq!(manager.discovered_count(), 9);
        assert!(!manager.is_discovered(ChunkCoord { cx: 2, cy: 0 }));
    }

    /// Whatever a client asks for, the radii still grow outwards: a keep radius under the
    /// prefetch radius would unload a chunk the streamer is still asking for every frame.
    #[test]
    fn radii_are_clamped_so_they_grow_outwards() {
        assert_eq!(
            ChunkRadii { load: 0, prefetch: 0, keep: 0 }.normalized(),
            ChunkRadii { load: 1, prefetch: 1, keep: 1 }
        );
        assert_eq!(
            ChunkRadii { load: 2, prefetch: 1, keep: 1 }.normalized(),
            ChunkRadii { load: 2, prefetch: 2, keep: 2 }
        );
        assert_eq!(
            ChunkRadii::default(),
            ChunkRadii {
                load: CHUNK_LOAD_RADIUS,
                prefetch: CHUNK_PREFETCH_RADIUS,
                keep: CHUNK_KEEP_RADIUS,
            }
        );
    }
