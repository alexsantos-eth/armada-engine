//! The world's biome regions: one broad field calibrated to the catalogue's shares, and one
//! clumped picker per biome that grows its groves.

use super::catalog::{Biome, BiomeCatalog};
use crate::terrain::appearance::{NoiseField, VariantPicker, quantile, sorted_samples};

/// Width of a biome region in world columns; blobs span several chunks, so a region is visible
/// from inside it.
pub const BIOME_FIELD_SCALE: f64 = 200.0;

/// Labels for the seeded streams of each biome; changing one reshuffles that biome's groves.
const FORMATION_LABEL_PREFIX: &str = "biomes-formations";
/// Label for the field that lays the biomes down; changing it repaints the whole world.
const FIELD_LABEL: &str = "biomes-field";

/// Which biome covers a column: one broad field, cut into as many shares as the catalogue declares.
#[derive(Clone, Debug)]
pub struct BiomeField {
    field: NoiseField,
    /// The cumulative share at which one biome hands over to the next, ascending.
    thresholds: Vec<f64>,
}

impl BiomeField {
    /// Builds the field for `biomes`, calibrating the cuts so the shares hold on average.
    pub fn new(seed: u64, biomes: &[Biome]) -> Self {
        let total: f64 = biomes.iter().map(|biome| biome.share).sum();
        let field = NoiseField::new(seed, FIELD_LABEL, BIOME_FIELD_SCALE, 0.0);
        let samples = sorted_samples(&field);
        let mut cumulative = 0.0;
        let thresholds = biomes
            .iter()
            .take(biomes.len().saturating_sub(1))
            .map(|biome| {
                cumulative += biome.share / total;
                quantile(&samples, cumulative)
            })
            .collect();
        Self { field, thresholds }
    }

    /// The index into the catalogue of the biome covering column `(x, y)`.
    pub fn at(&self, x: i32, y: i32) -> usize {
        let value = self.field.sample(x, y);
        self.thresholds
            .iter()
            .position(|threshold| value < *threshold)
            .unwrap_or(self.thresholds.len())
    }
}

/// The biomes of a world: where each one is, and what its groves grow in it. Shared, immutable
/// and rebuilt from the seed, so a reopened save paints the same regions again.
#[derive(Clone, Debug)]
pub struct WorldBiomes {
    biomes: Vec<Biome>,
    field: BiomeField,
    formations: Vec<Option<VariantPicker>>,
}

impl WorldBiomes {
    /// Builds the regions and groves for `catalog` in the world of `seed`.
    pub fn new(seed: u64, catalog: &BiomeCatalog) -> Self {
        let field = BiomeField::new(seed, &catalog.biomes);
        let formations = catalog
            .biomes
            .iter()
            .map(|biome| {
                let total: f64 = biome.trees.iter().map(|tree| tree.weight).sum();
                if total <= 0.0 {
                    return None;
                }
                let chances: Vec<f64> = biome
                    .trees
                    .iter()
                    .map(|tree| biome.tree_coverage * tree.weight / total)
                    .collect();
                VariantPicker::new(
                    seed,
                    &format!("{FORMATION_LABEL_PREFIX}:{}", biome.id),
                    &chances,
                )
            })
            .collect();
        Self {
            biomes: catalog.biomes.clone(),
            field,
            formations,
        }
    }

    /// The biome covering column `(x, y)`.
    pub fn biome(&self, x: i32, y: i32) -> &Biome {
        &self.biomes[self.biome_index(x, y)]
    }

    /// The biomes of the catalogue, in catalogue order; tint slot sets are indexed the same.
    pub fn biomes(&self) -> &[Biome] {
        &self.biomes
    }

    /// The index into the catalogue of the biome covering column `(x, y)`.
    pub fn biome_index(&self, x: i32, y: i32) -> usize {
        self.field.at(x, y)
    }

    /// The species index the column's biome grows there, or `None` for open ground.
    pub fn formation(&self, x: i32, y: i32) -> Option<usize> {
        self.formations[self.biome_index(x, y)]
            .as_ref()
            .and_then(|picker| picker.pick(x, y))
    }

    /// Every `(biome index, species index)` pair naming `blueprint` as an eligible species.
    pub fn species_of(&self, blueprint: &str) -> Vec<(usize, usize)> {
        self.biomes
            .iter()
            .enumerate()
            .filter_map(|(biome_index, biome)| {
                biome
                    .trees
                    .iter()
                    .position(|tree| tree.blueprint == blueprint)
                    .map(|species| (biome_index, species))
            })
            .collect()
    }
}

#[cfg(test)]
#[path = "field.test.rs"]
mod tests;
