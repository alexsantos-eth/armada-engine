//! The animated entities: torch, brazier, hanging lantern, fly swarm, geyser, falling leaves and
//! ritual candles. Each one's sprite stands still in the atlas; what moves is drawn here as
//! voxels over it, like the campfire's flames (`fire.rs`), whose flames, fade and voxel helpers
//! it reuses. View state: real time, never saved, and the world never sees it.
//!
//! What a spot draws on its own (flames, the lantern, the flies) is a pure function of the time
//! and the spot, so it costs no state. What it throws off (sparks, smoke, steam, water, leaves)
//! lives in one shared bag, capped at `MAX_MOTES`.

use iso::entities::EntityEffect;
use iso::projection::ProjectionConfig;
use macroquad::prelude::Color;

use crate::assets::sprites::SpriteDraw;
use crate::effects::fire::{
    FireSpot, Flame, VoxelAt, colour, fade, flames, sort_key, spot_phase, voxel_draw,
};

/// Everything thrown off at once, across every animated entity in view.
pub const MAX_MOTES: usize = 260;

/// Model voxels per column and per block: the anchors below are measured in the `.vox` models
/// of `artifacts/vox/clay/vox_buildings.py`, whose comments name the same points.
const VOX_PER_COLUMN: f64 = 128.0;
const VOX_PER_BLOCK: f64 = 85.0;

/// A point of a model, in voxels from its tile's foot, as columns and blocks from the cell
/// centre and the ground.
const fn anchor(x: f64, y: f64, z: f64) -> (f64, f64, f64) {
    (x / VOX_PER_COLUMN, y / VOX_PER_COLUMN, z / VOX_PER_BLOCK)
}

/// The coals in the torch's fire cup.
const TORCH_CUP: (f64, f64, f64) = anchor(-6.0, -6.0, 66.0);
/// The coals in the brazier's bowl.
const BRAZIER_BOWL: (f64, f64, f64) = anchor(-4.0, -4.0, 57.0);
/// The foot of the hook the lantern hangs from.
const LANTERN_HOOK: (f64, f64, f64) = anchor(4.0, 0.0, 62.0);
/// The geyser's mouth: the hot pool at the top of its cone.
const GEYSER_MOUTH: (f64, f64, f64) = anchor(-4.0, -4.0, 18.0);
/// The tip of each candle's wick (`WICKS` in vox_buildings.py: foot + height + the wick).
const CANDLE_WICKS: [(f64, f64, f64); 5] = [
    anchor(-20.0, -18.0, 36.0),
    anchor(-2.0, -4.0, 27.0),
    anchor(-20.0, 2.0, 21.0),
    anchor(24.0, 14.0, 19.0),
    anchor(12.0, 30.0, 13.0),
];

/// How much of the campfire's flame the torch's is, across and up.
const TORCH_FLAME: (f64, f64) = (0.5, 0.55);
/// The brazier's flame: two of the campfire's, a little lower, side by side.
const BRAZIER_FLAME: (f64, f64) = (0.72, 0.62);
/// Columns apart the brazier's two flames stand.
const BRAZIER_SPREAD: f64 = 0.055;

/// Milliseconds of one swing of the lantern, there and back.
const LANTERN_PERIOD: f64 = 2300.0;
/// Radians the lantern swings to each side.
const LANTERN_SWING: f64 = 0.3;
/// Voxels from the hook to the lantern's ring.
const LANTERN_DROP: f64 = 20.0;

/// Flies in one swarm.
const FLIES: usize = 12;

/// Milliseconds of one geyser cycle: quiet, then the burst at its end.
const GEYSER_CYCLE: f64 = 5200.0;
/// Milliseconds the burst lasts, at the end of the cycle.
const GEYSER_BURST: f64 = 1300.0;
/// Drops of water per second at the height of the burst.
const GEYSER_DROPS: f64 = 90.0;
/// Puffs of steam per second while quiet, and at the height of the burst.
const GEYSER_STEAM: (f64, f64) = (1.4, 16.0);
/// Blocks per second squared the water falls back with.
const GRAVITY: f64 = 5.5;

/// Sparks per second off a torch and off a brazier.
const TORCH_SPARKS: f64 = 1.8;
const BRAZIER_SPARKS: f64 = 5.0;
/// Wisps of smoke per second off a torch (the brazier gives none).
const TORCH_SMOKE: f64 = 0.9;
/// Leaves per second off one leaf emitter.
const LEAF_RATE: f64 = 0.8;
/// Blocks above the ground the leaves start falling from: the canopy of a tree.
const LEAF_FROM: (f64, f64) = (1.45, 1.95);
/// Columns around the spot the leaves start from.
const LEAF_REACH: f64 = 0.45;
/// Milliseconds a leaf lies on the ground before it fades.
const LEAF_REST: f64 = 1600.0;

/// An animated entity on screen: what it does and where it stands.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EffectSpot {
    pub kind: EntityEffect,
    /// The cell centre and the ground under it, as for a fire.
    pub at: FireSpot,
}

/// The kinds of thing the spots throw off.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MoteKind {
    Spark,
    Smoke,
    Drop,
    Steam,
    Leaf,
}

/// A spark, a wisp, a drop of water, a puff of steam or a leaf, in world columns.
#[derive(Clone, Copy, Debug)]
struct Mote {
    kind: MoteKind,
    /// The spot it came from; it sorts in depth as that spot does, wherever it drifts.
    source: FireSpot,
    x: f64,
    y: f64,
    /// Blocks above elevation zero.
    height: f64,
    /// Columns per second it drifts along.
    vx: f64,
    vy: f64,
    /// Blocks per second it climbs (falls, when negative).
    vz: f64,
    age_ms: f64,
    life_ms: f64,
    phase: f64,
}

/// What every animated entity in view throws off. View state: real time, never saved.
#[derive(Clone, Debug)]
pub struct Emitters {
    motes: Vec<Mote>,
    rng: u64,
    /// Fractional births owed, one per kind of mote.
    carry: [f64; 5],
}

impl Default for Emitters {
    fn default() -> Self {
        Self::new(0xA11E_5EED_00F1_E5ED)
    }
}

impl Emitters {
    /// The empty bag; the scatter of what the spots throw off comes from `seed`.
    pub fn new(seed: u64) -> Self {
        Self {
            motes: Vec::with_capacity(MAX_MOTES),
            rng: seed | 1,
            carry: [0.0; 5],
        }
    }

    /// How many motes are in the air (or lying on the ground, for leaves).
    pub fn live(&self) -> usize {
        self.motes.len()
    }

    /// Ages and moves every mote by `elapsed_ms` of real time, drops the spent ones and lets
    /// each spot throw off its share of new ones at `time_ms` (the same clock `collect` draws
    /// with, so a geyser bursts when its jet is drawn).
    pub fn update(&mut self, elapsed_ms: f64, time_ms: f64, spots: &[EffectSpot]) {
        let elapsed = elapsed_ms.max(0.0);
        let dt = elapsed / 1000.0;
        for mote in &mut self.motes {
            mote.age_ms += elapsed;
            drift(mote, dt);
        }
        self.motes.retain(|m| m.age_ms < m.life_ms);
        if dt <= 0.0 {
            return;
        }
        for spot in spots {
            for (kind, rate) in rates(spot, time_ms) {
                self.carry[kind as usize] += rate * dt;
            }
        }
        for kind in [
            MoteKind::Spark,
            MoteKind::Smoke,
            MoteKind::Drop,
            MoteKind::Steam,
            MoteKind::Leaf,
        ] {
            let sources: Vec<&EffectSpot> = spots
                .iter()
                .filter(|spot| {
                    rates(spot, time_ms)
                        .iter()
                        .any(|(k, r)| *k == kind && *r > 0.0)
                })
                .collect();
            if sources.is_empty() {
                self.carry[kind as usize] = 0.0;
                continue;
            }
            while self.carry[kind as usize] >= 1.0 {
                self.carry[kind as usize] -= 1.0;
                let spot = *sources[(self.next() % sources.len() as u64) as usize];
                self.throw(kind, &spot, time_ms);
            }
        }
    }

    /// Queues every spot's own moving parts (flames, the lantern, the flies) and every mote, as
    /// voxels in the scene's depth order with the sprite they belong to.
    pub fn collect(
        &self,
        spots: &[EffectSpot],
        time_ms: f64,
        projection: ProjectionConfig,
        draws: &mut Vec<SpriteDraw>,
    ) {
        let box_height = projection.elevation_step.unwrap_or(projection.tile_height);
        let mut push = |source: &FireSpot, at: VoxelAt, size: f64, colours: [Color; 3]| {
            draws.push(voxel_draw(
                at,
                sort_key(source, projection),
                size,
                colours,
                projection,
                box_height,
            ));
        };
        for spot in spots {
            for part in parts(spot, time_ms) {
                push(&spot.at, part.at, part.size, part.colours);
            }
        }
        for mote in &self.motes {
            let (size, colours) = look(mote);
            let at = VoxelAt {
                x: mote.x,
                y: mote.y,
                height: mote.height,
            };
            push(&mote.source, at, size, colours);
        }
    }

    /// Throws one `kind` of mote off `spot`, if there is room for it.
    fn throw(&mut self, kind: MoteKind, spot: &EffectSpot, time_ms: f64) {
        if self.motes.len() >= MAX_MOTES {
            return;
        }
        let at = spot.at;
        let phase = self.unit();
        let angle = self.unit() * std::f64::consts::TAU;
        let mut mote = Mote {
            kind,
            source: at,
            x: at.x,
            y: at.y,
            height: at.ground,
            vx: 0.0,
            vy: 0.0,
            vz: 0.0,
            age_ms: 0.0,
            life_ms: 1000.0,
            phase,
        };
        match kind {
            MoteKind::Spark => {
                let (anchor, top) = match spot.kind {
                    EntityEffect::Brazier => (BRAZIER_BOWL, 0.26),
                    _ => (TORCH_CUP, 0.2),
                };
                let reach = self.unit()
                    * if spot.kind == EntityEffect::Brazier {
                        0.07
                    } else {
                        0.03
                    };
                mote.x += anchor.0 + reach * angle.cos();
                mote.y += anchor.1 + reach * angle.sin();
                mote.height += anchor.2 + top;
                mote.vx = self.range(-0.22, 0.22);
                mote.vy = self.range(-0.22, 0.22);
                mote.vz = self.range(0.7, 1.0);
                mote.life_ms = self.range(550.0, 1100.0);
            }
            MoteKind::Smoke => {
                mote.x += TORCH_CUP.0;
                mote.y += TORCH_CUP.1;
                mote.height += TORCH_CUP.2 + 0.22;
                mote.vx = 0.08 * self.range(0.6, 1.4);
                mote.vy = 0.07 * self.range(0.6, 1.4);
                mote.vz = 0.38;
                mote.life_ms = self.range(1800.0, 2600.0);
            }
            MoteKind::Drop => {
                let reach = self.unit() * 0.035;
                mote.x += GEYSER_MOUTH.0 + reach * angle.cos();
                mote.y += GEYSER_MOUTH.1 + reach * angle.sin();
                mote.height += GEYSER_MOUTH.2;
                let spread = self.range(0.05, 0.3);
                mote.vx = spread * angle.cos();
                mote.vy = spread * angle.sin();
                let blow = geyser_burst(time_ms, spot_phase(&spot.at));
                mote.vz = self.range(3.0, 4.3) * (0.6 + 0.4 * blow);
                mote.life_ms = 2600.0;
            }
            MoteKind::Steam => {
                let reach = self.unit() * 0.06;
                mote.x += GEYSER_MOUTH.0 + reach * angle.cos();
                mote.y += GEYSER_MOUTH.1 + reach * angle.sin();
                mote.height += GEYSER_MOUTH.2 + self.range(0.0, 0.25);
                mote.vx = 0.06 * self.range(0.4, 1.4);
                mote.vy = 0.05 * self.range(0.4, 1.4);
                mote.vz = self.range(0.35, 0.9);
                mote.life_ms = self.range(1600.0, 2600.0);
            }
            MoteKind::Leaf => {
                let reach = LEAF_REACH * self.unit().sqrt();
                mote.x += reach * angle.cos();
                mote.y += reach * angle.sin();
                let from = self.range(LEAF_FROM.0, LEAF_FROM.1);
                mote.height += from;
                mote.vx = self.range(-0.05, 0.05) + 0.04;
                mote.vy = self.range(-0.05, 0.05) + 0.03;
                mote.vz = -self.range(0.22, 0.32);
                mote.life_ms = from / -mote.vz * 1000.0 + LEAF_REST;
            }
        }
        self.motes.push(mote);
    }

    /// A uniform in `[0, 1)`.
    fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// A uniform in `[lo, hi)`.
    fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.unit()
    }

    /// xorshift64*, the one source of scatter the emitters have.
    fn next(&mut self) -> u64 {
        let mut value = self.rng;
        value ^= value >> 12;
        value ^= value << 25;
        value ^= value >> 27;
        self.rng = value;
        value.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
}

/// How hard a geyser is blowing at `time_ms`: 0 while it is quiet, rising to 1 and falling
/// back across the burst at the end of each cycle. Each geyser keeps its own beat.
pub fn geyser_burst(time_ms: f64, phase: f64) -> f64 {
    let t = (time_ms + phase * GEYSER_CYCLE).rem_euclid(GEYSER_CYCLE);
    let into = t - (GEYSER_CYCLE - GEYSER_BURST);
    if into < 0.0 {
        return 0.0;
    }
    let u = into / GEYSER_BURST;
    let smooth = |v: f64| v * v * (3.0 - 2.0 * v);
    smooth((u / 0.15).min(1.0)) * smooth(((1.0 - u) / 0.45).min(1.0))
}

/// What one spot throws off per second at `time_ms`, kind by kind.
fn rates(spot: &EffectSpot, time_ms: f64) -> Vec<(MoteKind, f64)> {
    match spot.kind {
        EntityEffect::Torch => vec![
            (MoteKind::Spark, TORCH_SPARKS),
            (MoteKind::Smoke, TORCH_SMOKE),
        ],
        EntityEffect::Brazier => vec![(MoteKind::Spark, BRAZIER_SPARKS)],
        EntityEffect::Geyser => {
            let blow = geyser_burst(time_ms, spot_phase(&spot.at));
            vec![
                (MoteKind::Drop, GEYSER_DROPS * blow),
                (
                    MoteKind::Steam,
                    GEYSER_STEAM.0 + (GEYSER_STEAM.1 - GEYSER_STEAM.0) * blow,
                ),
            ]
        }
        EntityEffect::Leaves => vec![(MoteKind::Leaf, LEAF_RATE)],
        EntityEffect::Lantern | EntityEffect::Flies | EntityEffect::Candles => Vec::new(),
    }
}

/// One voxel of a spot's own moving parts.
struct Part {
    at: VoxelAt,
    size: f64,
    colours: [Color; 3],
}

/// The moving parts a spot draws on its own at `time_ms`: flames, the lantern, the flies.
/// Pure: the same spot and time give the same parts.
fn parts(spot: &EffectSpot, time_ms: f64) -> Vec<Part> {
    let at = spot.at;
    let phase = spot_phase(&at);
    let opaque = |c: [u32; 3]| c.map(|c| colour(c, 1.0));
    let flame_parts = |anchor: (f64, f64, f64), across: f64, up: f64, dx: f64, phase: f64| {
        flames(time_ms, phase)
            .into_iter()
            .map(move |flame: Flame| Part {
                at: VoxelAt {
                    x: at.x + anchor.0 + dx + flame.dx * across,
                    y: at.y + anchor.1 - dx + flame.dy * across,
                    height: at.ground + anchor.2 + flame.height * up,
                },
                size: flame.size * across,
                colours: opaque(flame.colours),
            })
    };
    match spot.kind {
        EntityEffect::Torch => {
            flame_parts(TORCH_CUP, TORCH_FLAME.0, TORCH_FLAME.1, 0.0, phase).collect()
        }
        EntityEffect::Brazier => {
            let (across, up) = BRAZIER_FLAME;
            let half = BRAZIER_SPREAD / 2.0;
            flame_parts(BRAZIER_BOWL, across, up, -half, phase)
                .chain(flame_parts(BRAZIER_BOWL, across, up, half, phase + 0.37))
                .collect()
        }
        EntityEffect::Lantern => lantern(&at, time_ms, phase),
        EntityEffect::Flies => flies(&at, time_ms, phase),
        EntityEffect::Candles => candles(&at, time_ms, phase),
        EntityEffect::Geyser | EntityEffect::Leaves => Vec::new(),
    }
}

/// The lantern on its chain, swinging across the arm (along y) under the hook, its glass
/// flickering. Drawn from the bottom up, so the cap covers the glass and the glass the base.
fn lantern(at: &FireSpot, time_ms: f64, phase: f64) -> Vec<Part> {
    let tau = std::f64::consts::TAU;
    let swing = LANTERN_SWING * ((time_ms / LANTERN_PERIOD + phase) * tau).sin();
    let hook = (
        at.x + LANTERN_HOOK.0,
        at.y + LANTERN_HOOK.1,
        at.ground + LANTERN_HOOK.2,
    );
    let hang = |drop: f64| VoxelAt {
        x: hook.0,
        y: hook.1 + drop * swing.sin() / VOX_PER_COLUMN,
        height: hook.2 - drop * swing.cos() / VOX_PER_BLOCK,
    };
    let iron = [0x5a5a64u32, 0x4a4a52, 0x3a3a42].map(|c| colour(c, 1.0));
    let flicker = 0.84
        + 0.1 * ((time_ms / 97.0 + phase * 7.0).sin())
        + 0.06 * ((time_ms / 41.0 + phase * 3.0).sin());
    let glow = [0xffe58au32, 0xffd66b, 0xf2b84a].map(|c| lit(c, flicker));
    let ring = hang(LANTERN_DROP);
    let below = |at: VoxelAt, blocks: f64| VoxelAt {
        height: at.height - blocks,
        ..at
    };
    let mut out: Vec<Part> = Vec::with_capacity(7);
    out.push(Part {
        at: below(hang(LANTERN_DROP), 0.16),
        size: 0.075,
        colours: iron,
    });
    out.push(Part {
        at: below(hang(LANTERN_DROP), 0.12),
        size: 0.06,
        colours: glow,
    });
    out.push(Part {
        at: below(hang(LANTERN_DROP), 0.05),
        size: 0.08,
        colours: iron,
    });
    out.push(Part {
        at: below(ring, 0.022),
        size: 0.024,
        colours: iron,
    });
    for link in [5.0, 10.0, 15.0] {
        out.push(Part {
            at: below(hang(link), 0.012),
            size: 0.014,
            colours: iron,
        });
    }
    out
}

/// A cloud of flies buzzing round a point that wanders slowly over the spot.
fn flies(at: &FireSpot, time_ms: f64, phase: f64) -> Vec<Part> {
    let tau = std::f64::consts::TAU;
    let centre = (
        at.x + 0.07 * (time_ms / 2300.0 + phase * tau).sin(),
        at.y + 0.07 * (time_ms / 2900.0 + phase * 5.0).cos(),
        at.ground + 0.42 + 0.06 * (time_ms / 1700.0 + phase * 3.0).sin(),
    );
    let dark = [0x2b2a26u32, 0x1f1e1b, 0x14130f].map(|c| colour(c, 1.0));
    (0..FLIES)
        .map(|n| {
            let k = n as f64;
            let seed = ((k + 1.0) * 12.9898 + phase * 78.233).sin() * 43758.5453;
            let r = seed - seed.floor();
            let speed = 260.0 + 140.0 * r;
            let a = time_ms / speed + r * tau + k;
            let reach = 0.06 + 0.14 * ((k * 0.37 + r) % 1.0);
            let buzz = 0.012 * (time_ms / 31.0 + k * 1.7).sin();
            Part {
                at: VoxelAt {
                    x: centre.0 + reach * a.cos() + buzz,
                    y: centre.1 + reach * (1.3 * a + r).sin() - buzz,
                    height: centre.2 + 0.16 * (a * 0.7 + k).sin() + 0.6 * buzz,
                },
                size: 0.016,
                colours: dark,
            }
        })
        .collect()
}

/// A small flame on each candle's wick, each flickering on its own beat.
fn candles(at: &FireSpot, time_ms: f64, phase: f64) -> Vec<Part> {
    const ORANGE: [u32; 3] = [0xff9a2e, 0xf0821f, 0xd86c18];
    const YELLOW: [u32; 3] = [0xffe27a, 0xf8cf52, 0xe2b63c];
    let mut out = Vec::with_capacity(CANDLE_WICKS.len() * 2);
    for (n, wick) in CANDLE_WICKS.iter().enumerate() {
        let own = phase * 11.0 + n as f64 * 1.913;
        let wave = |rate: f64, offset: f64| (time_ms / rate + own + offset).sin();
        let lean = 0.004 * wave(170.0, 0.0);
        let base = VoxelAt {
            x: at.x + wick.0 + lean,
            y: at.y + wick.1 - lean,
            height: at.ground + wick.2 - 0.004,
        };
        out.push(Part {
            at: base,
            size: 0.02 + 0.003 * wave(120.0, 1.0),
            colours: ORANGE.map(|c| colour(c, 1.0)),
        });
        out.push(Part {
            at: VoxelAt {
                x: at.x + wick.0 + 2.0 * lean,
                y: at.y + wick.1 - 2.0 * lean,
                height: at.ground + wick.2 + 0.018 + 0.006 * (0.5 + 0.5 * wave(90.0, 2.0)),
            },
            size: 0.012 + 0.003 * wave(75.0, 3.0),
            colours: YELLOW.map(|c| colour(c, 1.0)),
        });
    }
    out
}

/// Moves one mote over `dt` seconds.
fn drift(mote: &mut Mote, dt: f64) {
    let tau = std::f64::consts::TAU;
    match mote.kind {
        MoteKind::Spark => {
            let waver = (mote.age_ms / 90.0 + mote.phase * tau).sin();
            mote.x += (mote.vx + 0.1 * waver) * dt;
            mote.y += (mote.vy + 0.1 * waver.cos()) * dt;
            mote.height += mote.vz * dt;
        }
        MoteKind::Smoke | MoteKind::Steam => {
            let sway = (mote.age_ms / 520.0 + mote.phase * tau).sin();
            mote.x += (mote.vx + 0.035 * sway) * dt;
            mote.y += (mote.vy + 0.035 * sway.cos()) * dt;
            mote.height += mote.vz * dt;
        }
        MoteKind::Drop => {
            mote.x += mote.vx * dt;
            mote.y += mote.vy * dt;
            mote.vz -= GRAVITY * dt;
            mote.height += mote.vz * dt;
            if mote.vz < 0.0 && mote.height <= mote.source.ground + GEYSER_MOUTH.2 {
                mote.age_ms = mote.life_ms;
            }
        }
        MoteKind::Leaf => {
            let floor = mote.source.ground + 0.02;
            if mote.height > floor {
                let flutter = (mote.age_ms / 650.0 + mote.phase * tau).sin();
                mote.x += (mote.vx + 0.16 * flutter) * dt;
                mote.y += (mote.vy - 0.12 * flutter) * dt;
                let slow = 0.75 + 0.25 * (mote.age_ms / 330.0 + mote.phase * tau).cos();
                mote.height = (mote.height + mote.vz * slow * dt).max(floor);
            }
        }
    }
}

/// The size and the face colours of a mote now.
fn look(mote: &Mote) -> (f64, [Color; 3]) {
    let fade = match mote.kind {
        MoteKind::Leaf => {
            let end = (mote.life_ms - mote.age_ms) / 600.0;
            (mote.age_ms / 300.0).min(end).clamp(0.0, 1.0)
        }
        _ => fade(mote.age_ms, mote.life_ms),
    };
    let grow = (mote.age_ms / mote.life_ms).clamp(0.0, 1.0);
    match mote.kind {
        MoteKind::Spark => {
            let glow = 0.6 + 0.4 * (mote.age_ms / 70.0 + mote.phase * std::f64::consts::TAU).sin();
            (
                0.016,
                [0xffe08au32, 0xffa638, 0xe5701c].map(|c| colour(c, (fade * glow) as f32)),
            )
        }
        MoteKind::Smoke => (
            0.035 + 0.045 * grow,
            [0x8d8a86u32, 0x74716e, 0x625f5c].map(|c| colour(c, (fade * 0.42) as f32)),
        ),
        MoteKind::Drop => (
            0.024,
            [0xf4fcffu32, 0xd5ecf3, 0xb3d8e2].map(|c| colour(c, (fade * 0.95) as f32)),
        ),
        MoteKind::Steam => (
            0.03 + 0.06 * grow,
            [0xffffffu32, 0xeef2f4, 0xdde3e6].map(|c| colour(c, (fade * 0.7) as f32)),
        ),
        MoteKind::Leaf => {
            let colours = match (mote.phase * 3.0) as u32 {
                0 => [0x80c034u32, 0x6fa82c, 0x5f9426],
                1 => [0xf0a830, 0xd9952a, 0xbf8224],
                _ => [0xc9702e, 0xb06228, 0x955322],
            };
            (0.028, colours.map(|c| colour(c, fade as f32)))
        }
    }
}

/// An `0xRRGGBB` colour brightened or dimmed by `light`, opaque.
fn lit(rgb: u32, light: f64) -> Color {
    let channel = |shift: u32| ((((rgb >> shift) & 0xff) as f64 / 255.0) * light).min(1.0) as f32;
    Color::new(channel(16), channel(8), channel(0), 1.0)
}

#[cfg(test)]
#[path = "emitters.test.rs"]
mod tests;
