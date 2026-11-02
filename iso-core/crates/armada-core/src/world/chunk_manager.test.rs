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
        restored.load_from_save(&save);

        // Discovered count should match.
        assert_eq!(restored.discovered_count(), manager.discovered_count());
    }
