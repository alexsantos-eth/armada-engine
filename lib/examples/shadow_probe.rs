//! Dumps the ground shadow the engine bakes for one entity, phase by phase, as PNGs.
//!
//! It calls `iso::lighting::bake_ground_shadows` with the real atlas silhouette and the real
//! phase lights, so what comes out is the engine's own result and not a drawing of it.
//!
//!   cargo run --example shadow_probe -- <entity-id> [out_dir]

use iso::assets::{AssetManifest, InkBox};
use iso::lighting::{
    BakePhase, BoxMetrics, CasterShapes, GroundCast, MapArea, SHADOW_MAP_PIXELS_PER_TILE,
    ShadowCaster, ShadowMap, Silhouette, SpriteExtent, bake_ground_shadows,
};

const TILE_WIDTH: f64 = 64.0;
const CELL: (i32, i32) = (2, 2);

fn main() {
    let mut args = std::env::args().skip(1);
    let wanted = args.next().unwrap_or_else(|| "grove_x".to_owned());
    let out = args.next().unwrap_or_else(|| "/tmp".to_owned());

    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let manifest: AssetManifest = serde_json::from_str(
        &std::fs::read_to_string(root.join("content/json/assets.manifest.json")).expect("manifest"),
    )
    .expect("manifest parses");
    let entities: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("content/json/entities.json")).expect("entities"),
    )
    .expect("entities parse");
    let source = entities["entities"]
        .as_array()
        .expect("array")
        .iter()
        .find(|e| e["id"] == wanted.as_str())
        .unwrap_or_else(|| panic!("no entity {wanted}"))["asset"]["sprite"]
        .as_str()
        .expect("sprite")
        .to_owned();
    let shape = &entities["entities"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == wanted.as_str())
        .unwrap()["shape"];
    let cells = shape["length"].as_i64().unwrap_or(1) as i32;
    let along_y = shape["axis"].as_str() == Some("y");

    let entry = manifest
        .entries
        .iter()
        .find(|e| e.source == source)
        .unwrap_or_else(|| panic!("no manifest entry for {source}"));
    let frame = entry.primary_frame().expect("frame");
    let ink = entry.ink.expect("ink");

    let atlas = image::open(root.join("content/images/atlas.png"))
        .expect("atlas")
        .to_rgba8();
    let (aw, ah) = atlas.dimensions();
    let alpha: Vec<u8> = atlas.pixels().map(|p| p.0[3]).collect();
    let silhouette = Silhouette {
        alpha: &alpha,
        stride: aw,
        rows: ah,
        left: f64::from(frame.x),
        top: f64::from(frame.y),
        right: f64::from(frame.x + frame.width),
        bottom: f64::from(frame.y + frame.height),
    };

    let area = MapArea::around(CELL.0 - 4, CELL.1 - 4, CELL.0 + 5, CELL.1 + 5);
    let metrics = BoxMetrics {
        tile_width: TILE_WIDTH,
        box_height: TILE_WIDTH * 341.0 / 1024.0,
    };
    let whole = std::env::args().any(|a| a == "--whole");
    let extent = extent_of(ink, TILE_WIDTH);
    let (half, quarter) = (TILE_WIDTH / 2.0, TILE_WIDTH / 4.0);
    let step = if along_y {
        (-half, -quarter)
    } else {
        (half, -quarter)
    };
    let casters: Vec<ShadowCaster> = if whole {
        vec![ShadowCaster {
            foot: (f64::from(CELL.0) + 0.5, f64::from(CELL.1) + 0.5),
            elevation: 0.0,
            extent,
            silhouette: 0,
            crop: None,
            cast: GroundCast::Silhouette,
        }]
    } else {
        (0..cells.max(1))
            .map(|index| {
                let at = f64::from(index);
                let (cx, cy) = if along_y {
                    (CELL.0, CELL.1 + index)
                } else {
                    (CELL.0 + index, CELL.1)
                };
                ShadowCaster {
                    foot: (f64::from(cx) + 0.5, f64::from(cy) + 0.5),
                    elevation: 0.0,
                    extent: SpriteExtent {
                        left: extent.left - at * step.0,
                        top: extent.top - at * step.1,
                        ..extent
                    },
                    silhouette: 0,
                    crop: band_of(index, cells, step.0),
                    cast: GroundCast::Silhouette,
                }
            })
            .collect()
    };

    for phase in [
        BakePhase::Dawn,
        BakePhase::Day,
        BakePhase::Sunset,
        BakePhase::Night,
    ] {
        let mut map = ShadowMap::new(area, SHADOW_MAP_PIXELS_PER_TILE);
        bake_ground_shadows(
            &mut map,
            &casters,
            None,
            &phase.light().shadow,
            metrics,
            &|_, _| Some(0.0),
            CasterShapes {
                silhouette_of: &|_| Some(silhouette),
                stamp_of: &|_| None,
            },
        );
        let tag = if whole { "whole" } else { "cells" };
        let path = format!("{out}/shadow_{wanted}_{tag}_{}.png", phase.label());
        write_png(&map, cells, along_y, &path);
        println!("{} -> {path}", phase.label());
    }
}

/// The band of the artwork the `index`-th cell owns, mirroring the client's own split.
fn band_of(index: i32, cells: i32, step_x: f64) -> Option<(f64, f64)> {
    if cells <= 1 || step_x == 0.0 {
        return None;
    }
    let (from, to) = if step_x > 0.0 {
        (0.0, step_x)
    } else {
        (step_x, 0.0)
    };
    Some((
        if index == 0 { f64::NEG_INFINITY } else { from },
        if index == cells - 1 {
            f64::INFINITY
        } else {
            to
        },
    ))
}

/// Where the artwork sits around its ground point, the same way `ink_layout` places it.
fn extent_of(ink: InkBox, tile_width: f64) -> SpriteExtent {
    SpriteExtent {
        left: ink.x * tile_width,
        top: ink.y * tile_width,
        width: ink.width * tile_width,
        height: ink.height * tile_width,
    }
}

/// The map as a picture: shadow in dark over the tile grid, the footprint cells outlined.
fn write_png(map: &ShadowMap, cells: i32, along_y: bool, path: &str) {
    let per = SHADOW_MAP_PIXELS_PER_TILE;
    let mut img = image::RgbImage::new(map.width, map.height);
    for y in 0..map.height {
        for x in 0..map.width {
            let shade = f64::from(map.alpha[(y * map.width + x) as usize]) / 255.0;
            let grid = x % per == 0 || y % per == 0;
            let base: [f64; 3] = if grid {
                [150.0, 170.0, 130.0]
            } else {
                [196.0, 216.0, 170.0]
            };
            let px = base.map(|c| (c * (1.0 - 0.72 * shade)).round() as u8);
            img.put_pixel(x, y, image::Rgb(px));
        }
    }
    for index in 0..cells {
        let (cx, cy) = if along_y {
            (CELL.0, CELL.1 + index)
        } else {
            (CELL.0 + index, CELL.1)
        };
        if let Some((ox, oy)) = map.area.square_of(cx, cy, per) {
            for t in 0..per {
                for (x, y) in [
                    (ox + t, oy),
                    (ox + t, oy + per - 1),
                    (ox, oy + t),
                    (ox + per - 1, oy + t),
                ] {
                    if x < map.width && y < map.height {
                        img.put_pixel(x, y, image::Rgb([230, 120, 40]));
                    }
                }
            }
        }
    }
    img.save(path).expect("write png");
}
