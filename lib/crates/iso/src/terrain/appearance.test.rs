use super::*;

const SEED: u64 = 1337;

/// The grass palette, ordered dark to dry.
const GRASS: [u32; 5] = [0xbfd5bd, 0xdde9d4, 0xffffff, 0xfff0c0, 0xffe49c];
/// The grass tops and their shares.
const CHANCES: [f64; 9] = [0.05, 0.04, 0.025, 0.025, 0.07, 0.04, 0.035, 0.015, 0.02];

/// Every column of a square, so a share can be counted rather than guessed at.
fn columns(side: i32) -> impl Iterator<Item = (i32, i32)> {
    (0..side).flat_map(move |x| (0..side).map(move |y| (x, y)))
}

#[test]
fn a_label_gets_its_own_stream_and_keeps_it() {
    assert_ne!(derive_seed(SEED, "tints"), derive_seed(SEED, "variants"));
    assert_ne!(derive_seed(SEED, "tints"), derive_seed(SEED + 1, "tints"));
    assert_eq!(derive_seed(SEED, "tints"), derive_seed(SEED, "tints"));
    assert_ne!(derive_seed(SEED, "a"), derive_seed(SEED, "b"));
}

#[test]
fn a_field_is_smooth_bounded_and_the_same_at_a_column_every_time() {
    let field = NoiseField::new(SEED, "terrain-tints:grass", 10.0, 0.0);
    for (x, y) in columns(40) {
        let value = field.sample(x, y);
        assert!((0.0..=1.0).contains(&value), "{value} out of range");
        assert_eq!(value, field.sample(x, y), "a column is answered the same");
        assert!((value - field.sample(x + 1, y)).abs() < 0.5);
    }
}

/// The second octave is what frays the edge of a clump; it must still land in range, and it must
#[test]
fn detail_frays_the_field_without_leaving_its_range() {
    let plain = NoiseField::new(SEED, "patches", 6.0, 0.0);
    let frayed = NoiseField::new(SEED, "patches", 6.0, 0.35);
    let mut differs = 0;
    for (x, y) in columns(30) {
        let value = frayed.sample(x, y);
        assert!((0.0..=1.0).contains(&value), "{value} out of range");
        if (value - plain.sample(x, y)).abs() > 1e-9 {
            differs += 1;
        }
    }
    assert!(differs > 800, "the octave barely showed: {differs}/900");
}

#[test]
fn a_zone_index_stays_inside_the_palette() {
    assert_eq!(zone_index(0.0, 5), 0);
    assert_eq!(zone_index(0.19, 5), 0);
    assert_eq!(zone_index(0.5, 5), 2);
    assert_eq!(
        zone_index(1.0, 5),
        4,
        "the top of the range is the last zone"
    );
    assert_eq!(zone_index(0.5, 1), 0);
}

#[test]
fn a_tint_is_split_into_channels_in_unit_range() {
    assert_eq!(tint_channels(0xffffff), (1.0, 1.0, 1.0));
    assert_eq!(tint_channels(0x000000), (0.0, 0.0, 0.0));
    let (red, green, blue) = tint_channels(0xffe49c);
    assert_eq!(red, 1.0);
    assert!((green - 228.0 / 255.0).abs() < 1e-6);
    assert!((blue - 156.0 / 255.0).abs() < 1e-6);
}

#[test]
fn a_palette_needs_a_colour() {
    assert!(TintZones::new(SEED, "grass", 10.0, &[]).is_none());
}

/// The point of the zones: the plain middle colour is the common one and the extremes are accents,
#[test]
fn the_middle_zone_is_the_common_one_and_the_extremes_are_accents() {
    let zones = TintZones::new(SEED, "terrain-tints:grass", 10.0, &GRASS).expect("a palette");
    let mut counts = [0usize; 5];
    for (x, y) in columns(200) {
        let color = zones.at(x, y);
        counts[GRASS
            .iter()
            .position(|c| *c == color)
            .expect("a palette colour")] += 1;
    }
    let share = counts.map(|count| count as f64 / 40_000.0);
    assert!(share[2] > 0.25 && share[2] < 0.40, "middle: {:?}", share);
    assert!(share[0] > 0.04 && share[0] < 0.16, "darkest: {:?}", share);
    assert!(share[4] > 0.04 && share[4] < 0.16, "driest: {:?}", share);
    assert!(counts.iter().all(|count| *count > 0), "{:?}", counts);
}

/// A zone is a region, not a speckle: a column almost always shares its colour with its
#[test]
fn a_tint_zone_is_a_region_rather_than_a_speckle() {
    let zones = TintZones::new(SEED, "terrain-tints:grass", 10.0, &GRASS).expect("a palette");
    let mut same = 0;
    for (x, y) in columns(100) {
        if zones.at(x, y) == zones.at(x + 1, y) {
            same += 1;
        }
    }
    assert!(same > 8_000, "neighbours agreed only {same}/10000 times");
}

#[test]
fn nothing_is_asked_for_means_no_picker() {
    assert!(VariantPicker::new(SEED, "grass", &[]).is_none());
    assert!(VariantPicker::new(SEED, "grass", &[0.0, 0.0]).is_none());
}

#[test]
fn a_column_is_always_answered_the_same_whatever_the_order() {
    let picker = VariantPicker::new(SEED, "terrain-variants:grass", &CHANCES).expect("a picker");
    let forwards: Vec<_> = columns(30).map(|(x, y)| picker.pick(x, y)).collect();
    let backwards: Vec<_> = columns(30)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|(x, y)| picker.pick(x, y))
        .collect();
    assert_eq!(
        forwards,
        backwards.into_iter().rev().collect::<Vec<_>>(),
        "a column's top cannot depend on when it was asked for"
    );
    assert_eq!(picker.pick(-500, -700), picker.pick(-500, -700));
}

/// Each variant covers about the share the content asked for. This is what the calibration buys:
#[test]
fn every_variant_covers_about_the_share_it_asked_for() {
    let picker = VariantPicker::new(SEED, "terrain-variants:grass", &CHANCES).expect("a picker");
    let mut counts = [0usize; 9];
    let mut plain = 0usize;
    let side = 300;
    for (x, y) in columns(side) {
        match picker.pick(x, y) {
            Some(index) => counts[index] += 1,
            None => plain += 1,
        }
    }
    let total = f64::from(side) * f64::from(side);
    let dressed: f64 = counts.iter().sum::<usize>() as f64 / total;
    let asked: f64 = CHANCES.iter().sum();
    assert!(
        (dressed - asked).abs() < 0.05,
        "{dressed} of the ground is dressed, {asked} was asked for"
    );
    assert!(plain as f64 / total > 0.6, "most of the grass stays plain");
    for (index, chance) in CHANCES.iter().enumerate() {
        let share = counts[index] as f64 / total;
        assert!(
            (share - chance).abs() < 0.035,
            "variant {index} covers {share}, {chance} was asked for"
        );
    }
}

/// Grouped, not sprinkled: a dressed column's neighbours are far likelier to be dressed too than
#[test]
fn the_variants_come_in_clumps_of_one_kind() {
    let picker = VariantPicker::new(SEED, "terrain-variants:grass", &CHANCES).expect("a picker");
    let (mut dressed, mut neighbour_dressed, mut neighbour_same) = (0, 0, 0);
    for (x, y) in columns(300) {
        let Some(kind) = picker.pick(x, y) else {
            continue;
        };
        dressed += 1;
        for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
            if let Some(other) = picker.pick(nx, ny) {
                neighbour_dressed += 1;
                if other == kind {
                    neighbour_same += 1;
                }
            }
        }
    }
    let together = f64::from(neighbour_dressed) / (f64::from(dressed) * 4.0);
    assert!(
        together > 0.45,
        "only {together} of a dressed column's neighbours were dressed: that is sprinkled, not clumped"
    );
    let agree = f64::from(neighbour_same) / f64::from(neighbour_dressed);
    assert!(
        agree > 0.8,
        "neighbouring tops agreed only {agree} of the time"
    );
}

/// The scatter is what keeps a clump from being a solid blob of flowers.
#[test]
fn a_clump_is_scattered_rather_than_solid() {
    let picker = VariantPicker::new(SEED, "terrain-variants:grass", &CHANCES).expect("a picker");
    let patched = columns(300)
        .filter(|(x, y)| picker.patches.sample(*x, *y) > picker.patch_above)
        .count();
    let dressed = columns(300)
        .filter(|(x, y)| picker.pick(*x, *y).is_some())
        .count();
    let fill = dressed as f64 / patched as f64;
    assert!(
        (fill - VARIANT_PATCH_FILL).abs() < 0.05,
        "{fill} of a clump's columns grew something, {VARIANT_PATCH_FILL} was asked for"
    );
}

/// A single variant asked for more than the clumps can hold: it takes every clumped column rather
#[test]
fn one_variant_asked_for_everything_fills_every_clump() {
    let picker = VariantPicker::new(SEED, "terrain-variants:grass", &[1.0]).expect("a picker");
    let dressed = columns(200)
        .filter(|(x, y)| picker.pick(*x, *y) == Some(0))
        .count();
    let share = dressed as f64 / 40_000.0;
    assert!(
        (share - VARIANT_PATCH_FILL).abs() < 0.02,
        "{share} of the ground was dressed: the clumps are full, so the scatter is the ceiling"
    );
}

/// A chance of zero is a variant that is off, not one that quietly shows anyway.
#[test]
fn a_variant_with_no_chance_never_shows() {
    let picker =
        VariantPicker::new(SEED, "terrain-variants:grass", &[0.1, 0.0, 0.1]).expect("a picker");
    assert!(columns(300).all(|(x, y)| picker.pick(x, y) != Some(1)));
    assert!(columns(300).any(|(x, y)| picker.pick(x, y) == Some(0)));
    assert!(columns(300).any(|(x, y)| picker.pick(x, y) == Some(2)));
}

#[test]
fn a_quantile_reads_the_ends_of_the_sample_as_no_bound_at_all() {
    let sorted = [0.0, 0.25, 0.5, 0.75];
    assert_eq!(quantile(&sorted, 0.0), f64::NEG_INFINITY);
    assert_eq!(quantile(&sorted, 1.0), f64::INFINITY);
    assert_eq!(quantile(&sorted, -1.0), f64::NEG_INFINITY);
    assert_eq!(quantile(&sorted, 0.5), 0.5);
}
