//! Where the world's settlements stand, and which semantic zone owns each of their columns.

use std::collections::HashMap;
use std::f64::consts::TAU;

use super::catalog::{SettlementCatalog, ZoneProfile};
use crate::grid::WorldCoord;
use crate::terrain::{derive_seed, noise::lattice_at};

/// Label for the stream that decides which candidate site hosts a settlement.
const SITE_LABEL: &str = "settlements-site";
/// Label for the stream that jitters a settlement off its site, one axis each.
const JITTER_X_LABEL: &str = "settlements-jitter-x";
/// Label for the stream that jitters a settlement off its site, one axis each.
const JITTER_Y_LABEL: &str = "settlements-jitter-y";
/// Label for the stream that sizes a settlement.
const RADIUS_LABEL: &str = "settlements-radius";
/// Label prefix for the stream that lays one zone's seeds; the zone id completes it.
const ZONE_LABEL_PREFIX: &str = "settlements-zone";
/// Step between the lattice points one zone's seeds are read from, along each axis.
const SEED_STRIDE_X: i64 = 7_919;
/// Step between the lattice points one zone's seeds are read from, along each axis.
const SEED_STRIDE_Y: i64 = 104_729;

/// One Voronoi seed of a settlement: where it sits, how far its cell reaches, and whose it is.
#[derive(Clone, Copy, Debug, PartialEq)]
struct ZoneSeed {
    x: f64,
    y: f64,
    reach: f64,
    zone: usize,
}

/// One settlement of the world: its centre column, its radius in columns and the zone seeds
/// laid around it. Derived from the seed alone, so a chunk comes out the same whoever asks.
#[derive(Clone, Debug, PartialEq)]
pub struct Settlement {
    /// The column the settlement grew around.
    pub center: WorldCoord,
    /// How far its footprint reaches from `center`, in columns.
    pub radius: f64,
    seeds: Vec<ZoneSeed>,
}

impl Settlement {
    /// The index of the zone owning column `(x, y)`, or `None` when it lies outside the radius.
    ///
    /// Inside the footprint the owner is the seed with the smallest distance less its reach:
    /// an additively weighted Voronoi diagram, which bends the borders between zones into
    /// something organic instead of concentric rings.
    pub fn zone_at(&self, x: i32, y: i32) -> Option<usize> {
        let dx = f64::from(x - self.center.x);
        let dy = f64::from(y - self.center.y);
        if dx.hypot(dy) > self.radius {
            return None;
        }
        let mut best: Option<(f64, usize)> = None;
        for seed in &self.seeds {
            let distance = (f64::from(x) - seed.x).hypot(f64::from(y) - seed.y) - seed.reach;
            match best {
                Some((closest, _)) if closest <= distance => {}
                _ => best = Some((distance, seed.zone)),
            }
        }
        best.map(|(_, zone)| zone)
    }
}

/// The settlements of a world: the field that lays them down and the zones inside each one.
/// Shared, immutable and rebuilt from the seed, so a reopened save lays the same villages again.
#[derive(Clone, Debug)]
pub struct WorldSettlements {
    catalog: SettlementCatalog,
    site: u64,
    jitter_x: u64,
    jitter_y: u64,
    radius: u64,
    zone_streams: Vec<u64>,
}

impl WorldSettlements {
    /// Builds the settlement field for `catalog` in the world of `seed`.
    pub fn new(seed: u64, catalog: &SettlementCatalog) -> Self {
        let zone_streams = catalog
            .zones
            .iter()
            .map(|zone| derive_seed(seed, &format!("{ZONE_LABEL_PREFIX}:{}", zone.id)))
            .collect();
        Self {
            catalog: catalog.clone(),
            site: derive_seed(seed, SITE_LABEL),
            jitter_x: derive_seed(seed, JITTER_X_LABEL),
            jitter_y: derive_seed(seed, JITTER_Y_LABEL),
            radius: derive_seed(seed, RADIUS_LABEL),
            zone_streams,
        }
    }

    /// The content this field was built from.
    pub fn catalog(&self) -> &SettlementCatalog {
        &self.catalog
    }

    /// The settlement covering column `(x, y)`, or `None` out in the wild. The content keeps
    /// the sites farther apart than two radii, so at most one settlement ever covers a column.
    pub fn settlement_at(&self, x: i32, y: i32) -> Option<Settlement> {
        let spacing = self.catalog.spacing;
        let site_x = x.div_euclid(spacing);
        let site_y = y.div_euclid(spacing);
        for dy in -1..=1 {
            for dx in -1..=1 {
                let Some(settlement) = self.settlement_of_site(site_x + dx, site_y + dy) else {
                    continue;
                };
                let distance =
                    f64::from(x - settlement.center.x).hypot(f64::from(y - settlement.center.y));
                if distance <= settlement.radius {
                    return Some(settlement);
                }
            }
        }
        None
    }

    /// The index of the zone owning column `(x, y)`, or `None` out in the wild.
    pub fn zone_at(&self, x: i32, y: i32) -> Option<usize> {
        self.settlement_at(x, y)
            .and_then(|settlement| settlement.zone_at(x, y))
    }

    /// The id of the zone owning column `(x, y)`, or `None` out in the wild.
    pub fn zone_id_at(&self, x: i32, y: i32) -> Option<&str> {
        self.zone_at(x, y)
            .map(|zone| self.catalog.zones[zone].id.as_str())
    }

    /// The zone of every column of `coords`, in the same order. Resolves each candidate site
    /// once instead of once per column, which is what a chunk's placement pass wants: the
    /// answer is the one [`Self::zone_at`] gives, column by column.
    pub fn zones_over(&self, coords: &[WorldCoord]) -> Vec<Option<usize>> {
        let mut sites: HashMap<(i32, i32), Option<Settlement>> = HashMap::new();
        let spacing = self.catalog.spacing;
        let mut zones = Vec::with_capacity(coords.len());
        for coord in coords {
            let site_x = coord.x.div_euclid(spacing);
            let site_y = coord.y.div_euclid(spacing);
            let mut zone = None;
            'sites: for dy in -1..=1 {
                for dx in -1..=1 {
                    let key = (site_x + dx, site_y + dy);
                    let settlement = sites
                        .entry(key)
                        .or_insert_with(|| self.settlement_of_site(key.0, key.1));
                    let Some(settlement) = settlement else {
                        continue;
                    };
                    if let Some(found) = settlement.zone_at(coord.x, coord.y) {
                        zone = Some(found);
                        break 'sites;
                    }
                }
            }
            zones.push(zone);
        }
        zones
    }

    /// What grows on column `(x, y)`: its zone's profile, or the wilderness profile outside.
    pub fn profile_at(&self, x: i32, y: i32) -> &ZoneProfile {
        self.profile_of(self.zone_at(x, y))
    }

    /// What an already resolved zone grows; `None` is the wilderness outside every settlement.
    pub fn profile_of(&self, zone: Option<usize>) -> &ZoneProfile {
        match zone {
            Some(zone) => &self.catalog.zones[zone].profile,
            None => &self.catalog.wilderness,
        }
    }

    /// How thickly an already resolved zone grows its greenery; `0` plants none, and the
    /// wilderness outside every settlement grows none of its own (its woods are the biome's).
    pub fn greens_of(&self, zone: Option<usize>) -> f64 {
        match zone {
            Some(zone) => self.catalog.zones[zone].profile.greens,
            None => 0.0,
        }
    }

    /// The spacing the greenery of `zone` keeps at `distance` columns from the nearest
    /// building: tight where it hugs a wall, open out in the clearing, and a zone that grows
    /// more than the catalogue's share tightens both ends of that range.
    pub fn greens_spacing(&self, zone: Option<usize>, distance: f64) -> Option<f64> {
        let density = self.greens_of(zone);
        if density <= 0.0 {
            return None;
        }
        let rules = &self.catalog.greens;
        let reach = (rules.far - rules.near).max(f64::EPSILON);
        let share = ((distance - rules.near) / reach).clamp(0.0, 1.0);
        let spacing = rules.tight + (rules.spacing - rules.tight) * share;
        Some((spacing / density).max(1.0))
    }

    /// The settlement the candidate site `(site_x, site_y)` hosts, when it hosts one.
    fn settlement_of_site(&self, site_x: i32, site_y: i32) -> Option<Settlement> {
        let key_x = i64::from(site_x);
        let key_y = i64::from(site_y);
        if lattice_at(self.site, key_x, key_y) >= self.catalog.chance {
            return None;
        }
        let radius = self.catalog.radius_min
            + lattice_at(self.radius, key_x, key_y)
                * (self.catalog.radius_max - self.catalog.radius_min);
        let inset = self.catalog.radius_max.ceil() as i32;
        let span = (self.catalog.spacing - 2 * inset).max(1);
        let jitter =
            |stream: u64| (lattice_at(stream, key_x, key_y) * f64::from(span)).floor() as i32;
        let center = WorldCoord {
            x: site_x * self.catalog.spacing + inset + jitter(self.jitter_x),
            y: site_y * self.catalog.spacing + inset + jitter(self.jitter_y),
        };
        let mut seeds = Vec::new();
        for (zone, definition) in self.catalog.zones.iter().enumerate() {
            let stream = self.zone_streams[zone];
            let (near, far) = definition.ring;
            for index in 0..i64::from(definition.seeds) {
                let angle = TAU
                    * lattice_at(
                        stream,
                        i64::from(center.x) + index * SEED_STRIDE_X,
                        i64::from(center.y),
                    );
                let fraction = near
                    + (far - near)
                        * lattice_at(
                            stream,
                            i64::from(center.x),
                            i64::from(center.y) + index * SEED_STRIDE_Y,
                        );
                seeds.push(ZoneSeed {
                    x: f64::from(center.x) + angle.cos() * fraction * radius,
                    y: f64::from(center.y) + angle.sin() * fraction * radius,
                    reach: definition.pull * radius,
                    zone,
                });
            }
        }
        Some(Settlement {
            center,
            radius,
            seeds,
        })
    }
}

#[cfg(test)]
#[path = "field.test.rs"]
mod tests;
