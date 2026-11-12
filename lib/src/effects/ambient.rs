//! Ambient particles: motes of pollen on bright days and fireflies on dark nights, drifting
//! where the wind takes them.

use iso::lighting::BakePhase;
use iso::player::voxel_faces;
use iso::projection::{GridPoint, ProjectionConfig, project_grid_point};
use iso::terrain::TerrainMaterial;
use macroquad::prelude::Color;

use crate::assets::sprites::{SpriteDraw, scene_key};
use crate::game::config::ENTITY_LAYER;

/// Columns from the camera the particles spawn in.
const SPAWN_RADIUS: f64 = 15.0;
/// How far past the spawn disc a particle may stray before it is dropped.
const DESPAWN_RADIUS: f64 = SPAWN_RADIUS + 5.0;
/// Every particle alive at once, across all kinds.
pub const MAX_PARTICLES: usize = 200;
/// Motes of pollen per second under a bright sky.
const POLLEN_RATE: f64 = 12.0;
/// Fireflies per second on a dark night; a few more modest ones at dusk.
const FIREFLY_RATE: f64 = 6.0;
/// Fireflies per second at dusk, when they are just waking up.
const SUNSET_FIREFLY_RATE: f64 = 3.0;
/// Blocks above the ground pollen and fireflies hover in.
const MIN_AIR: f64 = 0.5;
/// Blocks above the ground pollen and fireflies hover in.
const MAX_AIR: f64 = 2.4;
/// Blocks per second pollen sink.
const POLLEN_FALL: f64 = 0.045;
/// How much the wind pushes a particle, per point of the column's wind strength.
const WIND_PUSH: f64 = 0.055;
/// The way the wind blows over the world, per column: roughly east-south, down the sun's slant.
const WIND_DIR: (f64, f64) = (0.74, 0.67);
/// How far a firefly wanders from its spot, in columns per second.
const FIREFLY_WANDER: f64 = 0.30;
/// How hard a mote slues side to side as it drifts, in columns per second.
const WOBBLE: f64 = 0.06;
/// Radians per millisecond of a mote's wobble.
const WOBBLE_RATE: f64 = 1.0 / 700.0;
/// Alpha of a pollen mote at mid-life.
const POLLEN_ALPHA: f64 = 0.85;

/// The kinds of ambient particle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AmbientKind {
    /// A mote of pollen or dust, kicked up into the sunlight; bright days only.
    Pollen,
    /// A firefly, blinking its way through a dark night over the grass.
    Firefly,
}

/// One particle's state, in world columns. Kind drives its motion, its look and its life.
#[derive(Clone, Copy, Debug)]
struct Particle {
    /// Which of the two it is.
    kind: AmbientKind,
    /// Column east, fractional.
    x: f64,
    /// Column south, fractional.
    y: f64,
    /// Blocks above elevation zero.
    height: f64,
    /// Columns per second the mote drifts along, fixed at birth.
    vx: f64,
    /// Columns per second the mote drifts along, fixed at birth.
    vy: f64,
    /// Milliseconds since it came to be.
    age_ms: f64,
    /// How long it lives, in milliseconds.
    life_ms: f64,
    /// Phase of the sway and the pulse, seeded.
    phase: f64,
    /// How big it draws, in tiles of the world.
    size: f64,
}

impl Particle {
    /// A mote of pollen above `floor`, ready to drift and sink.
    fn pollen(
        x: f64,
        y: f64,
        floor: f64,
        wind: (f64, f64),
        height_frac: f64,
        phase: f64,
        life_ms: f64,
    ) -> Self {
        Self {
            kind: AmbientKind::Pollen,
            x,
            y,
            height: floor + MIN_AIR + height_frac * (MAX_AIR - MIN_AIR),
            vx: wind.0,
            vy: wind.1,
            age_ms: 0.0,
            life_ms,
            phase,
            size: 0.020,
        }
    }

    /// A firefly holding its spot above `floor`, blinking.
    fn firefly(x: f64, y: f64, floor: f64, height_frac: f64, phase: f64, life_ms: f64) -> Self {
        Self {
            kind: AmbientKind::Firefly,
            x,
            y,
            height: floor + MIN_AIR + height_frac * (MAX_AIR - MIN_AIR),
            vx: 0.0,
            vy: 0.0,
            age_ms: 0.0,
            life_ms,
            phase,
            size: 0.024,
        }
    }
}

/// What the world looks like where the particles may appear, borrowed for one frame.
pub struct SpawnEnv<'a> {
    /// Column east of the camera's look-at point, fractional.
    pub center_x: f64,
    /// Column south of the camera's look-at point, fractional.
    pub center_y: f64,
    /// The phase the world is in right now.
    pub phase: BakePhase,
    /// Real milliseconds since the world did, for gusts.
    pub time_ms: f64,
    /// The ground of the column in blocks, if the chunk was generated.
    pub height_at: &'a dyn Fn(i32, i32) -> Option<f64>,
    /// The surface of the column, if the chunk was generated.
    pub surface_at: &'a dyn Fn(i32, i32) -> Option<TerrainMaterial>,
    /// The wind strength over the column; `1.0` when nothing says otherwise.
    pub wind_at: &'a dyn Fn(i32, i32) -> f64,
}

/// The swarm and its spawn scatter. View state: real time, never ticks, never saved.
#[derive(Clone, Debug)]
pub struct AmbientParticles {
    particles: Vec<Particle>,
    /// xorshift64* state for the spawn scatter.
    rng: u64,
    /// Fractional spawns carried between frames, one per kind.
    pollen_accum: f64,
    firefly_accum: f64,
}

impl Default for AmbientParticles {
    fn default() -> Self {
        Self::new(0x9E37_79B9_7F4A_7C15)
    }
}

impl AmbientParticles {
    pub fn new(seed: u64) -> Self {
        Self {
            particles: Vec::with_capacity(MAX_PARTICLES),
            rng: seed | 1,
            pollen_accum: 0.0,
            firefly_accum: 0.0,
        }
    }

    /// How many particles are in the air, for the tests and the heads-up display.
    pub fn live(&self) -> usize {
        self.particles.len()
    }

    /// Ages every particle by `elapsed_ms` of real time, spawns whatever the phase and the
    /// ground allow, and drops whatever wandered out of the world.
    pub fn update(&mut self, elapsed_ms: f64, env: &SpawnEnv) {
        let elapsed = elapsed_ms.max(0.0);
        let dt = elapsed / 1000.0;
        let center = (env.center_x, env.center_y);
        for particle in &mut self.particles {
            particle.age_ms += elapsed;
            drift(particle, elapsed);
        }
        self.particles
            .retain(|p| p.age_ms < p.life_ms && far(p.x, p.y, center.0, center.1) < DESPAWN_RADIUS);
        self.spawn(dt, env);
    }

    /// Queues every particle as a chunky voxel in the scene's depth order.
    pub fn collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>) {
        let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
        for particle in &self.particles {
            let alpha = match particle.kind {
                AmbientKind::Firefly => {
                    fade(particle.age_ms, particle.life_ms)
                        * firefly_pulse(particle.age_ms, particle.phase)
                }
                AmbientKind::Pollen => fade(particle.age_ms, particle.life_ms) * POLLEN_ALPHA,
            } as f32;
            let screen = project_grid_point(
                GridPoint {
                    x: particle.x + 0.5,
                    y: particle.y + 0.5,
                },
                projection,
            );
            let lift = (particle.height + bob(particle)) * box_height;
            let faces = offset(
                voxel_faces(
                    particle.size,
                    projection.tile_width,
                    projection.tile_height,
                    box_height,
                ),
                screen.x,
                screen.y - lift,
            );
            let key = scene_key(
                particle.x + 0.5,
                particle.y + 0.5,
                particle.height,
                ENTITY_LAYER,
                projection.tile_height,
            );
            draws.push(SpriteDraw::voxel(key, faces, colours(particle, alpha)));
        }
    }

    /// Rolls the spawn accumulators forward and spends whatever reached a whole spawn.
    fn spawn(&mut self, dt: f64, env: &SpawnEnv) {
        if dt <= 0.0 {
            return;
        }
        let bright = matches!(
            env.phase,
            BakePhase::Day | BakePhase::Dawn | BakePhase::Sunset
        );
        self.pollen_accum += if bright { POLLEN_RATE * dt } else { 0.0 };
        self.firefly_accum += match env.phase {
            BakePhase::Night => FIREFLY_RATE * dt,
            BakePhase::Sunset => SUNSET_FIREFLY_RATE * dt,
            _ => 0.0,
        };
        if self.pollen_accum >= 1.0 {
            self.pollen_accum -= 1.0;
            self.spawn_one(AmbientKind::Pollen, env);
        }
        if self.firefly_accum >= 1.0 {
            self.firefly_accum -= 1.0;
            self.spawn_one(AmbientKind::Firefly, env);
        }
    }

    /// Attempts one spawn of `kind` somewhere in the disc around the centre; if the ground is
    /// not generated there or the kind does not belong to this patch, nothing comes of it.
    fn spawn_one(&mut self, kind: AmbientKind, env: &SpawnEnv) {
        if self.particles.len() >= MAX_PARTICLES {
            return;
        }
        let (x, y) = self.disc_point(env.center_x, env.center_y);
        let column = (col(x), col(y));
        let Some(ground) = (env.height_at)(column.0, column.1) else {
            return;
        };
        let Some(surface) = (env.surface_at)(column.0, column.1) else {
            return;
        };
        let over_land = !matches!(surface, TerrainMaterial::Water);
        match kind {
            AmbientKind::Pollen => {
                if !over_land {
                    return;
                }
                let time_ms = env.time_ms;
                let gust = gust(time_ms);
                let strength = (env.wind_at)(column.0, column.1);
                let wind = (
                    WIND_DIR.0 * WIND_PUSH * strength * gust,
                    WIND_DIR.1 * WIND_PUSH * strength * gust,
                );
                let height_frac = self.unit();
                let phase = self.unit();
                let life = self.range(6000.0, 9000.0);
                self.particles.push(Particle::pollen(
                    x,
                    y,
                    ground,
                    wind,
                    height_frac,
                    phase,
                    life,
                ));
            }
            AmbientKind::Firefly => {
                if !matches!(surface, TerrainMaterial::Grass | TerrainMaterial::Ground) {
                    return;
                }
                let height_frac = self.unit();
                let phase = self.unit();
                let life = self.range(5000.0, 8000.0);
                self.particles
                    .push(Particle::firefly(x, y, ground, height_frac, phase, life));
            }
        }
    }

    /// A uniformly scattered point in the disc of `SPAWN_RADIUS` around `(cx, cy)`.
    fn disc_point(&mut self, cx: f64, cy: f64) -> (f64, f64) {
        let distance = SPAWN_RADIUS * self.unit().sqrt();
        let angle = self.unit() * std::f64::consts::TAU;
        (cx + distance * angle.cos(), cy + distance * angle.sin())
    }

    /// A uniform in `[0, 1)`.
    fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// A uniform in `[lo, hi)`.
    fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.unit()
    }

    /// xorshift64*, the one source of scatter the swarm has.
    fn next(&mut self) -> u64 {
        let mut value = self.rng;
        value ^= value >> 12;
        value ^= value << 25;
        value ^= value >> 27;
        self.rng = value;
        value.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
}

/// Integrates one particle over `elapsed_ms`: sinking or wobbling, or wandering for a firefly.
fn drift(particle: &mut Particle, elapsed_ms: f64) {
    let dt = elapsed_ms.max(0.0) / 1000.0;
    let wobble = (particle.age_ms * WOBBLE_RATE + particle.phase * std::f64::consts::TAU).sin();
    match particle.kind {
        AmbientKind::Pollen => {
            particle.x += (particle.vx + WOBBLE * wobble) * dt;
            particle.y += (particle.vy + WOBBLE * wobble.cos()) * dt;
            particle.height -= POLLEN_FALL * dt;
        }
        AmbientKind::Firefly => {
            let wander_x = (particle.age_ms / 700.0 + particle.phase * std::f64::consts::TAU).sin();
            let wander_y = (particle.age_ms / 880.0 + particle.phase * 4.1).cos();
            particle.x += FIREFLY_WANDER * wander_x * dt;
            particle.y += FIREFLY_WANDER * wander_y * dt;
        }
    }
}

/// The vertical flutter a particle scribes around its integrated height, in blocks.
fn bob(particle: &Particle) -> f64 {
    let wave = std::f64::consts::TAU;
    match particle.kind {
        AmbientKind::Pollen => 0.06 * (particle.age_ms / 640.0 + particle.phase * wave).sin(),
        AmbientKind::Firefly => 0.16 * (particle.age_ms / 780.0 + particle.phase * wave).sin(),
    }
}

/// How hard the wind blows right now, from `time_ms`: a slow swell with a quicker chop on it,
/// so the drift never feels metronomic.
fn gust(time_ms: f64) -> f64 {
    0.72 + 0.28 * (time_ms / 1800.0).sin() * (time_ms / 460.0 + 1.3).sin()
}

/// 0 at birth and at the end of life, 1 across the middle: every particle fades on both ends.
pub(crate) fn fade(age_ms: f64, life_ms: f64) -> f64 {
    let edge = 700.0_f64.min(life_ms / 2.0);
    let smooth = |t: f64| t * t * (3.0 - 2.0 * t);
    let in_edge = smooth((age_ms / edge).clamp(0.0, 1.0));
    let out_edge = smooth(((life_ms - age_ms) / edge).clamp(0.0, 1.0));
    in_edge.min(out_edge)
}

/// The blink of a firefly across its life, in `[0.1, 1]`.
pub(crate) fn firefly_pulse(age_ms: f64, phase: f64) -> f64 {
    0.55 + 0.45 * (age_ms / 260.0 + phase * std::f64::consts::TAU).sin()
}

/// The straight-line distance two points span, in columns.
fn far(x0: f64, y0: f64, x1: f64, y1: f64) -> f64 {
    (x1 - x0).hypot(y1 - y0)
}

/// The column a fractional coordinate falls in.
fn col(f: f64) -> i32 {
    f.floor() as i32
}

/// The vertical faces of a voxel moved by `(x, y)`.
fn offset(faces: iso::player::VoxelFaces, x: f64, y: f64) -> iso::player::VoxelFaces {
    let move_face = |face: [(f64, f64); 4]| face.map(|point| (point.0 + x, point.1 + y));
    iso::player::VoxelFaces {
        top: move_face(faces.top),
        left: move_face(faces.left),
        right: move_face(faces.right),
    }
}

/// The three faces' colours for one particle at `alpha`, lit top first.
fn colours(particle: &Particle, alpha: f32) -> [Color; 3] {
    let (top, left, right) = match particle.kind {
        AmbientKind::Pollen => (0xfff3b8u32, 0xe8dfa4, 0xcfc494),
        AmbientKind::Firefly => (0xe9ffa1u32, 0xd2ec7c, 0xa9c95e),
    };
    [top, left, right].map(|face| {
        Color::new(
            ((face >> 16) & 0xff) as f32 / 255.0,
            ((face >> 8) & 0xff) as f32 / 255.0,
            (face & 0xff) as f32 / 255.0,
            alpha,
        )
    })
}

#[cfg(test)]
#[path = "ambient.test.rs"]
mod tests;
