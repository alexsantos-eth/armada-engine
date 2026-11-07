//! The shadow maps of the shown chunks, in one texture.
//!
//! A chunk's shadows are baked into a map of texels ([`iso::lighting::bake`]), and the
//! client's job is to put that map on screen. The first version read it back as a lattice of
//! corners per column and drew the lattice with a colour per vertex, because Macroquad starts a
//! new draw call whenever the bound texture changes and a texture per chunk broke the batch into
//! a hundred and thirty pieces. That batched, but it moved the whole cost into geometry: at 36
//! texels a tile a column's lattice is 361 corners, and the shadows came to 96 % of every
//! frame's vertices — 11 711 of 12 165, against 292 for all of the terrain and the entities.
//!
//! So the map goes back to being a texture, and the batch is kept by having only **one** of
//! them: every shown chunk's map lives in a slot of this atlas, the scene's material samples it
//! through a second sampler, and the sprite atlas stays bound throughout. A column's shadow is
//! then four vertices carrying the corners of its own square of the map.
//!
//! A slot holds a chunk's map with its margin, which is [`SLOT_TEXELS`] on a side, and there
//! are [`SLOT_COUNT`] of them. That is more than are ever drawn at once — the camera culls to a
//! handful of chunks — so claiming a slot normally finds a free one. If it does not, the
//! least recently drawn chunk is turned out and [`ShadowAtlas::put`] says whose slot it took, so
//! the scene can forget that chunk and bake it again if it comes back. Keeping each map's bytes
//! in memory to refill a slot without baking would cost 1.5 MB a chunk, which is the larger
//! price for the rarer event.

use iso::grid::{CHUNK_SIZE, ChunkCoord};
use iso::lighting::{MapArea, SHADOW_MAP_MARGIN, SHADOW_MAP_PIXELS_PER_TILE, ShadowMap};
use macroquad::prelude::*;

/// A slot's side in texels: a chunk's columns plus the margin its map is baked with.
pub const SLOT_TEXELS: u32 =
    (CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) as u32 * SHADOW_MAP_PIXELS_PER_TILE;

/// Slots across the atlas, and down it.
///
/// Nine slots against the two to six chunks a frame draws, so the common case never evicts. It
/// is also what fits: nine slots is 3672 texels on a side, and 4096 is the smallest limit a
/// desktop or WebGL2 context is allowed to have.
pub const SLOTS_ACROSS: u32 = 3;

/// How many chunks the atlas holds at once.
pub const SLOT_COUNT: usize = (SLOTS_ACROSS * SLOTS_ACROSS) as usize;

/// The atlas's side in texels.
pub const ATLAS_TEXELS: u32 = SLOT_TEXELS * SLOTS_ACROSS;

/// Which chunk is in which slot, and which slot to take when they are all busy.
///
/// Pure bookkeeping, with no texture in it, so the eviction order can be tested without a
/// graphics context.
pub struct SlotMap {
    /// What each slot holds: the chunk, and the tick it was last wanted at.
    held: Vec<Option<(ChunkCoord, u64)>>,
    /// Counts uses, not frames: the order slots were last wanted in is all that is needed.
    clock: u64,
}

impl Default for SlotMap {
    fn default() -> Self {
        Self::new()
    }
}

impl SlotMap {
    pub fn new() -> Self {
        Self {
            held: vec![None; SLOT_COUNT],
            clock: 0,
        }
    }

    /// The slot `coord` is in, without counting it as a use.
    pub fn slot_of(&self, coord: ChunkCoord) -> Option<usize> {
        self.held
            .iter()
            .position(|held| matches!(held, Some((held, _)) if *held == coord))
    }

    /// The slot `coord` is in, counting the ask as the most recent use of it.
    ///
    /// The draw path calls this, so "least recently used" means least recently *drawn* and a
    /// chunk on screen is never the one turned out.
    pub fn touch(&mut self, coord: ChunkCoord) -> Option<usize> {
        let slot = self.slot_of(coord)?;
        self.clock += 1;
        self.held[slot] = Some((coord, self.clock));
        Some(slot)
    }

    /// Gives `coord` a slot: the one it already has, else a free one, else the one whose chunk
    /// was wanted longest ago. Returns the slot and the chunk turned out of it, if any.
    pub fn claim(&mut self, coord: ChunkCoord) -> (usize, Option<ChunkCoord>) {
        self.clock += 1;
        if let Some(slot) = self.slot_of(coord) {
            self.held[slot] = Some((coord, self.clock));
            return (slot, None);
        }
        if let Some(slot) = self.held.iter().position(Option::is_none) {
            self.held[slot] = Some((coord, self.clock));
            return (slot, None);
        }
        // Every slot is busy: the one wanted longest ago goes. `min_by_key` over the tick is the
        // whole eviction rule.
        let slot = self
            .held
            .iter()
            .enumerate()
            .min_by_key(|(_, held)| held.map_or(0, |(_, used)| used))
            .map_or(0, |(slot, _)| slot);
        let turned_out = self.held[slot].map(|(chunk, _)| chunk);
        self.held[slot] = Some((coord, self.clock));
        (slot, turned_out)
    }

    /// Frees whatever slot `coord` holds, because the stream has dropped it.
    pub fn release(&mut self, coord: ChunkCoord) {
        if let Some(slot) = self.slot_of(coord) {
            self.held[slot] = None;
        }
    }
}

/// Where a slot starts in the atlas, in texels.
pub fn slot_origin(slot: usize) -> (u32, u32) {
    let slot = slot as u32 % (SLOTS_ACROSS * SLOTS_ACROSS);
    (
        slot % SLOTS_ACROSS * SLOT_TEXELS,
        slot / SLOTS_ACROSS * SLOT_TEXELS,
    )
}

/// The texel square of column `(x, y)` inside the slot its own chunk holds.
///
/// It is the map's own [`ShadowMap::square_of`] — the same [`MapArea`] the bake laid, asked
/// without the map, because the map is one scratch buffer that has moved on to the next chunk by
/// the time a frame draws this one.
pub fn square_in_slot(coord: ChunkCoord, x: i32, y: i32) -> Option<(u32, u32)> {
    let min_x = coord.cx * CHUNK_SIZE;
    let min_y = coord.cy * CHUNK_SIZE;
    MapArea::around(min_x, min_y, min_x + CHUNK_SIZE - 1, min_y + CHUNK_SIZE - 1).square_of(
        x,
        y,
        SHADOW_MAP_PIXELS_PER_TILE,
    )
}

/// The texture coordinate of a point of a chunk's map, in `[0, 1]` across the whole atlas.
///
/// `texel` is counted from the slot's corner, in texels, and lands on the texel's own middle
/// when it carries a half — the convention a sampler reads by, which is why the callers offset
/// a column's corners by half a texel rather than putting them on the square's edge.
pub fn atlas_uv(slot: usize, texel: (f64, f64)) -> (f32, f32) {
    let (origin_x, origin_y) = slot_origin(slot);
    let side = f64::from(ATLAS_TEXELS);
    (
        ((f64::from(origin_x) + texel.0) / side) as f32,
        ((f64::from(origin_y) + texel.1) / side) as f32,
    )
}

/// One texture holding the shadow maps of the chunks on screen.
pub struct ShadowAtlas {
    texture: Texture2D,
    slots: SlotMap,
}

impl ShadowAtlas {
    /// An empty atlas.
    ///
    /// One byte a texel ([`miniquad::TextureFormat::Alpha`]), because a shadow map is coverage
    /// and nothing else: 13.5 MB at nine slots, against 54 MB if it were RGBA. Miniquad
    /// swizzles the value into `.a` on every backend, so a shader reads it the same way on GL
    /// and on the web. Linear filtering is the point of the whole change — it is what reads
    /// between the texels, in place of the lattice that used to.
    pub fn new() -> Self {
        let texture = unsafe {
            let gl = get_internal_gl();
            let id = gl.quad_context.new_texture(
                miniquad::TextureAccess::Static,
                miniquad::TextureSource::Empty,
                miniquad::TextureParams {
                    kind: miniquad::TextureKind::Texture2D,
                    format: miniquad::TextureFormat::Alpha,
                    wrap: miniquad::TextureWrap::Clamp,
                    min_filter: FilterMode::Linear,
                    mag_filter: FilterMode::Linear,
                    mipmap_filter: miniquad::MipmapFilterMode::None,
                    width: ATLAS_TEXELS,
                    height: ATLAS_TEXELS,
                    allocate_mipmaps: false,
                    sample_count: 1,
                },
            );
            Texture2D::from_miniquad_texture(id)
        };
        Self {
            texture,
            slots: SlotMap::new(),
        }
    }

    /// The texture, to hand the scene's material.
    pub fn texture(&self) -> &Texture2D {
        &self.texture
    }

    /// Puts `map` in `coord`'s slot and returns the chunk turned out of that slot, if any.
    ///
    /// A map of another size than a slot is refused rather than uploaded part way, because a
    /// short upload would leave the rest of the slot showing the previous chunk's shadows.
    pub fn put(&mut self, coord: ChunkCoord, map: &ShadowMap) -> Option<ChunkCoord> {
        if map.width != SLOT_TEXELS || map.height != SLOT_TEXELS {
            return None;
        }
        let (slot, turned_out) = self.slots.claim(coord);
        let (x, y) = slot_origin(slot);
        unsafe {
            let gl = get_internal_gl();
            gl.quad_context.texture_update_part(
                self.texture.raw_miniquad_id(),
                x as i32,
                y as i32,
                SLOT_TEXELS as i32,
                SLOT_TEXELS as i32,
                &map.alpha,
            );
        }
        turned_out
    }

    /// Frees `coord`'s slot.
    pub fn release(&mut self, coord: ChunkCoord) {
        self.slots.release(coord);
    }

    /// Whether `coord`'s map is in the atlas, counting the ask as a use.
    pub fn touch(&mut self, coord: ChunkCoord) -> Option<usize> {
        self.slots.touch(coord)
    }

    /// Which slot `coord`'s map is in, for the texture coordinates of its columns.
    pub fn slot_of(&self, coord: ChunkCoord) -> Option<usize> {
        self.slots.slot_of(coord)
    }

    /// Whether `coord`'s map is in the atlas.
    pub fn holds(&self, coord: ChunkCoord) -> bool {
        self.slots.slot_of(coord).is_some()
    }
}

#[cfg(test)]
#[path = "shadow_view_atlas.test.rs"]
mod tests;
