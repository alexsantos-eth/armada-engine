use super::*;
use crate::lighting::{
    BoxMetrics, CasterShapes, GroundCast, MapArea, ShadowCaster, ShadowMap, SpriteExtent,
    bake_ground_shadows, lift_reach, volume_stamp,
};

/// One column of a test file: `(x, y, runs)`.
type TestColumn<'a> = (u8, u8, &'a [(u8, u8)]);

/// A file with one entry, its model `tiles` across and its columns as `(x, y, runs)`.
fn file(source: &str, tiles: (u8, u8), columns: &[TestColumn<'_>]) -> Vec<u8> {
    let mut out = b"ASVL".to_vec();
    for value in [1u16, 4, 128, 85] {
        out.extend_from_slice(&value.to_le_bytes());
    }
    out.extend_from_slice(&1u32.to_le_bytes());
    out.extend_from_slice(&(source.len() as u16).to_le_bytes());
    out.extend_from_slice(source.as_bytes());
    out.extend_from_slice(&[tiles.0, tiles.1]);
    out.extend_from_slice(&(columns.len() as u32).to_le_bytes());
    for (x, y, runs) in columns {
        out.extend_from_slice(&[*x, *y, runs.len() as u8]);
        for (low, high) in runs.iter() {
            out.extend_from_slice(&[*low, *high]);
        }
    }
    out
}

#[test]
fn a_column_in_the_middle_of_a_one_tile_model_stands_on_the_anchor_centre() {
    // Columns 15 and 16 of 32 straddle the middle of the tile; column 16 starts on it.
    let bytes = file("/assets/tree/block.png", (1, 1), &[(16, 16, &[(0, 84)])]);
    let volumes = parse_shadow_volumes(&bytes).expect("a valid file");
    let (source, volume) = &volumes[0];

    assert_eq!(source, "/assets/tree/block.png");
    let column = volume.columns[0];
    assert!((column.x + 1.0 / 64.0).abs() < 1e-9, "x = {}", column.x);
    assert!((column.y + 1.0 / 64.0).abs() < 1e-9, "y = {}", column.y);
    assert_eq!(column.runs(), &[(0.0, 1.0)], "85 voxels are one block");
    assert!((volume.column - 1.0 / 32.0).abs() < 1e-12);
    assert!((volume.top - 1.0).abs() < 1e-12);
}

/// Model `x` runs down-right on screen (world `−y`) and model `y` down-left (world `−x`); the
/// anchor is the model's last tile, so a two-tile model's first tile is the cell past it.
#[test]
fn a_two_tile_models_first_tile_is_the_cell_beyond_the_anchor() {
    let along_y = file("/a.png", (1, 2), &[(16, 0, &[(0, 0)]), (16, 63, &[(0, 0)])]);
    let volume = &parse_shadow_volumes(&along_y).unwrap()[0].1;
    // The first column along the model's y is a tile up world x from the anchor's centre.
    assert!((volume.columns[0].x - (1.0 - 1.0 / 64.0 + 0.5)).abs() < 0.02);
    assert!(volume.columns[1].x.abs() < 0.5);

    let along_x = file("/b.png", (2, 1), &[(0, 16, &[(0, 0)])]);
    let volume = &parse_shadow_volumes(&along_x).unwrap()[0].1;
    assert!(
        volume.columns[0].y > 1.0,
        "the model's first tile along x is world +y"
    );
}

#[test]
fn a_file_that_is_not_one_is_refused() {
    assert!(parse_shadow_volumes(b"nope").is_err());
    let mut short = file("/a.png", (1, 1), &[(0, 0, &[(0, 1)])]);
    short.truncate(short.len() - 1);
    assert!(parse_shadow_volumes(&short).is_err());
}

/// A post one column wide and one block tall, standing on the middle of cell (0, 0), with the
/// sun behind the camera.
#[test]
fn a_volumes_shadow_starts_at_its_foot_and_reaches_as_far_as_its_top() {
    let light = ShadowProjection {
        dir_x: std::f64::consts::FRAC_1_SQRT_2,
        dir_y: std::f64::consts::FRAC_1_SQRT_2,
        stretch: 1.0,
        alpha: 1.0,
    };
    let metrics = BoxMetrics {
        tile_width: 100.0,
        box_height: 100.0 / 3.0,
    };
    let volume = ShadowVolume::new(
        0.25,
        vec![VolumeColumn {
            x: 0.0,
            y: 0.0,
            runs: [(0.0, 1.0), (0.0, 0.0)],
            len: 1,
        }],
    );
    let caster = ShadowCaster {
        foot: (0.5, 0.5),
        elevation: 0.0,
        extent: SpriteExtent {
            left: 0.0,
            top: 0.0,
            width: 0.0,
            height: 0.0,
        },
        silhouette: 0,
        crop: None,
        cast: GroundCast::Volume(0),
    };
    let mut map = ShadowMap::new(
        MapArea {
            min_x: -1,
            min_y: -1,
            max_x: 3,
            max_y: 3,
        },
        8,
    );
    let stamp = std::rc::Rc::new(volume_stamp(&volume, &light, metrics, 8));
    bake_ground_shadows(
        &mut map,
        &[caster],
        None,
        &light,
        metrics,
        &|_, _| Some(0.0),
        CasterShapes {
            silhouette_of: &|_| None,
            stamp_of: &|_| Some(stamp.clone()),
        },
    );
    let at = |x: f64, y: f64| {
        let tx = ((x + 1.0) * 8.0) as usize;
        let ty = ((y + 1.0) * 8.0) as usize;
        map.alpha[ty * map.width as usize + tx]
    };
    let reach = lift_reach(&light, 1.0, metrics.tile_width, metrics.box_height);
    let along = reach * std::f64::consts::FRAC_1_SQRT_2;

    assert!(at(0.5, 0.5) > 0, "the foot is in shade");
    assert!(
        at(0.5 + along * 0.9, 0.5 + along * 0.9) > 0,
        "so is the line up to the top's reach"
    );
    assert_eq!(
        at(0.5 + along + 0.3, 0.5 + along + 0.3),
        0,
        "nothing past it"
    );
    assert_eq!(at(0.5 - 0.3, 0.5 - 0.3), 0, "nothing towards the sun");
    assert_eq!(at(0.5 + 0.4, 0.5 - 0.4), 0, "nor to either side");
}

#[test]
fn the_shipped_volumes_read_and_cover_the_trees() {
    let bytes = include_bytes!("../../../../content/volumes/shadow-volumes.bin");
    let volumes = parse_shadow_volumes(bytes).expect("the shipped file reads");
    let tree = volumes
        .iter()
        .find(|(source, _)| source == "/assets/tree/block_4.png")
        .map(|(_, volume)| volume)
        .expect("the acacia has a volume");

    assert!(
        tree.top > 1.5 && tree.top <= 2.0,
        "a two-block tree, top {}",
        tree.top
    );
    let (x0, y0, x1, y1) = tree.bounds;
    assert!(
        x0 >= -0.5 && y0 >= -0.5 && x1 <= 0.5 && y1 <= 0.5,
        "inside its own cell"
    );
}

/// The stamp is laid once on flat ground; on ground a block lower, the whole of it slides
/// further down the light by the reach of that block.
#[test]
fn a_stamp_on_lower_ground_slides_down_the_light_by_the_drop() {
    let light = ShadowProjection {
        dir_x: 1.0,
        dir_y: 0.0,
        stretch: 1.0,
        alpha: 1.0,
    };
    let metrics = BoxMetrics {
        tile_width: 100.0,
        box_height: 100.0 / 3.0,
    };
    let volume = ShadowVolume::new(
        0.25,
        vec![VolumeColumn {
            x: 0.0,
            y: 0.0,
            runs: [(0.0, 1.0), (0.0, 0.0)],
            len: 1,
        }],
    );
    let stamp = std::rc::Rc::new(volume_stamp(&volume, &light, metrics, 8));
    let caster = ShadowCaster {
        foot: (0.5, 0.5),
        elevation: 1.0,
        extent: SpriteExtent {
            left: 0.0,
            top: 0.0,
            width: 0.0,
            height: 0.0,
        },
        silhouette: 0,
        crop: None,
        cast: GroundCast::Volume(0),
    };
    let area = MapArea {
        min_x: -1,
        min_y: -1,
        max_x: 4,
        max_y: 2,
    };
    let bake = |level: f64| {
        let mut map = ShadowMap::new(area, 8);
        bake_ground_shadows(
            &mut map,
            &[caster],
            None,
            &light,
            metrics,
            &|_, _| Some(level),
            CasterShapes {
                silhouette_of: &|_| None,
                stamp_of: &|_| Some(stamp.clone()),
            },
        );
        // The far end of the shadow along the row through the foot.
        let row = ((0.5 + 1.0) * 8.0) as usize * map.width as usize;
        (0..map.width as usize)
            .rev()
            .find(|&x| map.alpha[row + x] > 128)
            .expect("some shadow on the row")
    };
    let drop = lift_reach(&light, 1.0, metrics.tile_width, metrics.box_height) * 8.0;
    let moved = bake(0.0) as f64 - bake(1.0) as f64;

    assert!(
        (moved - drop).abs() <= 1.0,
        "moved {moved} texels, the drop reaches {drop}"
    );
}
