//! The beds of the world, mixed once a frame from where the player stands: the wind of the
//! biome, the birds in the trees around, the fires and the geysers on screen. Each bed eases to
//! its level (`iso::services::soundscape`), so sources coming into view swell in.
//!
//! The levels are pure and tested in `soundscape.test.rs`; `Game::update_soundscape` gathers
//! the sources and hands the levels to the audio service.

use iso::entities::EntityEffect;
use iso::projection::GridPoint;
use iso::services::soundscape::{
    BIRDS_PER_TREE, HEARING_FAR, bird_level, combined, distance, distance_gain, ease_volume,
    geyser_level, wind_level,
};
use iso::services::{AmbientLoop, AudioService};

use crate::effects::emitters::{EffectSpot, geyser_burst};
use crate::effects::fire::{FireSpot, spot_phase};
use crate::game::state::Game;

/// How loud a fire of each kind crackles at its full volume: a campfire (`None`) or a brazier
/// roars, a torch crackles, a lantern or candles barely hiss. `None` for an effect that is not
/// a fire.
pub(crate) fn fire_weight(effect: Option<EntityEffect>) -> Option<f64> {
    match effect {
        None => Some(1.0),
        Some(EntityEffect::Brazier) => Some(0.9),
        Some(EntityEffect::Torch) => Some(0.6),
        Some(EntityEffect::Lantern) => Some(0.3),
        Some(EntityEffect::Candles) => Some(0.25),
        Some(EntityEffect::Flies | EntityEffect::Geyser | EntityEffect::Leaves) => None,
    }
}

/// Where a spot is, as a point of the grid.
fn point_of(spot: &FireSpot) -> GridPoint {
    GridPoint {
        x: spot.x,
        y: spot.y,
    }
}

/// The crackle of the campfires in `fires` and the burning effects in `effects`, heard from
/// `listener`.
pub(crate) fn fire_level(listener: GridPoint, fires: &[FireSpot], effects: &[EffectSpot]) -> f64 {
    let campfires = fires.iter().map(|spot| (None, spot));
    let lit = effects.iter().map(|spot| (Some(spot.kind), &spot.at));
    combined(campfires.chain(lit).filter_map(|(effect, spot)| {
        let weight = fire_weight(effect)?;
        Some(weight * distance_gain(distance(point_of(spot), listener)))
    }))
}

/// The steam of the geysers in `effects`, heard from `listener` at `time_ms` of the wind clock
/// the jets are drawn by, so the sound swells with the burst on screen.
pub(crate) fn geyser_level_at(listener: GridPoint, effects: &[EffectSpot], time_ms: f64) -> f64 {
    combined(
        effects
            .iter()
            .filter(|spot| spot.kind == EntityEffect::Geyser)
            .map(|spot| {
                let gain = distance_gain(distance(point_of(&spot.at), listener));
                geyser_level(gain, geyser_burst(time_ms, spot_phase(&spot.at)))
            }),
    )
}

/// The birdsong of trees at `trees` (cell centres), heard from `listener`, scaled by how much
/// birds sing in this phase (`phase_level`, from `bird_level`).
pub(crate) fn birds_level(listener: GridPoint, trees: &[GridPoint], phase_level: f64) -> f64 {
    phase_level
        * combined(
            trees
                .iter()
                .map(|tree| BIRDS_PER_TREE * distance_gain(distance(*tree, listener))),
        )
}

impl Game {
    /// The trees within hearing of the player: entities gathered with an axe, by their cell
    /// centres, from the chunks around.
    fn trees_in_hearing(&self, listener: GridPoint) -> Vec<GridPoint> {
        let centre = iso::grid::to_chunk_coord(iso::player::physics::get_player_column(listener));
        let reach = (HEARING_FAR / f64::from(iso::grid::CHUNK_SIZE)).ceil() as i32;
        let mut trees = Vec::new();
        for dx in -reach..=reach {
            for dy in -reach..=reach {
                let coord = iso::grid::ChunkCoord {
                    cx: centre.cx + dx,
                    cy: centre.cy + dy,
                };
                let Some(entities) = self.manager.entities_chunk(coord) else {
                    continue;
                };
                for entity in entities {
                    let axe = self
                        .items
                        .harvest_rule(entity.type_())
                        .is_some_and(|rule| rule.tool == Some(iso::items::ToolKind::Axe));
                    let at = GridPoint {
                        x: f64::from(entity.x()) + 0.5,
                        y: f64::from(entity.y()) + 0.5,
                    };
                    if axe && distance(at, listener) < HEARING_FAR {
                        trees.push(at);
                    }
                }
            }
        }
        trees
    }

    /// Mixes the beds for this frame from the player's position and eases each one there over
    /// `frame_ms`. Runs after the fires are gathered, so it hears what is on screen.
    pub(crate) fn update_soundscape(&mut self, frame_ms: f64) {
        let listener = GridPoint {
            x: self.player.x,
            y: self.player.y,
        };
        let phase = self
            .phase_override
            .unwrap_or_else(|| iso::lighting::phase_at(self.clock.tick));
        let cell = iso::player::physics::get_player_column(listener);
        let strength = self
            .manager
            .biomes()
            .map_or(iso::wind::DEFAULT_WIND_STRENGTH, |world| {
                world.biome(cell.x, cell.y).wind_strength
            });
        let trees = self.trees_in_hearing(listener);
        let targets = [
            (AmbientLoop::Wind, wind_level(strength, self.wind_ms)),
            (
                AmbientLoop::Birds,
                birds_level(listener, &trees, bird_level(phase)),
            ),
            (
                AmbientLoop::Fire,
                fire_level(listener, &self.fire_spots, &self.effect_spots),
            ),
            (
                AmbientLoop::Geyser,
                geyser_level_at(listener, &self.effect_spots, self.wind_ms),
            ),
        ];
        for (bed, target) in targets {
            let level = ease_volume(self.audio.ambient_level(bed), target, frame_ms);
            self.audio.set_ambient(bed, level);
        }
    }
}

#[cfg(test)]
#[path = "soundscape.test.rs"]
mod tests;
