//! Tests for the world's biome regions and their tree formations.

use super::*;
use crate::biomes::catalog::{BiomeCatalog, parse_biomes};

fn catalog() -> BiomeCatalog {
    let entities = crate::entities::EntityCatalog {
        schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
        entities: ["tree", "tree_2", "tree_3", "tree_4"]
            .into_iter()
            .map(|id| crate::entities::blueprint::EntityBlueprint {
                id: id.to_owned(),
                asset: crate::entities::blueprint::EntityAsset {
                    sprite: format!("/assets/{id}.svg"),
                    reflection: None,
                    color_replacements: None,
                    sway: None,
                    contact_shadow: None,
                },
                shape: crate::entities::blueprint::EntityShape {
                    height: 2,
                    length: 1,
                    axis: crate::entities::blueprint::EntityLengthAxis::X,
                    collision: vec![0.15],
                },
                placement: crate::entities::blueprint::EntityPlacement {
                    surfaces: vec![crate::terrain::TerrainMaterial::Grass],
                    road_access: false,
                },
            })
            .collect(),
    };
    parse_biomes(
        r#"{
            "schemaVersion": 1,
            "biomes": [
                { "id": "temperate_forest", "share": 50.0, "treeCoverage": 0.35,
                  "trees": [
                      { "blueprint": "tree", "weight": 60.0 },
                      { "blueprint": "tree_2", "weight": 40.0 }
                  ],
                  "grassTints": ["bfd5bd", "dde9d4"], "groundTints": ["fffbea", "ffffff"] },
                { "id": "taiga", "share": 50.0, "treeCoverage": 0.35,
                  "trees": [
                      { "blueprint": "tree_3", "weight": 100.0 }
                  ],
                  "grassTints": ["8fa884", "a9bda0"], "groundTints": ["8f8878", "a49d8d"] }
            ]
        }"#,
        &entities,
    )
    .expect("valid fixture")
}

#[test]
fn the_biome_field_is_deterministic_and_in_range() {
    let habitats = WorldBiomes::new(42, &catalog());
    for (x, y) in [(0, 0), (17, -9), (-300, 250), (1024, 1024)] {
        let index = habitats.biome_index(x, y);
        assert!(index < 2);
        assert_eq!(index, habitats.biome_index(x, y));
        assert!(matches!(
            habitats.biome(x, y).id.as_str(),
            "temperate_forest" | "taiga"
        ));
    }
}

#[test]
fn the_biome_shares_are_calibrated_on_the_sample_grid() {
    let habitats = WorldBiomes::new(42, &catalog());
    let mut counts = [0_usize; 2];
    for x in (0..475).step_by(5) {
        for y in (0..475).step_by(5) {
            counts[habitats.biome_index(x, y)] += 1;
        }
    }
    let total = (counts[0] + counts[1]) as f64;
    let temperate = counts[0] as f64 / total;
    assert!(
        (0.40..=0.60).contains(&temperate),
        "expected the calibration grid to split the shares, got {temperate:.2}"
    );
}

#[test]
fn formations_are_deterministic_and_pick_known_species() {
    let habitats = WorldBiomes::new(42, &catalog());
    let mut temperate_groves = 0;
    let mut temperate_none = 0;
    for x in (-64..64).step_by(2) {
        for y in (-64..64).step_by(2) {
            if habitats.biome_index(x, y) != 0 {
                continue;
            }
            match habitats.formation(x, y) {
                Some(species) => {
                    assert!(species < 2, "temperate has two species");
                    temperate_groves += 1;
                }
                None => temperate_none += 1,
            }
        }
    }
    assert!(temperate_groves > 0, "the temperate biome must grow groves");
    assert!(
        temperate_none > 0,
        "the temperate biome must have open ground"
    );
    let again = WorldBiomes::new(42, &catalog());
    for x in (-32..32).step_by(3) {
        for y in (-32..32).step_by(3) {
            assert_eq!(habitats.formation(x, y), again.formation(x, y));
        }
    }
}

#[test]
fn formations_cover_roughly_the_biome_tree_coverage() {
    let habitats = WorldBiomes::new(42, &catalog());
    let mut grown = 0;
    let mut open = 0;
    for x in (-128..128).step_by(2) {
        for y in (-128..128).step_by(2) {
            match habitats.formation(x, y) {
                Some(_) => grown += 1,
                None => open += 1,
            }
        }
    }
    let total = (grown + open) as f64;
    let covered = grown as f64 / total;
    assert!(
        covered > 0.05,
        "a third of the forest floor should be bosquet, got {covered:.2}"
    );
    assert!(
        covered < 0.7,
        "the forest floor should keep open clearings, got {covered:.2}"
    );
}
