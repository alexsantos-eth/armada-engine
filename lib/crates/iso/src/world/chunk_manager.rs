//! Chunk streaming with per-frame budgets, independent of rendering.

use std::collections::{HashMap, HashSet};

use super::placement_job::PlacementJob;
use crate::biomes::field::WorldBiomes;
use crate::entities::wfc::WfcCatalog;
use crate::entities::{Entity, EntityCatalog};
use crate::grid::{ChunkCoord, chunks_around};
use crate::scene_order::{
    CHUNK_KEEP_RADIUS, CHUNK_LOAD_RADIUS, CHUNK_PREFETCH_RADIUS, CHUNKS_HIDDEN_PER_FRAME,
    CHUNKS_LOADED_PER_FRAME, CHUNKS_SHOWN_PER_FRAME,
};
use crate::terrain::TerrainGenerator;
use crate::world::TerrainWorld;

/// How far the streamer loads, prefetches and keeps chunks around each focus.
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
pub struct ChunkManager {
    world: TerrainWorld,
    catalog: EntityCatalog,
    entities: HashMap<ChunkCoord, Vec<Entity>>,
    focus: Vec<ChunkCoord>,
    /// Chunks discovered this frame but not yet shown; kept so entities are generated once.
    pending_entities: Vec<ChunkCoord>,
    jobs: Vec<PlacementJob>,
    radii: ChunkRadii,
    /// Cached, distance-sorted stream targets. They only change when the camera crosses a chunk
    wanted_loaded: Vec<ChunkCoord>,
    wanted_prefetch: Vec<ChunkCoord>,
    /// The biomes of the world, when the content shipped them; `None` grows biome-agnostic chunks.
    biomes: Option<WorldBiomes>,
    /// The wfc catalogue for everything else; `None` falls back to the density roll.
    wfc: Option<WfcCatalog>,
}

impl ChunkManager {
    pub fn new(generator: TerrainGenerator, catalog: EntityCatalog) -> Self {
        Self::with_radii(generator, catalog, ChunkRadii::default())
    }

    /// Same as [`Self::new`] with streaming radii of the client's choosing.
    pub fn with_radii(
        generator: TerrainGenerator,
        catalog: EntityCatalog,
        radii: ChunkRadii,
    ) -> Self {
        Self {
            world: TerrainWorld::new(generator),
            catalog,
            entities: HashMap::new(),
            focus: Vec::new(),
            pending_entities: Vec::new(),
            jobs: Vec::new(),
            radii: radii.normalized(),
            wanted_loaded: Vec::new(),
            wanted_prefetch: Vec::new(),
            biomes: None,
            wfc: None,
        }
    }

    /// The radii this streamer is using, already normalized.
    pub fn radii(&self) -> ChunkRadii {
        self.radii
    }

    /// Hands the manager the world's biomes. Called once at boot, before the first discovery;
    /// the entities of chunks already placed keep their biomes until they are unloaded.
    pub fn set_biomes(&mut self, biomes: WorldBiomes) {
        self.biomes = Some(biomes);
    }

    /// Hands the manager the world's wfc catalogue. Called once at boot, before the first
    /// discovery; chunks already placed keep their entities until they are unloaded.
    pub fn set_wfc(&mut self, wfc: WfcCatalog) {
        self.wfc = Some(wfc);
    }

    /// The world's biomes, when the content shipped them: views read them to dress or move
    /// what grows there (soil palette, sway strength) without owning their own copy.
    pub fn biomes(&self) -> Option<&WorldBiomes> {
        self.biomes.as_ref()
    }

    /// Sets the focus chunks (typically around the camera/player). The streamer keeps chunks
    pub fn set_focus(&mut self, focus: Vec<ChunkCoord>) {
        if self.focus == focus {
            return;
        }
        self.focus = focus;
        self.wanted_loaded = self.chunks_within(self.radii.load);
        self.wanted_prefetch = self.chunks_within(self.radii.prefetch);
    }

    /// Sets a single focus without allocating a new vector every rendered frame.
    pub fn set_single_focus(&mut self, focus: ChunkCoord) {
        if self.focus.as_slice() == [focus] {
            return;
        }
        self.focus.clear();
        self.focus.push(focus);
        self.wanted_loaded = self.chunks_within(self.radii.load);
        self.wanted_prefetch = self.chunks_within(self.radii.prefetch);
    }

    /// Advances one frame: loads, shows and hides chunks respecting per-frame budgets.
    pub fn tick(&mut self) -> Vec<ChunkCoord> {
        let mut newly_discovered = Vec::new();
        self.poll_jobs();

        let mut loads_left = CHUNKS_LOADED_PER_FRAME;
        for &coord in &self.wanted_prefetch {
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

        for coord in self.pending_entities.drain(..) {
            let Some(columns) = self
                .world
                .chunk(coord)
                .map(<[crate::terrain::TerrainColumn]>::to_vec)
            else {
                continue;
            };
            self.jobs.push(PlacementJob::spawn(
                coord,
                columns,
                self.catalog.clone(),
                self.biomes.clone(),
                self.wfc.clone(),
            ));
        }

        let mut shown_left = CHUNKS_SHOWN_PER_FRAME;
        for &coord in &self.wanted_loaded {
            if shown_left <= 0 {
                break;
            }
            if self.world.is_visible(coord) || !self.world.is_discovered(coord) {
                continue;
            }
            self.world.show_chunk(coord);
            shown_left -= 1;
        }

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

    /// Applies the outcome of jobs that are ready, in spawn order. A job whose chunk a save has
    /// since replaced, or whose chunk was unloaded meanwhile, is dropped instead of applied.
    fn poll_jobs(&mut self) {
        let jobs = std::mem::take(&mut self.jobs);
        let mut still_running = Vec::with_capacity(jobs.len());
        for mut job in jobs {
            if job.is_finished() {
                let coord = job.coord;
                if let Some(outcome) = job.take_outcome(false) {
                    self.apply_outcome(coord, outcome);
                }
            } else {
                still_running.push(job);
            }
        }
        self.jobs = still_running;
    }

    /// Waits for every in-flight job and applies them in spawn order. Called before a save or an
    /// unload, so those carry the freshly placed entities as well; a job whose chunk a save has
    /// replaced, or whose chunk is gone, is dropped instead of applied.
    pub fn settle(&mut self) {
        let jobs = std::mem::take(&mut self.jobs);
        for mut job in jobs {
            let coord = job.coord;
            if let Some(outcome) = job.take_outcome(true) {
                self.apply_outcome(coord, outcome);
            }
        }
    }

    /// Waits for the job of `coord`, if any, and applies it before the chunk is unloaded.
    fn drain_job(&mut self, coord: ChunkCoord) {
        let jobs = std::mem::take(&mut self.jobs);
        let mut remaining = Vec::with_capacity(jobs.len());
        for mut job in jobs {
            if job.coord == coord {
                let coord = job.coord;
                if let Some(outcome) = job.take_outcome(true) {
                    self.apply_outcome(coord, outcome);
                }
            } else {
                remaining.push(job);
            }
        }
        self.jobs = remaining;
    }

    fn apply_outcome(
        &mut self,
        coord: ChunkCoord,
        outcome: super::placement_job::PlacementOutcome,
    ) {
        if !self.world.is_discovered(coord) {
            return;
        }
        if self.entities.contains_key(&coord) {
            return;
        }
        if !self.world.replace_columns(coord, outcome.columns) {
            return;
        }
        self.entities.insert(coord, outcome.entities);
    }

    /// Terrain columns of a discovered chunk, or `None` when it was never discovered.
    pub fn terrain_chunk(&self, coord: ChunkCoord) -> Option<&[crate::terrain::TerrainColumn]> {
        self.world.chunk(coord)
    }

    /// Terrain column at an absolute world coordinate, or `None` when its chunk was never
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

    /// Whether a chunk is part of the stream currently shown by the client.
    pub fn is_visible(&self, coord: ChunkCoord) -> bool {
        self.world.is_visible(coord)
    }

    /// Converts a discovered chunk into its saved form, storing terrain and entities.
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
    pub fn save_all(&mut self) -> Vec<crate::world::save::SavedChunk> {
        self.settle();
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
    pub fn load_from_save(&mut self, save: &crate::world::save::WorldSave) -> Vec<String> {
        let blueprints: HashMap<&str, &crate::entities::EntityBlueprint> = self
            .catalog
            .entities
            .iter()
            .map(|blueprint| (blueprint.id.as_str(), blueprint))
            .collect();
        let mut unknown: HashSet<String> = HashSet::new();

        for chunk in &save.chunks {
            let coord = ChunkCoord {
                cx: chunk.cx,
                cy: chunk.cy,
            };
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
                (
                    dist,
                    std::cmp::Reverse(coord.cx),
                    std::cmp::Reverse(coord.cy),
                )
            })
    }

    /// Drops a chunk's terrain and entities from memory, returning its saved form.
    #[must_use = "the returned chunk is the only copy left; store it or its edits are lost"]
    pub fn unload_chunk(&mut self, coord: ChunkCoord) -> Option<crate::world::save::SavedChunk> {
        self.drain_job(coord);
        let saved = self.save_chunk(coord)?;
        self.world.unload_chunk(coord);
        self.entities.remove(&coord);
        Some(saved)
    }
}

/// The per-instance state a save has to carry: everything `Entity::restore` cannot rebuild from
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
            EntityCatalog {
                schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
                entities: Vec::new(),
            },
        )
    }
}

#[cfg(test)]
#[path = "chunk_manager.test.rs"]
mod tests;
