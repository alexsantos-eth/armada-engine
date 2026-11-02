use super::*;

#[test]
fn noise_is_bounded_smooth_and_independent_of_chunk_requests() {
    for x in -80..=80 {
        let sample = value_noise(31, x as f64, -17.0, 48.0);
        assert!((0.0..=1.0).contains(&sample));
        assert_eq!(sample, value_noise(31, x as f64, -17.0, 48.0));
        if x < 80 {
            assert!((sample - value_noise(31, (x + 1) as f64, -17.0, 48.0)).abs() < 0.1);
        }
    }
    assert_ne!(
        value_noise(31, 9.0, 7.0, 48.0),
        value_noise(32, 9.0, 7.0, 48.0)
    );
}
