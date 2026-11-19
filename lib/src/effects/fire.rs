//! Campfire effects: flickering flame voxels over the fire's coals, sparks that fly off it and
//! smoke that climbs away. View state like the ambient particles: real time, never saved.

use iso::player::{VoxelFaces, voxel_faces};
use iso::projection::{GridPoint, ProjectionConfig, project_grid_point};
use iso::scene_order::DrawKey;
use macroquad::prelude::Color;

use crate::assets::sprites::{SpriteDraw, scene_key};
use crate::game::config::ENTITY_LAYER;

/// Every spark and wisp of smoke alive at once, across all fires.
pub const MAX_EMBERS: usize = 160;
/// Sparks per second off one fire.
const SPARK_RATE: f64 = 4.5;
/// Wisps of smoke per second off one fire.
const SMOKE_RATE: f64 = 2.4;
/// Blocks above the ground the sparks and the smoke start from: the tip of the flames.
const FLAME_TOP: f64 = 0.42;
/// Blocks per second a spark climbs.
const SPARK_RISE: f64 = 0.85;
/// Blocks per second a wisp of smoke climbs.
const SMOKE_RISE: f64 = 0.42;
/// How far smoke leans downwind, in columns per second.
const SMOKE_DRIFT: (f64, f64) = (0.10, 0.09);
/// Alpha of a wisp of smoke at mid-life.
const SMOKE_ALPHA: f64 = 0.5;

/// A fire burning on a column: its cell centre in columns and the ground under it in blocks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FireSpot {
    /// Column east of the fire's cell centre, fractional.
    pub x: f64,
    /// Column south of the fire's cell centre, fractional.
    pub y: f64,
    /// Blocks above elevation zero the fire stands on.
    pub ground: f64,
}

/// One tongue of flame: where it stands in the cell, how it is drawn.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Flame {
    /// Columns east of the cell centre.
    pub dx: f64,
    /// Columns south of the cell centre.
    pub dy: f64,
    /// Blocks above the ground the tongue's foot is.
    pub height: f64,
    /// Width of the tongue, in tiles.
    pub size: f64,
    /// Face colours, lit top first, as `0xRRGGBB`.
    pub colours: [u32; 3],
}

/// The kinds of thing a fire throws off.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EmberKind {
    Spark,
    Smoke,
}

/// A spark or a wisp of smoke, in world columns.
#[derive(Clone, Copy, Debug)]
struct Ember {
    kind: EmberKind,
    /// The fire it came from; it sorts in depth as that fire does, wherever it drifts.
    source: FireSpot,
    x: f64,
    y: f64,
    /// Blocks above elevation zero.
    height: f64,
    /// Columns per second it drifts along.
    vx: f64,
    vy: f64,
    age_ms: f64,
    life_ms: f64,
    phase: f64,
}

/// The sparks and smoke of every fire in view. View state: real time, never saved.
#[derive(Clone, Debug)]
pub struct Fire {
    embers: Vec<Ember>,
    rng: u64,
    spark_carry: f64,
    smoke_carry: f64,
}

impl Default for Fire {
    fn default() -> Self {
        Self::new(0xC0FF_EE15_F1AE_0001)
    }
}

impl Fire {
    /// The empty fire swarm; the scatter of what it throws off comes from `seed`.
    pub fn new(seed: u64) -> Self {
        Self {
            embers: Vec::with_capacity(MAX_EMBERS),
            rng: seed | 1,
            spark_carry: 0.0,
            smoke_carry: 0.0,
        }
    }

    /// How many sparks and wisps are in the air.
    pub fn live(&self) -> usize {
        self.embers.len()
    }

    /// Ages every spark and wisp by `elapsed_ms` of real time, drops the spent ones and lets
    /// each fire in `spots` throw off its share of new ones.
    pub fn update(&mut self, elapsed_ms: f64, spots: &[FireSpot]) {
        let elapsed = elapsed_ms.max(0.0);
        let dt = elapsed / 1000.0;
        for ember in &mut self.embers {
            ember.age_ms += elapsed;
            rise(ember, dt);
        }
        self.embers.retain(|e| e.age_ms < e.life_ms);
        if spots.is_empty() || dt <= 0.0 {
            return;
        }
        let count = spots.len() as f64;
        self.spark_carry += SPARK_RATE * count * dt;
        self.smoke_carry += SMOKE_RATE * count * dt;
        while self.spark_carry >= 1.0 {
            self.spark_carry -= 1.0;
            self.throw(EmberKind::Spark, spots);
        }
        while self.smoke_carry >= 1.0 {
            self.smoke_carry -= 1.0;
            self.throw(EmberKind::Smoke, spots);
        }
    }

    /// Queues the flames of every fire in `spots` and every spark and wisp as voxels in the
    /// scene's depth order, so they sort with the campfire sprite they belong to.
    pub fn collect(
        &self,
        spots: &[FireSpot],
        time_ms: f64,
        projection: ProjectionConfig,
        draws: &mut Vec<SpriteDraw>,
    ) {
        let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
        for spot in spots {
            let phase = spot_phase(spot);
            for flame in flames(time_ms, phase) {
                let (x, y) = (spot.x + flame.dx, spot.y + flame.dy);
                let height = spot.ground + flame.height;
                draws.push(voxel_draw(
                    VoxelAt { x, y, height },
                    sort_key(spot, projection),
                    flame.size,
                    flame.colours.map(|c| colour(c, 1.0)),
                    projection,
                    box_height,
                ));
            }
        }
        for ember in &self.embers {
            let fade = fade(ember.age_ms, ember.life_ms);
            let (size, colours) = match ember.kind {
                EmberKind::Spark => {
                    let glow = 0.6
                        + 0.4 * (ember.age_ms / 70.0 + ember.phase * std::f64::consts::TAU).sin();
                    (
                        0.02,
                        [0xffe08au32, 0xffa638, 0xe5701c].map(|c| colour(c, (fade * glow) as f32)),
                    )
                }
                EmberKind::Smoke => {
                    let grow = (ember.age_ms / ember.life_ms).clamp(0.0, 1.0);
                    (
                        0.05 + 0.06 * grow,
                        [0x8d8a86u32, 0x74716e, 0x625f5c]
                            .map(|c| colour(c, (fade * SMOKE_ALPHA) as f32)),
                    )
                }
            };
            draws.push(voxel_draw(
                VoxelAt {
                    x: ember.x,
                    y: ember.y,
                    height: ember.height,
                },
                sort_key(&ember.source, projection),
                size,
                colours,
                projection,
                box_height,
            ));
        }
    }

    /// Throws one `kind` of ember off a random fire of `spots`, if there is room for it.
    fn throw(&mut self, kind: EmberKind, spots: &[FireSpot]) {
        if self.embers.len() >= MAX_EMBERS {
            return;
        }
        let spot = spots[(self.next() % spots.len() as u64) as usize];
        let scatter = self.unit() * std::f64::consts::TAU;
        let reach = self.unit() * 0.08;
        let phase = self.unit();
        let (vx, vy, life_ms) = match kind {
            EmberKind::Spark => {
                let side = self.range(-0.25, 0.25);
                (side, self.range(-0.25, 0.25), self.range(650.0, 1300.0))
            }
            EmberKind::Smoke => (
                SMOKE_DRIFT.0 * self.range(0.6, 1.4),
                SMOKE_DRIFT.1 * self.range(0.6, 1.4),
                self.range(2200.0, 3300.0),
            ),
        };
        self.embers.push(Ember {
            kind,
            source: spot,
            x: spot.x + reach * scatter.cos(),
            y: spot.y + reach * scatter.sin(),
            height: spot.ground + FLAME_TOP,
            vx,
            vy,
            age_ms: 0.0,
            life_ms,
            phase,
        });
    }

    /// A uniform in `[0, 1)`.
    fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// A uniform in `[lo, hi)`.
    fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.unit()
    }

    /// xorshift64*, the one source of scatter the fire has.
    fn next(&mut self) -> u64 {
        let mut value = self.rng;
        value ^= value >> 12;
        value ^= value << 25;
        value ^= value >> 27;
        self.rng = value;
        value.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
}

/// The flames of a fire at `time_ms`, from a broad red base to a yellow tip. `phase` keeps two
/// fires from flickering in step. Pure: the same time and phase give the same flames.
pub fn flames(time_ms: f64, phase: f64) -> [Flame; 6] {
    let tau = std::f64::consts::TAU;
    let t = time_ms + phase * 9000.0;
    let wave = |rate: f64, offset: f64| (t / rate + offset * tau).sin();
    let flick = |rate: f64, offset: f64| 0.5 + 0.5 * wave(rate, offset);
    const RED: [u32; 3] = [0xf2461c, 0xd93a14, 0xb82e10];
    const ORANGE: [u32; 3] = [0xff8a24, 0xf0741a, 0xd35f14];
    const YELLOW: [u32; 3] = [0xffd84a, 0xf5c038, 0xdca92c];
    [
        Flame {
            dx: 0.0,
            dy: 0.0,
            height: 0.054,
            size: 0.101,
            colours: RED,
        },
        Flame {
            dx: 0.045 * wave(310.0, 0.1),
            dy: -0.045 * wave(270.0, 0.4),
            height: 0.121 + 0.03 * flick(180.0, 0.2),
            size: 0.074 + 0.015 * flick(230.0, 0.5),
            colours: ORANGE,
        },
        Flame {
            dx: -0.05 * wave(290.0, 0.7),
            dy: 0.05 * wave(330.0, 0.3),
            height: 0.108 + 0.04 * flick(150.0, 0.8),
            size: 0.066 + 0.02 * flick(210.0, 0.1),
            colours: ORANGE,
        },
        Flame {
            dx: 0.02 * wave(240.0, 0.9),
            dy: 0.02 * wave(260.0, 0.6),
            height: 0.203 + 0.07 * flick(130.0, 0.35),
            size: 0.055 + 0.02 * flick(170.0, 0.45),
            colours: ORANGE,
        },
        Flame {
            dx: 0.015 * wave(200.0, 0.2),
            dy: -0.015 * wave(220.0, 0.8),
            height: 0.284 + 0.09 * flick(110.0, 0.0),
            size: 0.037 + 0.02 * flick(140.0, 0.6),
            colours: YELLOW,
        },
        Flame {
            dx: -0.01 * wave(180.0, 0.5),
            dy: 0.012 * wave(160.0, 0.1),
            height: 0.378 + 0.1 * flick(95.0, 0.55),
            size: 0.023 + 0.014 * flick(120.0, 0.9),
            colours: YELLOW,
        },
    ]
}

/// A stable offset in `[0, 1)` for one fire, so neighbours flicker out of step.
fn spot_phase(spot: &FireSpot) -> f64 {
    let hash = (spot.x * 12.9898 + spot.y * 78.233).sin() * 43758.5453;
    hash - hash.floor()
}

/// Moves one ember over `dt` seconds: sparks climb quickly and waver, smoke climbs slowly and
/// leans downwind.
fn rise(ember: &mut Ember, dt: f64) {
    match ember.kind {
        EmberKind::Spark => {
            let waver = (ember.age_ms / 90.0 + ember.phase * std::f64::consts::TAU).sin();
            ember.x += (ember.vx + 0.12 * waver) * dt;
            ember.y += (ember.vy + 0.12 * waver.cos()) * dt;
            ember.height += SPARK_RISE * dt;
        }
        EmberKind::Smoke => {
            let sway = (ember.age_ms / 520.0 + ember.phase * std::f64::consts::TAU).sin();
            ember.x += (ember.vx + 0.035 * sway) * dt;
            ember.y += (ember.vy + 0.035 * sway.cos()) * dt;
            ember.height += SMOKE_RISE * dt;
        }
    }
}

/// 0 at birth and at the end of life, 1 across the middle.
pub(crate) fn fade(age_ms: f64, life_ms: f64) -> f64 {
    let edge = 350.0_f64.min(life_ms / 2.0);
    let smooth = |t: f64| t * t * (3.0 - 2.0 * t);
    let rising = smooth((age_ms / edge).clamp(0.0, 1.0));
    let falling = smooth(((life_ms - age_ms) / edge).clamp(0.0, 1.0));
    rising.min(falling)
}

/// Where a voxel stands: a column point and the blocks above elevation zero.
struct VoxelAt {
    x: f64,
    y: f64,
    height: f64,
}

/// A voxel of `size` tiles at `at`, sorted with whatever stands on its column.
fn voxel_draw(
    at: VoxelAt,
    key: DrawKey,
    size: f64,
    colours: [Color; 3],
    projection: ProjectionConfig,
    box_height: f64,
) -> SpriteDraw {
    let screen = project_grid_point(GridPoint { x: at.x, y: at.y }, projection);
    let faces = shifted(
        voxel_faces(
            size,
            projection.tile_width,
            projection.tile_height,
            box_height,
        ),
        screen.x,
        screen.y - at.height * box_height,
    );
    SpriteDraw::voxel(key, faces, colours)
}

/// The depth key every flame, spark and wisp of a fire shares: the fire's own cell, a hair above
/// its sprite, so the player in front of the fire draws over them and behind it, under.
fn sort_key(spot: &FireSpot, projection: ProjectionConfig) -> DrawKey {
    scene_key(
        spot.x,
        spot.y,
        spot.ground + 0.5,
        ENTITY_LAYER,
        projection.tile_height,
    )
}

/// The faces of a voxel moved by `(x, y)`.
fn shifted(faces: VoxelFaces, x: f64, y: f64) -> VoxelFaces {
    let move_face = |face: [(f64, f64); 4]| face.map(|point| (point.0 + x, point.1 + y));
    VoxelFaces {
        top: move_face(faces.top),
        left: move_face(faces.left),
        right: move_face(faces.right),
    }
}

/// An `0xRRGGBB` colour at `alpha`.
fn colour(rgb: u32, alpha: f32) -> Color {
    Color::new(
        ((rgb >> 16) & 0xff) as f32 / 255.0,
        ((rgb >> 8) & 0xff) as f32 / 255.0,
        (rgb & 0xff) as f32 / 255.0,
        alpha,
    )
}

#[cfg(test)]
#[path = "fire.test.rs"]
mod tests;
