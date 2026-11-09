use super::*;
use iso::assets::AssetManifest;

use crate::game::config::WORLD_SEED as SEED;

/// The shipped atlas, read as the client reads it, so these checks fail when a top is dropped
fn shipped() -> AssetManifest {
    serde_json::from_str(include_str!("../../content/assets.manifest.json"))
        .expect("the asset manifest is valid JSON")
}

/// The lookup the client gives `TerrainLook::new`, over a manifest instead of a GPU atlas.
fn artwork(manifest: &AssetManifest) -> impl Fn(&str) -> Option<(SpriteFrame, InkBox)> + '_ {
    move |source: &str| {
        let entry = manifest
            .entries
            .iter()
            .find(|entry| entry.source == source)?;
        Some((entry.primary_frame()?, entry.ink?))
    }
}

fn columns(side: i32) -> impl Iterator<Item = (i32, i32)> {
    (0..side).flat_map(move |x| (0..side).map(move |y| (x, y)))
}

/// Every top the content asks for is in the shipped atlas and was measured. Dressing the ground
#[test]
fn every_grass_top_is_in_the_shipped_atlas() {
    let manifest = shipped();
    let (look, missing) = TerrainLook::new(SEED, artwork(&manifest));
    assert!(missing.is_empty(), "the atlas is missing {missing:?}");
    let (_, looks) = look.grass_tops.as_ref().expect("the grass grows something");
    assert_eq!(looks.len(), GRASS_TOPS.len());
}

/// A top is a whole grass block with clutter painted on, so it occupies its cell exactly as the
#[test]
fn a_top_stands_in_its_cell_exactly_where_the_plain_block_does() {
    let manifest = shipped();
    let plain = artwork(&manifest)("/assets/grass/block.svg")
        .expect("the plain grass block")
        .1;
    for (source, _) in GRASS_TOPS {
        let ink = artwork(&manifest)(source)
            .unwrap_or_else(|| panic!("{source}"))
            .1;
        assert_eq!(
            ink, plain,
            "{source} is not drawn on the plain block's template"
        );
    }
}

/// The shares are content, and they have to leave most of the grass plain: dressing all of it
#[test]
fn the_tops_dress_about_a_third_of_the_grass() {
    let total: f64 = GRASS_TOPS.iter().map(|(_, chance)| chance).sum();
    assert!(
        (0.2..0.4).contains(&total),
        "{total} of the grass would be dressed"
    );
    assert!(
        GRASS_TOPS.iter().all(|(_, chance)| *chance > 0.0),
        "a top with no chance is a top that never shows; drop it instead"
    );
}

#[test]
fn only_the_grass_grows_anything() {
    let manifest = shipped();
    let (look, _) = TerrainLook::new(SEED, artwork(&manifest));
    assert!(columns(60).any(|(x, y)| look.top(TerrainMaterial::Grass, x, y).is_some()));
    for material in [
        TerrainMaterial::Water,
        TerrainMaterial::Sand,
        TerrainMaterial::Ground,
        TerrainMaterial::Path,
    ] {
        assert!(
            columns(60).all(|(x, y)| look.top(material, x, y).is_none()),
            "{material:?} grew something"
        );
    }
}

/// A missing top is left out and the rest take its share, rather than the ground showing a hole
#[test]
fn a_top_the_atlas_lacks_is_left_out_and_the_others_still_grow() {
    let manifest = shipped();
    let full = artwork(&manifest);
    let (look, missing) = TerrainLook::new(SEED, |source| {
        if source == GRASS_TOPS[0].0 {
            None
        } else {
            full(source)
        }
    });
    assert_eq!(missing, vec![GRASS_TOPS[0].0]);
    let (_, looks) = look.grass_tops.as_ref().expect("the rest still grow");
    assert_eq!(looks.len(), GRASS_TOPS.len() - 1);
    let dressed = columns(200).filter(|(x, y)| look.top(TerrainMaterial::Grass, *x, *y).is_some());
    let share = dressed.count() as f64 / 40_000.0;
    let asked: f64 = GRASS_TOPS.iter().skip(1).map(|(_, chance)| chance).sum();
    assert!(
        (share - asked).abs() < 0.05,
        "{share} dressed, {asked} asked for"
    );
}

/// With no artwork at all the ground is plain grass, not invisible: the picker is skipped.
#[test]
fn no_artwork_at_all_leaves_the_grass_plain() {
    let (look, missing) = TerrainLook::new(SEED, |_| None);
    assert_eq!(missing.len(), GRASS_TOPS.len());
    assert!(look.grass_tops.is_none());
    assert!(columns(40).all(|(x, y)| look.top(TerrainMaterial::Grass, x, y).is_none()));
    assert_ne!(look.tint(TerrainMaterial::Grass, 0, 0), WHITE);
}

/// The materials that have no zones are drawn as painted; the ones that do are never drawn
#[test]
fn only_the_land_materials_are_tinted_and_never_brightened() {
    let manifest = shipped();
    let (look, _) = TerrainLook::new(SEED, artwork(&manifest));
    for material in [TerrainMaterial::Water, TerrainMaterial::Sand] {
        assert!(
            columns(40).all(|(x, y)| look.tint(material, x, y) == WHITE),
            "{material:?} keeps its own colour"
        );
    }
    for material in [
        TerrainMaterial::Grass,
        TerrainMaterial::Ground,
        TerrainMaterial::Path,
    ] {
        let mut seen = Vec::new();
        for (x, y) in columns(80) {
            let tint = look.tint(material, x, y);
            assert_eq!(tint.a, 1.0, "a zone changes colour, not opacity");
            assert!(tint.r <= 1.0 && tint.g <= 1.0 && tint.b <= 1.0);
            if !seen.contains(&[tint.r, tint.g, tint.b]) {
                seen.push([tint.r, tint.g, tint.b]);
            }
        }
        assert!(
            seen.len() > 1,
            "{material:?} has zones but shows one colour"
        );
    }
}

/// A path is grass with earth trodden across it, so its grass edges have to take the colour of
#[test]
fn a_path_takes_the_colour_of_the_grass_it_crosses() {
    let manifest = shipped();
    let (look, _) = TerrainLook::new(SEED, artwork(&manifest));
    for (x, y) in columns(60) {
        assert_eq!(
            look.tint(TerrainMaterial::Path, x, y),
            look.tint(TerrainMaterial::Grass, x, y)
        );
    }
    assert!(
        columns(60).any(|(x, y)| look.tint(TerrainMaterial::Ground, x, y)
            != look.tint(TerrainMaterial::Grass, x, y))
    );
}

/// The grass palette has to read through the baked shadows and the day's light, so its ends are
#[test]
fn the_grass_zones_read_and_the_ground_zones_whisper() {
    let (_, grass) = GRASS_TINTS;
    let darkest = tint_channels(grass[0]);
    assert!(darkest.0 < 0.8, "the lush zone barely darkens: {darkest:?}");
    let driest = tint_channels(grass[grass.len() - 1]);
    assert!(driest.2 < 0.7, "the dry zone barely yellows: {driest:?}");
    assert!(
        grass.contains(&0xffffff),
        "one zone has to be the grass as painted"
    );
    let (_, ground) = LAND_TINTS;
    for color in ground {
        let (red, green, blue) = tint_channels(*color);
        assert!(
            red.min(green).min(blue) > 0.8,
            "{color:#08x} is not a whisper"
        );
    }
}

/// Both halves follow the world seed, so a world always looks the way it looked, and two worlds
#[test]
fn the_dressing_follows_the_world_seed() {
    let manifest = shipped();
    let (one, _) = TerrainLook::new(SEED, artwork(&manifest));
    let (same, _) = TerrainLook::new(SEED, artwork(&manifest));
    let (other, _) = TerrainLook::new(SEED + 1, artwork(&manifest));
    let read = |look: &TerrainLook| -> Vec<(f32, Option<u32>)> {
        columns(40)
            .map(|(x, y)| {
                (
                    look.tint(TerrainMaterial::Grass, x, y).g,
                    look.top(TerrainMaterial::Grass, x, y)
                        .map(|(frame, _)| frame.x),
                )
            })
            .collect()
    };
    assert_eq!(read(&one), read(&same));
    assert_ne!(read(&one), read(&other));
}
