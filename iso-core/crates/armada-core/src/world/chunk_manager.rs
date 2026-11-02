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
            .map(|c| crate::world::save::terrain_column_to_saved(c, crate::world::save::SAVE_BLOCK_FLOOR))
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
                        state: serde_json::json!({}),
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
    pub fn load_from_save(&mut self, save: &crate::world::save::WorldSave) {
        for chunk in &save.chunks {
            let coord = ChunkCoord { cx: chunk.cx, cy: chunk.cy };
            let columns: Vec<crate::terrain::TerrainColumn> = chunk
                .columns
                .iter()
                .map(crate::world::save::saved_to_terrain_column)
                .collect();
            self.world.load_chunk(coord, columns);
            // Reconstruct entities from saved instances, looking up blueprints.
            let mut entities = Vec::new();
            for saved in &chunk.entities {
                if let Some(blueprint) = self.catalog.entities.iter().find(|b| b.id == saved.blueprint_id) {
                    let data = crate::entities::entity::EntityData {
                        id: saved.instance_id.clone(),
                        type_: blueprint.id.clone(),
                        walkable: false,
                        elevation: saved.elevation,
                        height: blueprint.shape.height,
                        length: blueprint.shape.length,
                        length_axis: Some(blueprint.shape.axis),
                        gap: None,
                        texture_source: blueprint.asset.sprite.clone(),
                        debug: None,
                        color_replacements: blueprint.asset.color_replacements.clone(),
                        color_variant: saved.state.get("colorVariant").and_then(|v| v.as_u64()).map(|v| v as u32),
                        sway: blueprint.asset.sway.clone(),
                        collision: match blueprint.shape.collision.as_slice() {
                            [size] => Some(crate::entities::entity::EntityCollision::Uniform(*size)),
                            sizes => Some(crate::entities::entity::EntityCollision::PerCell(sizes.to_vec())),
                        },
                        contact_shadow: blueprint.asset.contact_shadow,
                        reflection_source: blueprint.asset.reflection.clone(),
                        metadata: saved.state.clone(),
                    };
                    entities.push(crate::entities::entity::Entity::from_data(saved.x, saved.y, data));
                }
            }
            self.entities.insert(coord, entities);
        }
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
#[path = "chunk_manager.test.rs"]
mod tests;
