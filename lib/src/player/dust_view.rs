//! The puffs of dust the player kicks up, raised, settled and queued for the scene.

use iso::player::{
    BURST_DUST, DUST_MIN_IMPACT, DustShape, DustVoxel, KICK_DUST, PlayerMotionType, PlayerState,
    RIPPLE_DUST, VoxelFaces, WAKE_DUST, get_dust, get_dust_column, get_dust_voxel_at,
    get_dust_voxels, splash_of, voxel_faces,
};
use iso::projection::{GridPoint, ProjectionConfig, project_grid_point};
use iso::scene_order::DrawKey;
use macroquad::prelude::Color;

use crate::assets::sprites::SpriteDraw;

/// Where a puff starts from and how it is thrown: `origin` is the start in world columns and
/// `kick` flings the voxels away from the player's velocity; pass a zero `kick` for anything
/// that erupts in place.
#[derive(Clone, Copy, Debug)]
struct DustEmission {
    origin: GridPoint,
    kick: GridPoint,
}

/// The colours of a voxel of dust, nearly white: its lit top, its left side and its right side.
pub const DUST_TOP: u32 = 0xfbf9f4;
pub const DUST_LEFT: u32 = 0xe6e2d8;
pub const DUST_RIGHT: u32 = 0xcfcabd;

/// The layer dust drawn behind what stands on its column goes in: the one a column's top wears
pub const DUST_BEHIND_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;

/// Depth added to a cube of dust in front of the feet, so it draws after the column it is over
pub const DUST_FRONT_DEPTH: f64 = 0.00001;

/// Columns a swimmer covers between two crests of its wake: more often than a runner's dust,
/// because the water closes behind it. Each one is a pair, one crest to each side.
pub const SWIM_WAKE_EVERY: f64 = 0.4;

/// How far out from straight behind the swimmer each arm of its wake runs, in radians: the two
/// together are the V that trails it.
pub const SWIM_WAKE_SPREAD: f64 = 0.62;

/// Columns behind the swimmer the crests of its wake rise, so the water closes behind the body
/// instead of inside it.
pub const SWIM_WAKE_BEHIND: f64 = 0.16;

/// Real milliseconds between the rings a swimmer floating in place spreads around itself.
pub const SWIM_RIPPLE_MS: f64 = 1400.0;

/// Columns a running player covers between two puffs of dust.
pub const RUN_DUST_EVERY: f64 = 0.7;

/// Columns a skidding player slides between two puffs: more often than running, because a skid
pub const SKID_DUST_EVERY: f64 = 0.2;

/// Puffs of running or skidding dust alive at once, reused in turn.
pub const RUN_PUFFS: usize = 6;

/// The puff a take-off raises, in the air too, so a double jump puffs again.
const TAKEOFF_PUFF: usize = 0;

/// The puff a landing raises, on the ground it landed on.
const LANDING_PUFF: usize = 1;

/// The crown of water thrown up where the player went into the water.
const SPLASH_PUFF: usize = 2;

/// The ring that spreads around a swimmer floating in place.
const RIPPLE_PUFF: usize = 3;

/// The first puff of the trail a runner, a skidder or a swimmer leaves behind it.
const TRAIL_PUFF: usize = 4;

/// The whole pool: a take-off, a landing, a splash, a ring and the trail. A swimmer's wake
/// takes the trail's slots in pairs, so [`RUN_PUFFS`] has to be even for both arms of a V to
/// live as long as each other.
const PUFFS: usize = TRAIL_PUFF + RUN_PUFFS;

/// Where the player's dust rises from this frame, and how far it has come since the last.
#[derive(Clone, Copy, Debug)]
pub struct DustGround {
    /// Real milliseconds since the last frame, which paces what the water does on its own.
    pub elapsed_ms: f64,
    /// The feet, in columns.
    pub feet: GridPoint,
    /// The plane the feet are drawn on, jump included (`elevation + height`).
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
    seen_splashes: i32,
    /// Columns run or slid since the last puff of the running trail.
    ran: f64,
    /// Real milliseconds since the last ring spread around a floating swimmer.
    rippled_ms: f64,
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
            seen_splashes: 0,
            ran: 0.0,
            rippled_ms: 0.0,
            run_puff: 0,
        }
    }

    /// How many puffs are still rising, for the heads-up display and the tests.
    pub fn live(&self) -> usize {
        self.puffs
            .iter()
            .flatten()
            .filter(|puff| puff.ms.is_some())
            .count()
    }

    /// Notices what the player has done since the last frame and raises the dust for it: a puff
    pub fn react(
        &mut self,
        player: &PlayerState,
        at: DustGround,
        top_at: &impl Fn(i32, i32) -> Option<f64>,
    ) {
        let feedback = &player.feedback;
        if feedback.landings != self.seen_landings && feedback.impact >= DUST_MIN_IMPACT {
            self.raise(
                LANDING_PUFF,
                BURST_DUST,
                &DustGround {
                    level: at.ground,
                    ..at
                },
                DustEmission {
                    origin: ZERO,
                    kick: ZERO,
                },
                top_at,
            );
        }
        if feedback.jumps != self.seen_jumps {
            self.raise(
                TAKEOFF_PUFF,
                BURST_DUST,
                &at,
                DustEmission {
                    origin: ZERO,
                    kick: ZERO,
                },
                top_at,
            );
        }
        if feedback.splashes != self.seen_splashes {
            // The crown and the ring rise from the surface it broke, not from the sunken feet.
            let surface = DustGround {
                level: at.ground,
                ..at
            };
            let in_place = DustEmission {
                origin: ZERO,
                kick: ZERO,
            };
            self.raise(
                SPLASH_PUFF,
                splash_of(feedback.splash_impact),
                &surface,
                in_place,
                top_at,
            );
            self.raise(RIPPLE_PUFF, RIPPLE_DUST, &surface, in_place, top_at);
            self.rippled_ms = 0.0;
        }
        self.seen_landings = feedback.landings;
        self.seen_jumps = feedback.jumps;
        self.seen_splashes = feedback.splashes;
        self.kick(player, at, top_at);
        self.ripple(player, at, top_at);
    }

    /// The trail a running or skidding player kicks up behind its feet, a puff every stretch of
    fn kick(
        &mut self,
        player: &PlayerState,
        at: DustGround,
        top_at: &impl Fn(i32, i32) -> Option<f64>,
    ) {
        let (every, shape, surface) = match player.motion {
            PlayerMotionType::Skidding => (SKID_DUST_EVERY, KICK_DUST, false),
            PlayerMotionType::Running => (RUN_DUST_EVERY, KICK_DUST, false),
            PlayerMotionType::Swimming => (SWIM_WAKE_EVERY, WAKE_DUST, true),
            _ => (0.0, KICK_DUST, false),
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
        let kick = behind(player);
        if !surface {
            self.raise(
                TRAIL_PUFF + self.run_puff,
                shape,
                &at,
                DustEmission { origin: ZERO, kick },
                top_at,
            );
            self.run_puff = (self.run_puff + 1) % RUN_PUFFS;
            return;
        }
        // The wake is a pair of crests on the surface, one each side, closing behind the body.
        let surface_at = DustGround {
            level: at.ground,
            ..at
        };
        for side in [-1.0, 1.0] {
            let arm = turn(kick, side * SWIM_WAKE_SPREAD);
            self.raise(
                TRAIL_PUFF + self.run_puff,
                shape,
                &surface_at,
                DustEmission {
                    origin: GridPoint {
                        x: kick.x * SWIM_WAKE_BEHIND,
                        y: kick.y * SWIM_WAKE_BEHIND,
                    },
                    kick: arm,
                },
                top_at,
            );
            self.run_puff = (self.run_puff + 1) % RUN_PUFFS;
        }
    }

    /// The rings a swimmer floating in place spreads around itself, one every
    /// [`SWIM_RIPPLE_MS`]: the water answering a body that is not going anywhere. A swimmer on
    /// the move leaves its wake instead, and nothing on land ever ripples.
    fn ripple(
        &mut self,
        player: &PlayerState,
        at: DustGround,
        top_at: &impl Fn(i32, i32) -> Option<f64>,
    ) {
        let floating = matches!(player.motion, PlayerMotionType::Swimming)
            && player.velocity.x == 0.0
            && player.velocity.y == 0.0;
        if !floating {
            self.rippled_ms = 0.0;
            return;
        }
        self.rippled_ms += at.elapsed_ms.max(0.0);
        if self.rippled_ms < SWIM_RIPPLE_MS {
            return;
        }
        self.rippled_ms %= SWIM_RIPPLE_MS;
        self.raise(
            RIPPLE_PUFF,
            RIPPLE_DUST,
            &DustGround {
                level: at.ground,
                ..at
            },
            DustEmission {
                origin: ZERO,
                kick: ZERO,
            },
            top_at,
        );
    }

    /// Raises the puff in slot `index`, replacing whatever was there: a fresh scatter of
    fn raise(
        &mut self,
        index: usize,
        shape: DustShape,
        at: &DustGround,
        emission: DustEmission,
        top_at: &impl Fn(i32, i32) -> Option<f64>,
    ) {
        self.raised += 1;
        let voxels = get_dust_voxels(shape, self.raised, emission.kick, emission.origin);
        let keys = voxels
            .iter()
            .map(|voxel| voxel_key(*voxel, at.feet, at.level, at.tile_height, top_at))
            .collect();
        self.puffs[index] = Some(Puff {
            shape,
            voxels,
            keys,
            feet: at.feet,
            level: at.level,
            ms: Some(0.0),
        });
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
    pub fn collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>) {
        let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
        for puff in self.puffs.iter().flatten() {
            let Some(ms) = puff.ms else { continue };
            let Some(look) = get_dust(ms, puff.shape.ms, puff.shape.alpha) else {
                continue;
            };
            let screen = project_grid_point(
                GridPoint {
                    x: puff.feet.x + 0.5,
                    y: puff.feet.y + 0.5,
                },
                projection,
            );
            for (voxel, key) in puff.voxels.iter().zip(&puff.keys) {
                let at = get_dust_voxel_at(*voxel, look.progress);
                let x = screen.x + (at.x - at.y) * (projection.tile_width / 2.0);
                let y = screen.y
                    - (at.x + at.y) * (projection.tile_height / 2.0)
                    - (puff.level + at.height) * box_height;
                let faces = offset(
                    voxel_faces(
                        at.size,
                        projection.tile_width,
                        projection.tile_height,
                        box_height,
                    ),
                    x,
                    y,
                );
                draws.push(SpriteDraw::voxel(
                    *key,
                    faces,
                    colours(voxel.shade, look.alpha),
                ));
            }
        }
    }
}

/// No kick and no offset from the feet.
const ZERO: GridPoint = GridPoint { x: 0.0, y: 0.0 };

/// `direction` turned `radians` counter-clockwise on the grid.
fn turn(direction: GridPoint, radians: f64) -> GridPoint {
    let (sin, cos) = radians.sin_cos();
    GridPoint {
        x: direction.x * cos - direction.y * sin,
        y: direction.x * sin + direction.y * cos,
    }
}

/// The way behind the player, which is where whatever it kicks up is thrown.
fn behind(player: &PlayerState) -> GridPoint {
    let velocity = player.velocity;
    let speed = velocity.x.hypot(velocity.y);
    if speed == 0.0 {
        return ZERO;
    }
    GridPoint {
        x: -velocity.x / speed,
        y: -velocity.y / speed,
    }
}

/// Where a cube of dust sorts in the scene: the column it is over halfway through its life, and
fn voxel_key(
    voxel: DustVoxel,
    feet: GridPoint,
    level: f64,
    tile_height: f64,
    top_at: &impl Fn(i32, i32) -> Option<f64>,
) -> DrawKey {
    let at = get_dust_voxel_at(voxel, 0.5);
    let point = GridPoint {
        x: feet.x + at.x,
        y: feet.y + at.y,
    };
    let column = get_dust_column(point, feet, level, top_at);
    let key = crate::assets::sprites::scene_key(
        f64::from(column.x) + 0.5,
        f64::from(column.y) + 0.5,
        column.elevation,
        DUST_BEHIND_LAYER,
        tile_height,
    );
    if column.behind {
        key
    } else {
        DrawKey {
            depth: key.depth + DUST_FRONT_DEPTH,
            layer: key.layer,
        }
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
