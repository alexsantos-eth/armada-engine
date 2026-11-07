//! Deterministic value noise sampled in absolute world coordinates.

fn hash(seed: u64, x: i64, y: i64) -> u64 {
    let mut value = seed
        ^ (x as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15)
        ^ (y as u64).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn lattice(seed: u64, x: i64, y: i64) -> f64 {
    (hash(seed, x, y) >> 11) as f64 / ((1_u64 << 53) - 1) as f64
}

/// The lattice value of one integer point, for anything that wants an unrelated number per column
/// rather than a smooth field: the scatter inside a clump of plants, say. Same point, same number.
pub fn lattice_at(seed: u64, x: i64, y: i64) -> f64 {
    lattice(seed, x, y)
}

fn smooth(t: f64) -> f64 {
    t * t * (3.0 - 2.0 * t)
}
fn mix(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Smooth field in `[0, 1]`; a chunk's identity never enters the sampling.
pub fn value_noise(seed: u64, x: f64, y: f64, scale: f64) -> f64 {
    let fx = x / scale;
    let fy = y / scale;
    let ix = fx.floor() as i64;
    let iy = fy.floor() as i64;
    let tx = smooth(fx - ix as f64);
    let ty = smooth(fy - iy as f64);
    mix(
        mix(lattice(seed, ix, iy), lattice(seed, ix + 1, iy), tx),
        mix(lattice(seed, ix, iy + 1), lattice(seed, ix + 1, iy + 1), tx),
        ty,
    )
}

#[cfg(test)]
#[path = "noise.test.rs"]
mod tests;
