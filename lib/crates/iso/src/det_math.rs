//! Trigonometry built from `+ - * /`, `sqrt` and `round` alone, the operations IEEE 754 fixes to
//! the last bit. `f64::sin` and friends call the platform's libm, which differs between native
//! and WebAssembly, so anything the simulation decides with must use these instead.

use std::f64::consts::{FRAC_PI_2, PI, TAU};

/// Sine of `x` radians, the same bits on every platform.
pub fn sin(x: f64) -> f64 {
    let x = x - TAU * (x / TAU).round();
    // Fold into [-π/2, π/2] so the series converges fast.
    let x = if x > FRAC_PI_2 {
        PI - x
    } else if x < -FRAC_PI_2 {
        -PI - x
    } else {
        x
    };
    let square = x * x;
    let mut term = x;
    let mut sum = x;
    for n in 1..=12 {
        let k = f64::from(2 * n);
        term = -term * square / (k * (k + 1.0));
        sum += term;
    }
    sum
}

/// Cosine of `x` radians, the same bits on every platform.
pub fn cos(x: f64) -> f64 {
    let x = (x - TAU * (x / TAU).round()).abs();
    // cos(x) = -cos(π - x): exact at 0 and π, which eases and hops rely on.
    let (x, sign) = if x > FRAC_PI_2 {
        (PI - x, -1.0)
    } else {
        (x, 1.0)
    };
    let square = x * x;
    let mut term = 1.0;
    let mut sum = 1.0;
    for n in 1..=12 {
        let k = f64::from(2 * n);
        term = -term * square / ((k - 1.0) * k);
        sum += term;
    }
    sign * sum
}

/// Arctangent of `x`, in `(-π/2, π/2)`.
pub fn atan(x: f64) -> f64 {
    if x.abs() > 1.0 {
        let flipped = FRAC_PI_2 - atan(1.0 / x.abs());
        return if x < 0.0 { -flipped } else { flipped };
    }
    // Halve the angle twice, atan(x) = 2·atan(x / (1 + √(1 + x²))), so the series is short.
    let mut y = x;
    for _ in 0..2 {
        y /= 1.0 + (1.0 + y * y).sqrt();
    }
    let square = y * y;
    let mut power = y;
    let mut sum = y;
    for n in 1..=14 {
        power = -power * square;
        sum += power / f64::from(2 * n + 1);
    }
    4.0 * sum
}

/// The angle of the point (`x`, `y`) from the positive x axis, in `(-π, π]`.
pub fn atan2(y: f64, x: f64) -> f64 {
    if x > 0.0 {
        atan(y / x)
    } else if x < 0.0 {
        if y >= 0.0 {
            atan(y / x) + PI
        } else {
            atan(y / x) - PI
        }
    } else if y > 0.0 {
        FRAC_PI_2
    } else if y < 0.0 {
        -FRAC_PI_2
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_matches_libm_closely() {
        let mut x = -50.0;
        while x < 50.0 {
            assert!((sin(x) - x.sin()).abs() < 1e-12, "sin({x})");
            assert!((cos(x) - x.cos()).abs() < 1e-12, "cos({x})");
            x += 0.0137;
        }
        for (y, x) in [
            (1.0, 1.0),
            (-1.0, 1.0),
            (1.0, -1.0),
            (-1.0, -1.0),
            (0.0, -1.0),
            (3.0, 0.2),
        ] {
            assert!(
                (atan2(y, x) - f64::atan2(y, x)).abs() < 1e-12,
                "atan2({y}, {x})"
            );
        }
        assert_eq!(atan2(1.0, 0.0), FRAC_PI_2);
    }
}
