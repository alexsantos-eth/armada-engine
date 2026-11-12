use super::*;
use iso::assets::AssetManifest;

use crate::game::config::WORLD_SEED as SEED;

/// The shipped atlas, read as the client reads it, so these checks fail when a top is dropped
fn shipped() -> AssetManifest {
    serde_json::from_str(include_str!("../../content/json/assets.manifest.json"))
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
    let (look, missing) = TerrainLook::new(SEED, artwork(&manifest), None);
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
    let (look, _) = TerrainLook::new(SEED, artwork(&manifest), None);
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
    let (look, missing) = TerrainLook::new(
        SEED,
        |source| {
            if source == GRASS_TOPS[0].0 {
                None
            } else {
                full(source)
            }
        },
        None,
    );
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
    let (look, missing) = TerrainLook::new(SEED, |_| None, None);
    assert_eq!(missing.len(), GRASS_TOPS.len());
    assert!(look.grass_tops.is_none());
    assert!(columns(40).all(|(x, y)| look.top(TerrainMaterial::Grass, x, y).is_none()));
    assert_ne!(look.tint(TerrainMaterial::Grass, 0, 0), WHITE);
}

/// The materials that have no zones are drawn as painted; the ones that do are never drawn
#[test]
fn only_the_land_materials_are_tinted_and_never_brightened() {
    let manifest = shipped();
    let (look, _) = TerrainLook::new(SEED, artwork(&manifest), None);
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
    let (look, _) = TerrainLook::new(SEED, artwork(&manifest), None);
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
    let (one, _) = TerrainLook::new(SEED, artwork(&manifest), None);
    let (same, _) = TerrainLook::new(SEED, artwork(&manifest), None);
    let (other, _) = TerrainLook::new(SEED + 1, artwork(&manifest), None);
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

/// The shipped biomes content, read and cross-validated the way the client does it.
fn shipped_biomes() -> iso::biomes::WorldBiomes {
    let entities: iso::entities::EntityCatalog =
        serde_json::from_str(include_str!("../../content/json/entities.json"))
            .expect("the entity catalog is valid JSON");
    let catalog =
        iso::biomes::parse_biomes(include_str!("../../content/json/biomes.json"), &entities)
            .expect("the biomes content validates");
    iso::biomes::WorldBiomes::new(SEED, &catalog)
}

/// The shipped biomes content names only blueprints the shipped entity catalog has.
#[test]
fn the_shipped_biomes_validate_against_the_entity_catalog() {
    let biomes = shipped_biomes();
    assert_eq!(biomes.biomes().len(), 4);
    let mut ids: Vec<&str> = biomes
        .biomes()
        .iter()
        .map(|biome| biome.id.as_str())
        .collect();
    ids.sort_unstable();
    assert_eq!(
        ids,
        ["autumn_forest", "savanna", "taiga", "temperate_forest"]
    );
}

/// Every land biome paints its own grass over at least one column, and no two biomes agree on
#[test]
fn each_shipped_biome_paints_the_grass_differently_somewhere() {
    let manifest = shipped();
    let biomes = shipped_biomes();
    let (look, _) = TerrainLook::new(SEED, artwork(&manifest), Some(&biomes));
    let mut seen: Vec<std::collections::HashSet<(u32, u32, u32)>> = (0..biomes.biomes().len())
        .map(|_| std::collections::HashSet::new())
        .collect();
    for x in (0..400).step_by(3) {
        for y in (0..400).step_by(3) {
            let index = biomes.biome_index(x, y);
            let tint = look.tint(TerrainMaterial::Grass, x, y);
            seen[index].insert((tint.r.to_bits(), tint.g.to_bits(), tint.b.to_bits()));
        }
    }
    for (index, colours) in seen.iter().enumerate() {
        assert!(
            !colours.is_empty(),
            "biome {} covers no column in the sampled range",
            biomes.biomes()[index].id
        );
    }
    for first in 0..seen.len() {
        for second in (first + 1)..seen.len() {
            assert!(
                seen[first] != seen[second],
                "biomes {} and {} paint the same grass everywhere sampled",
                biomes.biomes()[first].id,
                biomes.biomes()[second].id
            );
        }
    }
}

/// A path keeps the colours of the grass it crosses, in every biome, not just globally.
#[test]
fn a_path_takes_the_colour_of_the_grass_in_every_biome() {
    let manifest = shipped();
    let biomes = shipped_biomes();
    let (look, _) = TerrainLook::new(SEED, artwork(&manifest), Some(&biomes));
    for (x, y) in columns(120) {
        assert_eq!(
            look.tint(TerrainMaterial::Path, x, y),
            look.tint(TerrainMaterial::Grass, x, y)
        );
    }
}

/// The biomes of a world follow the world seed: same seed, same regions; another seed, another.
#[test]
fn the_biome_regions_follow_the_world_seed() {
    let one = shipped_biomes();
    let entities: iso::entities::EntityCatalog =
        serde_json::from_str(include_str!("../../content/json/entities.json"))
            .expect("the entity catalog is valid JSON");
    let catalog =
        iso::biomes::parse_biomes(include_str!("../../content/json/biomes.json"), &entities)
            .expect("the biomes content validates");
    let other = iso::biomes::WorldBiomes::new(SEED + 1, &catalog);
    let same: Vec<_> = [(0, 0), (17, -9), (-300, 250), (1024, 1024)]
        .into_iter()
        .map(|(x, y)| one.biome_index(x, y))
        .collect();
    let again: Vec<_> = [(0, 0), (17, -9), (-300, 250), (1024, 1024)]
        .into_iter()
        .map(|(x, y)| one.biome_index(x, y))
        .collect();
    assert_eq!(same, again);
    let different: Vec<_> = [(0, 0), (17, -9), (-300, 250), (1024, 1024)]
        .into_iter()
        .map(|(x, y)| other.biome_index(x, y))
        .collect();
    assert_ne!(same, different);
}

/// The maker writes over one cell at a time; every other cell keeps the answer of the noise.
#[test]
fn a_cell_dressed_by_hand_keeps_its_chosen_tint() {
    let manifest = shipped();
    let (mut look, _) = TerrainLook::new(SEED, artwork(&manifest), None);
    let zones = look.tint_zones(TerrainMaterial::Grass, 0, 0);
    assert!(zones > 1, "the grass palette has more than one zone");
    let before = look.tint(TerrainMaterial::Grass, 0, 0);
    let neighbour = look.tint(TerrainMaterial::Grass, 1, 0);
    look.dressing_mut()
        .set_tint(iso::grid::WorldCoord { x: 0, y: 0 }, Some(zones - 1));
    let after = look.tint(TerrainMaterial::Grass, 0, 0);
    assert_ne!(
        (before.r, before.g, before.b),
        (after.r, after.g, after.b),
        "the chosen zone is the last of the palette, the noise's was not"
    );
    assert_eq!(
        (neighbour.r, neighbour.g, neighbour.b),
        {
            let now = look.tint(TerrainMaterial::Grass, 1, 0);
            (now.r, now.g, now.b)
        },
        "the neighbour still follows the noise"
    );
}

#[test]
fn a_chosen_tint_zone_past_the_palette_clamps_instead_of_panicking() {
    let manifest = shipped();
    let (mut look, _) = TerrainLook::new(SEED, artwork(&manifest), None);
    look.dressing_mut()
        .set_tint(iso::grid::WorldCoord { x: 2, y: 2 }, Some(99));
    let _ = look.tint(TerrainMaterial::Grass, 2, 2);
}

#[test]
fn a_cell_dressed_by_hand_grows_the_chosen_top_or_stays_plain() {
    let manifest = shipped();
    let (mut look, _) = TerrainLook::new(SEED, artwork(&manifest), None);
    let tops = look.top_count();
    assert_eq!(tops, GRASS_TOPS.len());
    let grown = columns(64)
        .find(|(x, y)| look.top(TerrainMaterial::Grass, *x, *y).is_some())
        .expect("the noise grows something somewhere");
    look.dressing_mut().set_top(
        iso::grid::WorldCoord {
            x: grown.0,
            y: grown.1,
        },
        Some(None),
    );
    assert_eq!(look.top(TerrainMaterial::Grass, grown.0, grown.1), None);
    look.dressing_mut()
        .set_top(iso::grid::WorldCoord { x: 0, y: 0 }, Some(Some(tops - 1)));
    let chosen = look
        .top(TerrainMaterial::Grass, 0, 0)
        .expect("the chosen top grows");
    let last = artwork(&manifest)(GRASS_TOPS[tops - 1].0).expect("the last top is in the atlas");
    assert_eq!(chosen, last);
}

#[test]
fn a_dressed_cell_grows_nothing_on_a_material_that_grows_nothing() {
    let manifest = shipped();
    let (mut look, _) = TerrainLook::new(SEED, artwork(&manifest), None);
    look.dressing_mut()
        .set_top(iso::grid::WorldCoord { x: 0, y: 0 }, Some(Some(0)));
    assert_eq!(look.top(TerrainMaterial::Sand, 0, 0), None);
    assert_eq!(look.tint_zones(TerrainMaterial::Water, 0, 0), 0);
}
