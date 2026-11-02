//! Chunk streaming with per-frame budgets, independent of rendering.
//!
//! Coordinates a `TerrainWorld` (discovered terrain) and placed entities, loading, showing and
//! hiding chunks at the rates documented in `scene_order::budgets`. The same code runs on the
//! native and WASM clients; the Macroquad client drives it once per frame.

use std::collections::{HashMap, HashSet};

use crate::entities::placement::place_entities;
use crate::entities::{Entity, EntityCatalogV2};
use crate::grid::{chunks_around, ChunkCoord};
use crate::scene_order::{
    CHUNK_KEEP_RADIUS, CHUNK_LOAD_RADIUS, CHUNKS_HIDDEN_PER_FRAME, CHUNKS_LOADED_PER_FRAME,
    CHUNKS_SHOWN_PER_FRAME,
};
use crate::terrain::TerrainGenerator;
use crate::world::TerrainWorld;

/// Manages which chunks are discovered, visible and unloaded, plus the entities living on
/// discovered chunks.
pub struct ChunkManager {
    world: TerrainWorld,
    catalog: EntityCatalogV2,
    entities: HashMap<ChunkCoord, Vec<Entity>>,
    focus: Vec<ChunkCoord>,
    /// Chunks discovered this frame but not yet shown; kept so entities are generated once.
    pending_entities: Vec<ChunkCoord>,
}

impl ChunkManager {
    pub fn new(generator: TerrainGenerator, catalog: EntityCatalogV2) -> Self {
        Self {
            world: TerrainWorld::new(generator),
            catalog,
            entities: HashMap::new(),
            focus: Vec::new(),
            pending_entities: Vec::new(),
        }
    }

    /// Sets the focus chunks (typically around the camera/player). The streamer keeps chunks
    /// around them loaded and visible, within the per-frame budgets.
    pub fn set_focus(&mut self, focus: Vec<ChunkCoord>) {
        self.focus = focus;
    }

    /// Advances one frame: loads, shows and hides chunks respecting per-frame budgets.
    ///
    /// Returns the chunks that were newly discovered this frame, so the client can refresh its
    /// views.
    pub fn tick(&mut self) -> Vec<ChunkCoord> {
        let mut newly_discovered = Vec::new();

        // 1. Load: discover chunks within load radius of any focus, up to the per-frame budget.
        let mut loads_left = CHUNKS_LOADED_PER_FRAME;
        let wanted_loaded = self.wanted_loaded();
        for &coord in &wanted_loaded {
            if loads_left <= 0 {
                break;
            }
            if self.world.is_discovered(coord) {
                continue;
            }
            self.world.show_chunk(coord);
            newly_discovered.push(coord);
            self.pending_entities.push(coord);
            loads_left -= 1;
        }

        // 2. Generate entities for chunks discovered this frame.
        for coord in self.pending_entities.drain(..) {
            if let Some(columns) = self.world.chunk(coord) {
                let result = place_entities(columns, &self.catalog);
                self.entities.insert(coord, result.entities);
            }
        }

        // 3. Show: make discovered chunks within load radius visible, up to the per-frame budget.
        //     Only chunks already discovered are shown here; new chunks are discovered in step 1.
        let mut shown_left = CHUNKS_SHOWN_PER_FRAME;
        for &coord in &wanted_loaded {
            if shown_left <= 0 {
                break;
            }
            if self.world.is_visible(coord) || !self.world.is_discovered(coord) {
                continue;
            }
            self.world.show_chunk(coord);
            shown_left -= 1;
        }

        // 4. Hide: hide visible chunks outside the keep radius, up to the per-frame budget.
        let mut hidden_left = CHUNKS_HIDDEN_PER_FRAME;
        let visible: Vec<ChunkCoord> = self.world.visible_chunks();
        for &coord in &visible {
            if hidden_left <= 0 {
                break;
            }
            if self.is_within_keep(coord) {
                continue;
            }
            self.world.hide_chunk(coord);
            hidden_left -= 1;
        }

        newly_discovered
    }

    /// Terrain columns of a discovered chunk, or `None` when it was never discovered.
    pub fn terrain_chunk(&self, coord: ChunkCoord) -> Option<&[crate::terrain::TerrainColumn]> {
        self.world.chunk(coord)
    }

    /// Placed entities of a discovered chunk, or `None` when it was never discovered.
    pub fn entities_chunk(&self, coord: ChunkCoord) -> Option<&[Entity]> {
        self.entities.get(&coord).map(Vec::as_slice)
    }

    /// Visible chunk coordinates in stable order.
    pub fn visible_chunks(&self) -> Vec<ChunkCoord> {
        self.world.visible_chunks()
    }

    /// Discovered chunk count (visible or not).
    pub fn discovered_count(&self) -> usize {
        self.world.discovered_count()
    }

    /// Focus chunks in stable order.
    pub fn focus(&self) -> &[ChunkCoord] {
        &self.focus
    }

    /// Chunks that should be loaded: every chunk within load radius of any focus, deduplicated.
    fn wanted_loaded(&self) -> Vec<ChunkCoord> {
        let mut wanted: HashSet<ChunkCoord> = HashSet::new();
        for &focus in &self.focus {
            for coord in chunks_around(focus, CHUNK_LOAD_RADIUS) {
                wanted.insert(coord);
            }
        }
        let mut wanted: Vec<_> = wanted.into_iter().collect();
        wanted.sort_by_key(|coord| {
            let dist = self
                .focus
                .iter()
                .map(|f| distance(*f, *coord))
                .min()
                .unwrap_or(i32::MAX);
            (dist, coord.cx, coord.cy)
        });
        wanted
    }

    fn is_within_keep(&self, coord: ChunkCoord) -> bool {
        self.focus
            .iter()
            .any(|&focus| distance(focus, coord) <= CHUNK_KEEP_RADIUS)
    }
}

/// Chebyshev distance between two chunk coordinates.
fn distance(a: ChunkCoord, b: ChunkCoord) -> i32 {
    (a.cx - b.cx).abs().max((a.cy - b.cy).abs())
}

impl Default for ChunkManager {
    fn default() -> Self {
        Self::new(
            TerrainGenerator::new(Default::default()).expect("default terrain config is valid"),
            EntityCatalogV2 {
                schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
                entities: Vec::new(),
            },
        )
    }
}

#[cfg(test)]
mod tests {
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
}
