//! The puffs of dust the player kicks up, as voxels rather than as a smear of circles.
//!
//! This is the TypeScript client's `player-view/feedback.ts`, carried over whole: the same
//! shapes, the same scatter and the same easing, so a jump raises the same ring of near-white
//! cubes in both clients. Nothing here draws or knows about a window — a puff is a list of
//! voxels, each with where it starts, where it drifts to and how big and bright it is, and the
//! view asks where a voxel is at a point in its life.
//!
//! Why voxels and not a particle crate: `macroquad-particles` draws a whole emitter in one
//! call, with no per-particle depth, so every particle of a puff would land either wholly in
//! front of the player or wholly behind it. Dust that a player runs *through* needs each cube
//! sorted on its own, by the column it drifts over, which is exactly what the scene's draw
//! order already does for terrain, entities and the figure itself. So the dust joins that list
//! as ordinary geometry, and [`get_dust_column`] answers which column and which side of it a
//! cube belongs to.

use crate::player::physics::get_player_column;
use crate::projection::GridPoint;

/// Real milliseconds a puff of dust lasts, at a take-off or a landing.
pub const DUST_MS: f64 = 360.0;

/// Opacity of a puff of dust as it rises, fading to `0` over [`DUST_MS`].
pub const DUST_ALPHA: f64 = 0.85;

/// Landings softer than this, in blocks per tick (a step down onto sand), raise no dust.
pub const DUST_MIN_IMPACT: f64 = 0.1;

/// How much of an effect lasting `duration` is left `ms` after it started: `1` → `0`, `0` after.
fn remaining(ms: f64, duration: f64) -> f64 {
    (1.0 - ms.max(0.0) / duration).max(0.0)
}

/// How the voxels of a kind of puff of dust are scattered: how many, how far from the feet they
/// start and drift outward (in columns), how big (in tiles), how high they start and rise (in
/// blocks; a negative `rise` sinks), how far a kick pushes them (`kick`, in columns: back from
/// where the player runs), the two tints their shades are mixed from (`colors`), how long the
/// puff lasts (`ms`, real milliseconds) and how opaque it starts (`alpha`).
#[derive(Clone, Copy, Debug)]
pub struct DustShape {
    pub voxels: usize,
    pub radius: (f64, f64),
    pub drift: (f64, f64),
    pub size: (f64, f64),
    pub lift: f64,
    pub rise: f64,
    pub kick: f64,
    pub colors: (u32, u32),
    pub ms: f64,
    pub alpha: f64,
}

/// Shades of dust: white to a light grey.
pub const DUST_COLORS: (u32, u32) = (0xffffff, 0xdbdbdb);

/// The puff of a take-off or a landing: a ring of voxels that bursts out from the feet.
pub const BURST_DUST: DustShape = DustShape {
    voxels: 12,
    radius: (0.05, 0.2),
    drift: (0.15, 0.3),
    size: (0.04, 0.08),
    lift: 0.08,
    rise: 0.14,
    kick: 0.0,
    colors: DUST_COLORS,
    ms: DUST_MS,
    alpha: DUST_ALPHA,
};

/// The small puff a running or skidding player kicks up behind its feet.
pub const KICK_DUST: DustShape = DustShape {
    voxels: 4,
    radius: (0.0, 0.08),
    drift: (0.04, 0.1),
    size: (0.035, 0.06),
    lift: 0.05,
    rise: 0.1,
    kick: 0.22,
    colors: DUST_COLORS,
    ms: DUST_MS,
    alpha: DUST_ALPHA,
};

/// How a puff looks at one moment: how far through its life it is and how opaque it is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DustLook {
    pub progress: f64,
    pub alpha: f64,
}

/// A puff of dust `ms` real milliseconds after it rose: how far through its life of `duration`
/// it is (`0` → `1`) and how opaque it is, fading from `alpha`, or `None` once it is gone.
pub fn get_dust(ms: f64, duration: f64, alpha: f64) -> Option<DustLook> {
    let left = remaining(ms, duration);
    if left == 0.0 {
        return None;
    }
    Some(DustLook { progress: 1.0 - left, alpha: alpha * left })
}

/// A voxel of a puff of dust: where it starts, in columns from the feet (`x`, `y`) and in blocks
/// above them (`lift`), the columns it drifts (`drift_x`, `drift_y`) and blocks it rises (`rise`)
/// over the puff's life, its size in tiles and its `shade`, a tint between its shape's two
/// `colors`.
#[derive(Clone, Copy, Debug)]
pub struct DustVoxel {
    pub x: f64,
    pub y: f64,
    pub drift_x: f64,
    pub drift_y: f64,
    pub lift: f64,
    pub rise: f64,
    pub size: f64,
    pub shade: u32,
}

/// The colour `share` (`0` → `1`) of the way from `from` to `to`, channel by channel, rounded
/// towards `from`: the TypeScript client's `mixColor()`.
pub fn mix_color(colors: (u32, u32), share: f64) -> u32 {
    let (from, to) = colors;
    let mut color = 0u32;
    for shift in [16u32, 8, 0] {
        let a = ((from >> shift) & 0xff) as f64;
        let b = ((to >> shift) & 0xff) as f64;
        let channel = (a + ((b - a) * share).trunc()) as u32;
        color |= (channel & 0xff) << shift;
    }
    color
}

/// A stream of numbers in `[0, 1)` from one seed, so that a puff raised with the same seed
/// scatters the same way twice.
///
/// It stands in for the TypeScript client's `createSeededRandom()`: the point is only that two
/// puffs raised one after another look unalike and that a replay of the same frame draws the
/// same dust, not that the two clients produce the very same numbers.
#[derive(Clone, Copy, Debug)]
pub struct DustRandom {
    state: u64,
}

impl DustRandom {
    /// The stream of `seed`, which is the count of puffs raised so far in the TypeScript client.
    pub fn new(seed: u64) -> Self {
        Self { state: seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) ^ 0x6a09_e667_f3bc_c909 }
    }

    /// The next number of the stream, in `[0, 1)`. SplitMix64, as `terrain::noise` hashes.
    pub fn roll(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^= value >> 31;
        (value >> 11) as f64 / (1_u64 << 53) as f64
    }
}

/// The voxels of a puff of dust of `shape`, scattered by the stream of `seed`: spread round the
/// feet at even angles, each turned, sized, lifted and shaded on its own, so no two puffs look
/// alike. `kick`, a direction on the ground (unit or zero), shifts the puff that way and pushes
/// it on as it drifts; `origin`, in columns from the feet, is where it rises.
pub fn get_dust_voxels(
    shape: DustShape,
    seed: u64,
    kick: GridPoint,
    origin: GridPoint,
) -> Vec<DustVoxel> {
    let mut random = DustRandom::new(seed);
    let turn = random.roll();
    (0..shape.voxels)
        .map(|index| {
            let spread = (index as f64 + turn + 0.6 * random.roll()) / shape.voxels as f64;
            let angle = spread * std::f64::consts::TAU;
            let (across, up) = (angle.cos(), angle.sin());
            let radius = between(shape.radius, random.roll());
            let drift = between(shape.drift, random.roll());
            let shade = mix_color(shape.colors, random.roll());
            DustVoxel {
                x: origin.x + across * radius + kick.x * shape.kick * 0.3,
                y: origin.y + up * radius + kick.y * shape.kick * 0.3,
                drift_x: across * drift + kick.x * shape.kick,
                drift_y: up * drift + kick.y * shape.kick,
                lift: shape.lift * random.roll(),
                rise: shape.rise * (0.5 + random.roll()),
                size: between(shape.size, random.roll()),
                shade,
            }
        })
        .collect()
}

/// `share` of the way from the low to the high end of a range.
fn between(range: (f64, f64), share: f64) -> f64 {
    range.0 + (range.1 - range.0) * share
}

/// Where a voxel of dust is and how big: columns from the feet, blocks above them, tiles across.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct DustVoxelState {
    pub x: f64,
    pub y: f64,
    pub height: f64,
    pub size: f64,
}

/// Where `voxel` is `progress` of the way through its puff's life (`0` → `1`): in columns from
/// the feet and blocks above them, drifting and rising fast at first and slowing down, and
/// shrinking as it fades.
pub fn get_dust_voxel_at(voxel: DustVoxel, progress: f64) -> DustVoxelState {
    let eased = 1.0 - (1.0 - progress) * (1.0 - progress);
    DustVoxelState {
        x: voxel.x + voxel.drift_x * eased,
        y: voxel.y + voxel.drift_y * eased,
        height: voxel.lift + voxel.rise * eased,
        size: voxel.size * (1.0 - 0.4 * progress),
    }
}

/// Which column a voxel of dust is drawn with, and whether it goes behind what stands there.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DustColumn {
    pub x: i32,
    pub y: i32,
    pub elevation: f64,
    /// Further from the camera than the feet (in their own column) or than the column's centre
    /// (in any other): drawn before what stands there, else after.
    pub behind: bool,
}

/// The column a voxel of dust at `point` (on the ground, in columns) is drawn with, for feet at
/// `feet` and `level` blocks up, `top_at` giving a column's elevation (`None` where there is
/// none): the column it is over (the feet's own where there is none), at that column's top or,
/// if the top is higher than the feet (a wall), at the block the feet are level with, so the
/// blocks above hide the dust that drifts into the wall.
pub fn get_dust_column(
    point: GridPoint,
    feet: GridPoint,
    level: f64,
    top_at: impl Fn(i32, i32) -> Option<f64>,
) -> DustColumn {
    let own = get_player_column(feet);
    let over = get_player_column(point);
    let reach = level.round();
    let top = top_at(over.x, over.y);
    let column = if top.is_none() { own } else { over };
    let centre = if column.x == own.x && column.y == own.y {
        feet
    } else {
        GridPoint { x: f64::from(column.x), y: f64::from(column.y) }
    };
    let found = top.or_else(|| top_at(own.x, own.y)).unwrap_or(reach);
    DustColumn {
        x: column.x,
        y: column.y,
        elevation: found.min(reach),
        behind: point.x + point.y > centre.x + centre.y,
    }
}

/// The three faces of a voxel seen from the camera, as four screen points each, clockwise from
/// the one furthest from the camera.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VoxelFaces {
    pub top: [(f64, f64); 4],
    pub left: [(f64, f64); 4],
    pub right: [(f64, f64); 4],
}

/// A small voxel standing on the ground, `size` tiles wide, its bottom centred on a point: its
/// top and its two sides facing the camera, in screen pixels from that point, with the
/// proportions of a terrain block, so a puff of dust looks like the world's own voxels.
///
/// The same geometry as the TypeScript client's `getVoxelFaces()`, which builds it once at size
/// `1` and scales the drawing; here each voxel is cut to its own size, because the scene draws
/// geometry rather than keeping a display object per voxel.
pub fn voxel_faces(size: f64, tile_width: f64, tile_height: f64, box_height: f64) -> VoxelFaces {
    let w = size * tile_width / 2.0;
    let t = size * tile_height / 2.0;
    let v = size * box_height;
    VoxelFaces {
        top: [(0.0, -v - t), (w, -v), (0.0, -v + t), (-w, -v)],
        left: [(-w, -v), (0.0, -v + t), (0.0, t), (-w, 0.0)],
        right: [(0.0, -v + t), (w, -v), (w, 0.0), (0.0, t)],
    }
}

#[cfg(test)]
#[path = "dust.test.rs"]
mod tests;
