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
    CHUNK_KEEP_RADIUS, CHUNK_LOAD_RADIUS, CHUNK_PREFETCH_RADIUS, CHUNKS_HIDDEN_PER_FRAME,
    CHUNKS_LOADED_PER_FRAME, CHUNKS_SHOWN_PER_FRAME,
};
use crate::terrain::TerrainGenerator;
use crate::world::TerrainWorld;

/// How far the streamer loads, prefetches and keeps chunks around each focus.
///
/// The defaults are the shared budgets, the same numbers the TypeScript client uses. A client
/// may ask for less: a client that draws a small view (one zoomed in, or one whose player is
/// drawn large) never reaches the outer rings, and every chunk it loads anyway costs terrain
/// generation, entity placement, memory and save size.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ChunkRadii {
    /// Chunks needed around each focus; these are the ones made visible.
    pub load: i32,
    /// Chunks discovered ahead of the focus, once the needed ones are in.
    pub prefetch: i32,
    /// Chunks kept loaded before they are offered for unloading (hysteresis).
    pub keep: i32,
}

impl Default for ChunkRadii {
    fn default() -> Self {
        Self {
            load: CHUNK_LOAD_RADIUS,
            prefetch: CHUNK_PREFETCH_RADIUS,
            keep: CHUNK_KEEP_RADIUS,
        }
    }
}

impl ChunkRadii {
    /// Clamps the radii so they still grow outwards, whatever a caller asked for: a keep radius
    /// below the prefetch radius would unload a chunk the streamer is still asking for, and the
    /// two would fight every frame.
    pub fn normalized(self) -> Self {
        let load = self.load.max(1);
        let prefetch = self.prefetch.max(load);
        Self {
            load,
            prefetch,
            keep: self.keep.max(prefetch),
        }
    }
}

/// Manages which chunks are discovered, visible and unloaded, plus the entities living on
/// discovered chunks.
pub struct ChunkManager {
    world: TerrainWorld,
    catalog: EntityCatalogV2,
    entities: HashMap<ChunkCoord, Vec<Entity>>,
    focus: Vec<ChunkCoord>,
    /// Chunks discovered this frame but not yet shown; kept so entities are generated once.
    pending_entities: Vec<ChunkCoord>,
    radii: ChunkRadii,
}

impl ChunkManager {
    pub fn new(generator: TerrainGenerator, catalog: EntityCatalogV2) -> Self {
        Self::with_radii(generator, catalog, ChunkRadii::default())
    }

    /// Same as [`Self::new`] with streaming radii of the client's choosing.
    pub fn with_radii(
        generator: TerrainGenerator,
        catalog: EntityCatalogV2,
        radii: ChunkRadii,
    ) -> Self {
        Self {
            world: TerrainWorld::new(generator),
            catalog,
            entities: HashMap::new(),
            focus: Vec::new(),
            pending_entities: Vec::new(),
            radii: radii.normalized(),
        }
    }

    /// The radii this streamer is using, already normalized.
    pub fn radii(&self) -> ChunkRadii {
        self.radii
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

        // 1. Load: discover chunks around every focus, up to the per-frame budget.
        //
        //    The candidate list reaches out to `CHUNK_PREFETCH_RADIUS` and is sorted by
        //    distance, so the ring a shown chunk needs for its edges is always discovered
        //    before the ring loaded ahead of the camera. Both share one budget, which is what
        //    keeps generation spread over frames instead of landing in one.
        let mut loads_left = CHUNKS_LOADED_PER_FRAME;
        let wanted_loaded = self.chunks_within(self.radii.load);
        for coord in self.chunks_within(self.radii.prefetch) {
            if loads_left <= 0 {
                break;
            }
            if self.world.is_discovered(coord) {
                continue;
            }
            self.world.discover_chunk(coord);
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

    /// Terrain column at an absolute world coordinate, or `None` when its chunk was never
    /// discovered.
    pub fn column_at(&self, x: i32, y: i32) -> Option<crate::terrain::TerrainColumn> {
        let coord = crate::grid::to_chunk_coord(crate::grid::WorldCoord { x, y });
        let chunk = self.world.chunk(coord)?;
        let local = crate::grid::to_local_coord(crate::grid::WorldCoord { x, y });
        let index = (local.lx * crate::grid::CHUNK_SIZE + local.ly) as usize;
        chunk.get(index).copied()
    }

    /// Whether a chunk has been discovered.
    pub fn is_discovered(&self, coord: ChunkCoord) -> bool {
        self.world.is_discovered(coord)
    }

    /// Placed entities of a discovered chunk, or `None` when it was never discovered.
    pub fn entities_chunk(&self, coord: ChunkCoord) -> Option<&[Entity]> {
        self.entities.get(&coord).map(Vec::as_slice)
    }

    /// Converts a discovered chunk into its saved form, storing terrain and entities.
    /// Returns `None` when the chunk was never discovered.
    pub fn save_chunk(&self, coord: ChunkCoord) -> Option<crate::world::save::SavedChunk> {
        let columns = self.world.chunk(coord)?;
        let saved_columns: Vec<crate::world::save::SavedColumn> = columns
            .iter()
            .map(crate::world::save::terrain_column_to_saved)
            .collect();
        let saved_entities: Vec<crate::world::save::SavedEntity> = self
            .entities
            .get(&coord)
            .map(|ents| {
                ents.iter()
                    .map(|e| crate::world::save::SavedEntity {
                        instance_id: e.id().to_owned(),
                        blueprint_id: e.type_().to_owned(),
                        x: e.x(),
                        y: e.y(),
                        elevation: e.elevation(),
                        // The instance's own state, so the round trip is lossless. Writing an
                        // empty object here while `load_from_save` read `colorVariant` back out
                        // of it meant a saved colour variation could never survive a reload.
                        state: saved_entity_state(e),
                    })
                    .collect()
            })
            .unwrap_or_default();
        Some(crate::world::save::SavedChunk {
            cx: coord.cx,
            cy: coord.cy,
            columns: saved_columns,
            entities: saved_entities,
            changes: serde_json::json!({}),
        })
    }

    /// Converts every discovered chunk into saved form.
    pub fn save_all(&self) -> Vec<crate::world::save::SavedChunk> {
        let mut chunks = Vec::new();
        for coord in self.world.discovered_chunks() {
            if let Some(saved) = self.save_chunk(coord) {
                chunks.push(saved);
            }
        }
        chunks.sort_by_key(|c| (c.cy, c.cx));
        chunks
    }

    /// Restores chunks from a save into this manager, bypassing generation.
    ///
    /// Returns the blueprint ids the save referred to but the catalog does not define. Those
    /// entities are skipped: reporting them is what lets a client tell a catalog that moved on
    /// from a corrupt save, instead of silently reopening a world with missing scenery.
    pub fn load_from_save(&mut self, save: &crate::world::save::WorldSave) -> Vec<String> {
        // One index for the whole save. Scanning the catalog per saved entity was
        // O(entities x blueprints): 21 589 entities against 63 blueprints in a 42-chunk world.
        let blueprints: HashMap<&str, &crate::entities::EntityBlueprintV2> = self
            .catalog
            .entities
            .iter()
            .map(|blueprint| (blueprint.id.as_str(), blueprint))
            .collect();
        let mut unknown: HashSet<String> = HashSet::new();

        for chunk in &save.chunks {
            let coord = ChunkCoord { cx: chunk.cx, cy: chunk.cy };
            let columns: Vec<crate::terrain::TerrainColumn> = chunk
                .columns
                .iter()
                .map(crate::world::save::saved_to_terrain_column)
                .collect();
            self.world.load_chunk(coord, columns);

            let mut entities = Vec::with_capacity(chunk.entities.len());
            for saved in &chunk.entities {
                let Some(blueprint) = blueprints.get(saved.blueprint_id.as_str()) else {
                    unknown.insert(saved.blueprint_id.clone());
                    continue;
                };
                entities.push(crate::entities::Entity::restore(
                    saved.x,
                    saved.y,
                    blueprint,
                    saved.elevation,
                    saved.instance_id.clone(),
                    saved
                        .state
                        .get("colorVariant")
                        .and_then(serde_json::Value::as_u64)
                        .map(|variant| variant as u32),
                    saved.state.clone(),
                ));
            }
            self.entities.insert(coord, entities);
        }

        let mut unknown: Vec<String> = unknown.into_iter().collect();
        unknown.sort();
        unknown
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

    /// Every chunk within `radius` of any focus, deduplicated and sorted nearest first.
    ///
    /// The order is what makes the per-frame budget fair: the nearest missing chunk is always
    /// the one generated next, so the ground under the camera never waits behind a chunk loaded
    /// ahead of it. Ties break on coordinates so the sequence does not depend on hash order.
    fn chunks_within(&self, radius: i32) -> Vec<ChunkCoord> {
        let mut wanted: HashSet<ChunkCoord> = HashSet::new();
        for &focus in &self.focus {
            for coord in chunks_around(focus, radius) {
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
            .any(|&focus| distance(focus, coord) <= self.radii.keep)
    }

    /// Discovered chunks further than `CHUNK_KEEP_RADIUS` from every focus, nearest first.
    ///
    /// Hiding a chunk stops drawing it but keeps its terrain and entities in memory, so a
    /// session that explores far enough grows without bound: the save written from a 42-chunk
    /// world already weighs tens of megabytes. These are the chunks a client should persist and
    /// then hand to [`Self::unload_chunk`].
    pub fn unload_candidates(&self) -> Vec<ChunkCoord> {
        let mut stale: Vec<ChunkCoord> = self
            .world
            .discovered_chunks()
            .into_iter()
            .filter(|&coord| !self.is_within_keep(coord))
            .collect();
        stale.sort_by_key(|coord| {
            let dist = self
                .focus
                .iter()
                .map(|f| distance(*f, *coord))
                .min()
                .unwrap_or(i32::MAX);
            (std::cmp::Reverse(dist), coord.cx, coord.cy)
        });
        stale
    }

    /// The one chunk [`Self::unload_candidates`] would hand back first, without building the
    /// list. A client calls this every frame, and the list costs two allocations and a sort.
    ///
    /// Ties break on coordinates, so the choice does not depend on hash order.
    pub fn next_unload_candidate(&self) -> Option<ChunkCoord> {
        self.world
            .discovered_chunks_unordered()
            .filter(|&coord| !self.is_within_keep(coord))
            .max_by_key(|coord| {
                let dist = self
                    .focus
                    .iter()
                    .map(|f| distance(*f, *coord))
                    .min()
                    .unwrap_or(i32::MAX);
                (dist, std::cmp::Reverse(coord.cx), std::cmp::Reverse(coord.cy))
            })
    }

    /// Drops a chunk's terrain and entities from memory, returning its saved form.
    ///
    /// The returned [`SavedChunk`] is the only remaining copy: revisiting the chunk generates it
    /// again unless the caller stores it (`ChunkArchive::put`) and feeds it back through
    /// [`Self::load_from_save`]. Returns `None` for a chunk that was never discovered.
    #[must_use = "the returned chunk is the only copy left; store it or its edits are lost"]
    pub fn unload_chunk(&mut self, coord: ChunkCoord) -> Option<crate::world::save::SavedChunk> {
        let saved = self.save_chunk(coord)?;
        self.world.unload_chunk(coord);
        self.entities.remove(&coord);
        Some(saved)
    }
}

/// The per-instance state a save has to carry: everything `Entity::restore` cannot rebuild from
/// the blueprint. An entity with no state of its own saves as an empty object.
fn saved_entity_state(entity: &Entity) -> serde_json::Value {
    let mut state = match entity.metadata().clone() {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    if let Some(variant) = entity.color_variant() {
        state.insert("colorVariant".to_owned(), variant.into());
    }
    serde_json::Value::Object(state)
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
#[path = "chunk_manager.test.rs"]
mod tests;
