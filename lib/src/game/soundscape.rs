//! The beds of the world, mixed once a frame from where the player stands: the wind of the
//! biome and the geysers on screen. Each bed eases to its level
//! (`iso::services::soundscape`), so sources coming into view swell in. The birds are not a bed:
//! now and then, minutes apart, one in the trees around sings a short phrase.
//!
//! The levels are pure and tested in `soundscape.test.rs`; `Game::update_soundscape` gathers
//! the sources and hands the levels to the audio service.

use iso::entities::EntityEffect;
use iso::projection::GridPoint;
use iso::services::soundscape::{
    BIRD_CALL_GAP_MS, BIRDS_PER_TREE, HEARING_FAR, bird_call_due, bird_level, combined, distance,
    distance_gain, ease_volume, geyser_level, wind_level,
};
use iso::services::{AmbientLoop, AudioService, BIRD_CALLS, SoundEvent};

use crate::effects::emitters::{EffectSpot, geyser_burst};
use crate::effects::fire::{FireSpot, spot_phase};
use crate::game::state::Game;

/// Where a spot is, as a point of the grid.
fn point_of(spot: &FireSpot) -> GridPoint {
    GridPoint {
        x: spot.x,
        y: spot.y,
    }
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

    /// Now and then a bird in the trees around sings one phrase, at the volume of the birdsong
    /// there: never within `BIRD_CALL_GAP_MS` of the last one, and rarer with fewer trees or
    /// less light. The trees are only looked for once the gap is over.
    fn maybe_call_a_bird(
        &mut self,
        listener: GridPoint,
        phase: iso::lighting::BakePhase,
        frame_ms: f64,
    ) {
        self.since_bird_call_ms += frame_ms.max(0.0);
        if self.since_bird_call_ms < BIRD_CALL_GAP_MS {
            return;
        }
        let trees = self.trees_in_hearing(listener);
        let level = birds_level(listener, &trees, bird_level(phase));
        if !bird_call_due(
            level,
            frame_ms,
            self.since_bird_call_ms,
            self.bird_random.roll(),
        ) {
            return;
        }
        self.since_bird_call_ms = 0.0;
        let phrase = (self.bird_random.roll() * f64::from(BIRD_CALLS)) as u8;
        self.audio
            .play_with_volume(SoundEvent::BirdCall(phrase.min(BIRD_CALLS - 1)), level);
    }

    /// Mixes the beds for this frame from the player's position and eases each one there over
    /// `frame_ms`. Runs after the effects are gathered, so it hears the geysers on screen.
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
        self.maybe_call_a_bird(listener, phase, frame_ms);
        let targets = [
            (AmbientLoop::Wind, wind_level(strength, self.wind_ms)),
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
