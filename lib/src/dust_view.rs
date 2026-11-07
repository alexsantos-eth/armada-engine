//! The puffs of dust the player kicks up, raised, settled and queued for the scene.
//!
//! The maths is the domain's ([`iso::player::dust`]); this is the bookkeeping and the drawing:
//! a fixed pool of puffs reused in turn, a trigger per thing the player does (a take-off, a
//! landing, each stretch of ground run or slid), and a queue of three-faced cubes.
//!
//! **Why no particle crate.** `macroquad-particles` is the obvious thing to reach for, and it
//! does not fit: an emitter is drawn whole by one `Emitter::draw(pos)` with no per-particle
//! depth, so a puff would land either entirely in front of the player or entirely behind it,
//! and its particles are textured or flat quads rather than blocks. The dust in the TypeScript
//! client is the opposite of that on both counts — each cube is a voxel in the world, sorted by
//! the column it drifts over, so the player runs *through* its own dust and a wall hides the
//! part that blows into it. What that needs already exists here: the scene's own draw order. So
//! a voxel of dust is queued like any other sprite, and the crate buys nothing.
//!
//! One puff of twelve cubes is 36 triangles out of the shared atlas's white texel, which joins
//! the batch the ground is drawn in (see [`crate::sprites::SpriteAtlas::draw_voxel`]).

use iso::player::{
    BURST_DUST, DUST_MIN_IMPACT, DustShape, DustVoxel, KICK_DUST, PlayerMotionType, PlayerState,
    VoxelFaces, get_dust, get_dust_column, get_dust_voxel_at, get_dust_voxels, voxel_faces,
};
use iso::projection::{GridPoint, ProjectionConfig, project_grid_point};
use iso::scene_order::DrawKey;
use macroquad::prelude::Color;

use crate::sprites::SpriteDraw;

/// The colours of a voxel of dust, nearly white: its lit top, its left side and its right side.
///
/// The same three as the TypeScript client's `DUST_COLORS`, and the same relation to each other
/// as a terrain block's faces: the dust is lit like the world it rises from, which is what makes
/// a cloud of it read as cubes rather than as a flat blob.
pub const DUST_TOP: u32 = 0xfbf9f4;
pub const DUST_LEFT: u32 = 0xe6e2d8;
pub const DUST_RIGHT: u32 = 0xcfcabd;

/// The layer dust drawn behind what stands on its column goes in: the one a column's top wears
/// its shadows in, under the player and under whatever grows there.
///
/// It is the layer the TypeScript client uses for the same voxels (`SCENE_LAYER.ground`), and it
/// is shared with the baked ground shadows on purpose: a cube of dust is queued after them, and
/// the sort is stable, so the dust lies over the shadow it drifts across.
pub const DUST_BEHIND_LAYER: i32 = crate::shadow_view::GROUND_SHADOW_LAYER;

/// Depth added to a cube of dust in front of the feet, so it draws after the column it is over
/// and after everything standing on it, the player included.
///
/// A nudge rather than a layer, because there is no layer above the player's front one; it is
/// far below the step between two columns' depths (half a tile) and below what a block of
/// elevation adds (`0.001` in [`iso::scene_order::get_draw_depth`]), so it can only ever
/// reorder things sharing one cell. The TypeScript client nudges by the same amount
/// (`DUST_FRONT_DEPTH`).
pub const DUST_FRONT_DEPTH: f64 = 0.00001;

/// Columns a running player covers between two puffs of dust.
pub const RUN_DUST_EVERY: f64 = 0.7;

/// Columns a skidding player slides between two puffs: more often than running, because a skid
/// is shorter and should still leave a trail.
pub const SKID_DUST_EVERY: f64 = 0.2;

/// Puffs of running or skidding dust alive at once, reused in turn.
pub const RUN_PUFFS: usize = 6;

/// The puff a take-off raises, in the air too, so a double jump puffs again.
const TAKEOFF_PUFF: usize = 0;

/// The puff a landing raises, on the ground it landed on.
const LANDING_PUFF: usize = 1;

/// The whole pool: a take-off, a landing and the running trail.
const PUFFS: usize = 2 + RUN_PUFFS;

/// Where the player's dust rises from this frame, and how far it has come since the last.
#[derive(Clone, Copy, Debug)]
pub struct DustGround {
    /// The feet, in columns.
    pub feet: GridPoint,
    /// The plane the feet are drawn on, jump included (`elevation − inset + height`).
    pub level: f64,
    /// That plane without the jump: the ground a landing puffs from.
    pub ground: f64,
    /// Columns covered since the last frame, which is what paces the running trail.
    pub moved: f64,
    /// The view's tile height, for the depth each cube sorts at.
    pub tile_height: f64,
}

/// One puff of dust: its voxels, where they rose from, and how long ago.
#[derive(Clone, Debug)]
struct Puff {
    shape: DustShape,
    voxels: Vec<DustVoxel>,
    /// Where each voxel sorts in the scene, worked out once when the puff rose from the column
    /// the voxel drifts over halfway through its life — as the TypeScript client does, so a
    /// cube does not hop between a tree's front and its back as it drifts.
    keys: Vec<DrawKey>,
    /// The feet it rose from, in columns, and the blocks above `0` they were.
    feet: GridPoint,
    level: f64,
    /// Real milliseconds since it rose, or `None` once it is over.
    ms: Option<f64>,
}

/// The player's dust: the pool of puffs and what it has noticed the player do.
#[derive(Clone, Debug)]
pub struct DustPuffs {
    puffs: Vec<Option<Puff>>,
    /// Puffs raised so far, which seeds the next one's scatter so no two look alike.
    raised: u64,
    seen_jumps: i32,
    seen_landings: i32,
    /// Columns run or slid since the last puff of the running trail.
    ran: f64,
    /// The puff of the trail to reuse next.
    run_puff: usize,
}

impl Default for DustPuffs {
    fn default() -> Self {
        Self::new()
    }
}

impl DustPuffs {
    pub fn new() -> Self {
        Self {
            puffs: vec![None; PUFFS],
            raised: 0,
            seen_jumps: 0,
            seen_landings: 0,
            ran: 0.0,
            run_puff: 0,
        }
    }

    /// How many puffs are still rising, for the heads-up display and the tests.
    pub fn live(&self) -> usize {
        self.puffs.iter().flatten().filter(|puff| puff.ms.is_some()).count()
    }

    /// Notices what the player has done since the last frame and raises the dust for it: a puff
    /// at a take-off (`feedback.jumps`), a puff at a landing hard enough to raise one
    /// (`feedback.landings` and [`DUST_MIN_IMPACT`]), and a small puff behind the feet every
    /// stretch of ground run or slid ([`DustGround::moved`]).
    ///
    /// `top_at` gives a column's elevation, for the depth each cube sorts at.
    pub fn react(
        &mut self,
        player: &PlayerState,
        at: DustGround,
        top_at: &impl Fn(i32, i32) -> Option<f64>,
    ) {
        let feedback = &player.feedback;
        if feedback.landings != self.seen_landings && feedback.impact >= DUST_MIN_IMPACT {
            // On the ground it landed on: drawn between ticks, the feet may still be a little
            // above it.
            self.raise(LANDING_PUFF, BURST_DUST, at.feet, at.ground, ZERO, ZERO, at.tile_height, top_at);
        }
        if feedback.jumps != self.seen_jumps {
            self.raise(TAKEOFF_PUFF, BURST_DUST, at.feet, at.level, ZERO, ZERO, at.tile_height, top_at);
        }
        self.seen_landings = feedback.landings;
        self.seen_jumps = feedback.jumps;
        self.kick(player, at, top_at);
    }

    /// The trail a running or skidding player kicks up behind its feet, a puff every stretch of
    /// ground covered. Walking raises none, and the distance it has banked is dropped so that
    /// the next run starts its trail from nothing.
    fn kick(
        &mut self,
        player: &PlayerState,
        at: DustGround,
        top_at: &impl Fn(i32, i32) -> Option<f64>,
    ) {
        let every = match player.motion {
            PlayerMotionType::Skidding => SKID_DUST_EVERY,
            PlayerMotionType::Running => RUN_DUST_EVERY,
            _ => 0.0,
        };
        if every == 0.0 {
            self.ran = 0.0;
            return;
        }
        self.ran += at.moved.max(0.0);
        if self.ran < every {
            return;
        }
        self.ran %= every;
        // Kicked back, away from where it runs or slides (nowhere, at no speed).
        let velocity = player.velocity;
        let speed = velocity.x.hypot(velocity.y);
        let speed = if speed == 0.0 { 1.0 } else { speed };
        let kick = GridPoint { x: -velocity.x / speed, y: -velocity.y / speed };
        let index = 2 + self.run_puff;
        self.raise(index, KICK_DUST, at.feet, at.level, kick, ZERO, at.tile_height, top_at);
        self.run_puff = (self.run_puff + 1) % RUN_PUFFS;
    }

    /// Raises the puff in slot `index`, replacing whatever was there: a fresh scatter of
    /// `shape`'s voxels from `feet`, `level` blocks up, pushed by `kick` and rising from
    /// `origin` (in columns from the feet).
    #[allow(clippy::too_many_arguments)]
    fn raise(
        &mut self,
        index: usize,
        shape: DustShape,
        feet: GridPoint,
        level: f64,
        kick: GridPoint,
        origin: GridPoint,
        tile_height: f64,
        top_at: &impl Fn(i32, i32) -> Option<f64>,
    ) {
        self.raised += 1;
        let voxels = get_dust_voxels(shape, self.raised, kick, origin);
        let keys = voxels
            .iter()
            .map(|voxel| voxel_key(*voxel, feet, level, tile_height, top_at))
            .collect();
        self.puffs[index] = Some(Puff { shape, voxels, keys, feet, level, ms: Some(0.0) });
    }

    /// Ages every live puff by `elapsed_ms` of real time, ending the ones whose life is over.
    pub fn advance(&mut self, elapsed_ms: f64) {
        for puff in self.puffs.iter_mut().flatten() {
            let Some(ms) = puff.ms else { continue };
            let ms = ms + elapsed_ms.max(0.0);
            puff.ms = get_dust(ms, puff.shape.ms, puff.shape.alpha).map(|_| ms);
        }
    }

    /// Queues every live cube of dust into `draws`, each at the depth it took when its puff
    /// rose and at the place, size and opacity it has now.
    pub fn collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>) {
        let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
        for puff in self.puffs.iter().flatten() {
            let Some(ms) = puff.ms else { continue };
            let Some(look) = get_dust(ms, puff.shape.ms, puff.shape.alpha) else { continue };
            // The feet's own cell centre, as everything else standing on a column is projected.
            let screen = project_grid_point(
                GridPoint { x: puff.feet.x + 0.5, y: puff.feet.y + 0.5 },
                projection,
            );
            for (voxel, key) in puff.voxels.iter().zip(&puff.keys) {
                let at = get_dust_voxel_at(*voxel, look.progress);
                let x = screen.x + (at.x - at.y) * (projection.tile_width / 2.0);
                let y = screen.y
                    - (at.x + at.y) * (projection.tile_height / 2.0)
                    - (puff.level + at.height) * box_height;
                let faces = offset(
                    voxel_faces(at.size, projection.tile_width, projection.tile_height, box_height),
                    x,
                    y,
                );
                draws.push(SpriteDraw::voxel(*key, faces, colours(voxel.shade, look.alpha)));
            }
        }
    }
}

/// No kick and no offset from the feet.
const ZERO: GridPoint = GridPoint { x: 0.0, y: 0.0 };

/// Where a cube of dust sorts in the scene: the column it is over halfway through its life, and
/// the side of it the cube is on.
fn voxel_key(
    voxel: DustVoxel,
    feet: GridPoint,
    level: f64,
    tile_height: f64,
    top_at: &impl Fn(i32, i32) -> Option<f64>,
) -> DrawKey {
    let at = get_dust_voxel_at(voxel, 0.5);
    let point = GridPoint { x: feet.x + at.x, y: feet.y + at.y };
    let column = get_dust_column(point, feet, level, top_at);
    let key = crate::sprites::scene_key(
        f64::from(column.x) + 0.5,
        f64::from(column.y) + 0.5,
        column.elevation,
        DUST_BEHIND_LAYER,
        tile_height,
    );
    if column.behind {
        key
    } else {
        DrawKey { depth: key.depth + DUST_FRONT_DEPTH, layer: key.layer }
    }
}

/// The voxel's faces moved to the point it stands on.
fn offset(faces: VoxelFaces, x: f64, y: f64) -> VoxelFaces {
    let move_face = |face: [(f64, f64); 4]| face.map(|point| (point.0 + x, point.1 + y));
    VoxelFaces {
        top: move_face(faces.top),
        left: move_face(faces.left),
        right: move_face(faces.right),
    }
}

/// The three faces' colours for a cube of `shade` at `alpha`: each face's own near-white
/// multiplied by the cube's shade, as the TypeScript client tints one drawing per voxel.
fn colours(shade: u32, alpha: f64) -> [Color; 3] {
    [DUST_TOP, DUST_LEFT, DUST_RIGHT].map(|face| {
        let channel = |shift: u32| {
            let a = ((face >> shift) & 0xff) as f32 / 255.0;
            let b = ((shade >> shift) & 0xff) as f32 / 255.0;
            a * b
        };
        Color::new(channel(16), channel(8), channel(0), alpha as f32)
    })
}

#[cfg(test)]
#[path = "dust_view.test.rs"]
mod tests;
