//! The kit's animations as pure curves, ported from `web/ui/armada-ui.css` (`ac-pop`, `ac-out`,
//! `ac-bump`, `ac-chop`) and the flight of `ArmadaUI.fly`. Times are milliseconds since the
//! animation started; lengths are screen pixels. Keyframes are joined linearly.

use macroquad::math::{Mat4, Vec3};

/// How long the bubble's pop-in lasts.
pub(crate) const POP_MS: f64 = 900.0;
/// How long the bubble stays before it starts to leave.
pub(crate) const BUBBLE_HOLD_MS: f64 = 1600.0;
/// How long the bubble takes to leave.
pub(crate) const OUT_MS: f64 = 250.0;
/// How long a slot's bump lasts.
pub(crate) const BUMP_MS: f64 = 450.0;
/// How long a gain takes to fly to its slot.
pub(crate) const FLY_MS: f64 = 760.0;
/// One swing of the working tool on the action button.
pub(crate) const CHOP_MS: f64 = 360.0;
/// How far above the higher end the flight's arc rises.
const FLY_RISE: f32 = 110.0;

/// The bubble's transform at one moment: scale, rotation (degrees), offset and opacity.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct BubblePose {
    pub(crate) scale: f32,
    pub(crate) turn: f32,
    pub(crate) dx: f32,
    pub(crate) dy: f32,
    pub(crate) opacity: f32,
}

/// A flying gain at one moment: where its centre is, its scale, rotation and opacity.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct FlyPose {
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) scale: f32,
    pub(crate) turn: f32,
    pub(crate) opacity: f32,
}

const POP: [(f32, [f32; 4]); 7] = [
    (0.0, [0.2, -12.0, 0.0, 0.0]),
    (0.35, [1.12, 4.0, 0.0, 1.0]),
    (0.45, [1.0, -3.0, -6.0, 1.0]),
    (0.55, [1.0, 3.0, 6.0, 1.0]),
    (0.65, [1.0, -2.0, -4.0, 1.0]),
    (0.75, [1.0, 1.0, 3.0, 1.0]),
    (1.0, [1.0, -2.0, 0.0, 1.0]),
];

const BUMP: [(f32, [f32; 4]); 5] = [
    (0.0, [1.0, 1.0, 0.0, 0.0]),
    (0.25, [1.22, 0.86, 5.0, 0.0]),
    (0.5, [0.92, 1.1, -4.0, 0.0]),
    (0.75, [1.0, 1.0, 2.0, 0.0]),
    (1.0, [1.0, 1.0, 0.0, 0.0]),
];

/// The values of `frames` at `t` in `[0, 1]`, joined linearly.
fn keyframes(frames: &[(f32, [f32; 4])], t: f32) -> [f32; 4] {
    let t = t.clamp(0.0, 1.0);
    for pair in frames.windows(2) {
        let (t0, a) = pair[0];
        let (t1, b) = pair[1];
        if t <= t1 {
            let k = if t1 > t0 { (t - t0) / (t1 - t0) } else { 1.0 };
            return std::array::from_fn(|i| a[i] + (b[i] - a[i]) * k);
        }
    }
    frames.last().map_or([0.0; 4], |(_, values)| *values)
}

/// The bubble `age_ms` after it popped: the pop-in with its shake, a rest, then the exit.
pub(crate) fn bubble_pose(age_ms: f64) -> BubblePose {
    if age_ms >= BUBBLE_HOLD_MS {
        let k = ((age_ms - BUBBLE_HOLD_MS) / OUT_MS).clamp(0.0, 1.0) as f32;
        return BubblePose {
            scale: 1.0 - 0.2 * k,
            turn: -2.0,
            dx: 0.0,
            dy: -14.0 * k,
            opacity: 1.0 - k,
        };
    }
    let [scale, turn, dx, opacity] = keyframes(&POP, (age_ms / POP_MS) as f32);
    BubblePose {
        scale,
        turn,
        dx,
        dy: 0.0,
        opacity,
    }
}

/// Whether the bubble has finished leaving.
pub(crate) fn bubble_done(age_ms: f64) -> bool {
    age_ms >= BUBBLE_HOLD_MS + OUT_MS
}

/// A slot's bump `age_ms` after it started: scale x, scale y and rotation (degrees).
pub(crate) fn bump_pose(age_ms: f64) -> (f32, f32, f32) {
    let [sx, sy, turn, _] = keyframes(&BUMP, (age_ms / BUMP_MS) as f32);
    (sx, sy, turn)
}

/// The kit's flight easing, close to `cubic-bezier(.4, 0, .6, 1)`.
fn ease_in_out(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

/// A gain `age_ms` into its flight from `from` to `to`: a parabola rising `FLY_RISE` above the
/// higher end, growing in, shaking less and less, and fading at the very end.
pub(crate) fn fly_pose(age_ms: f64, from: (f32, f32), to: (f32, f32)) -> FlyPose {
    let t = ease_in_out(((age_ms / FLY_MS) as f32).clamp(0.0, 1.0));
    let u = 1.0 - t;
    let peak = from.1.min(to.1) - FLY_RISE;
    let x = u * u * from.0 + 2.0 * u * t * f32::midpoint(from.0, to.0) + t * t * to.0;
    let y = u * u * from.1 + 2.0 * u * t * peak + t * t * to.1;
    let scale = if t < 0.15 {
        0.4 + t * 5.2
    } else {
        1.18 - t * 0.5
    };
    let turn = (t * std::f32::consts::PI * 6.0).sin() * (1.0 - t) * 14.0;
    FlyPose {
        x,
        y,
        scale,
        turn,
        opacity: if t > 0.92 { 0.0 } else { 1.0 },
    }
}

/// The working tool's angle (degrees) `age_ms` into its swing loop.
pub(crate) fn chop_angle(age_ms: f64) -> f32 {
    let phase = (age_ms.rem_euclid(CHOP_MS) / CHOP_MS) as f32;
    -22.0 * (0.5 - 0.5 * (phase * std::f32::consts::TAU).cos())
}

/// The screen-space matrix that draws around `pivot` scaled by `scale`, turned `turn_deg`
/// clockwise and moved by `offset`, on a `screen` of that size; what a CSS transform does to an
/// element with its origin at `pivot`.
pub(crate) fn pose_matrix(
    screen: (f32, f32),
    pivot: (f32, f32),
    scale: (f32, f32),
    turn_deg: f32,
    offset: (f32, f32),
) -> Mat4 {
    let ortho = Mat4::orthographic_rh_gl(0.0, screen.0, screen.1, 0.0, -1.0, 1.0);
    let to_pivot = Mat4::from_translation(Vec3::new(pivot.0 + offset.0, pivot.1 + offset.1, 0.0));
    let turn = Mat4::from_rotation_z(turn_deg.to_radians());
    let grow = Mat4::from_scale(Vec3::new(scale.0, scale.1, 1.0));
    let from_pivot = Mat4::from_translation(Vec3::new(-pivot.0, -pivot.1, 0.0));
    ortho * to_pivot * turn * grow * from_pivot
}

#[cfg(test)]
#[path = "motion.test.rs"]
mod tests;
