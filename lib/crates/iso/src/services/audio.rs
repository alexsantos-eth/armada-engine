//! Audio playback contract. The core describes what to play; the client renders it.

use crate::terrain::TerrainMaterial;

/// A one-shot sound requested by the game or its interface.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SoundEvent {
    Jump,
    /// Double jump from the air: the same chirp, an octave up.
    AirJump,
    Land,
    Footstep,
    Climb,
    /// The player entered the skid.
    Skid,
    /// A blow of the gathering swing lands on what is being harvested.
    HarvestHit,
    /// The last blow: what was being harvested gives way.
    HarvestFell,
    /// A heap of items tossed out of something felled lands on the ground.
    ItemDrop,
    /// The player picks up a heap and it goes into the inventory.
    ItemCollect,
    /// The backpack button opened the inventory.
    InventoryOpen,
    /// The backpack button closed the inventory.
    InventoryClose,
    /// A rabbit lands a step of its stroll.
    RabbitHop,
    /// A crab sets a step down: a couple of clicks of its legs.
    CrabStep,
    /// A bird in the trees around sings one short phrase; the number picks one of
    /// [`BIRD_CALLS`] phrases.
    BirdCall(u8),
}

/// How many different bird phrases the client bundles.
pub const BIRD_CALLS: u8 = 3;

/// What the feet land on, for the footsteps: the terrain's surfaces grouped by how they sound.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Footing {
    Grass,
    Sand,
    /// Bare earth.
    Dirt,
    /// Paths and stairs.
    Stone,
}

impl Footing {
    /// How walking on `surface` sounds; `None` on water, where nobody walks.
    pub fn of(surface: TerrainMaterial) -> Option<Self> {
        match surface {
            TerrainMaterial::Grass => Some(Self::Grass),
            TerrainMaterial::Sand => Some(Self::Sand),
            TerrainMaterial::Ground => Some(Self::Dirt),
            TerrainMaterial::Path | TerrainMaterial::Stairs => Some(Self::Stone),
            TerrainMaterial::Water => None,
        }
    }
}

/// A looping sound the client keeps playing until asked to stop.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SoundLoop {
    /// Footsteps at a walk on the given footing.
    Walk(Footing),
    /// Footsteps at a run on the given footing.
    Run(Footing),
    Jetpack,
}

/// A bed of sound the world keeps under everything, each at its own volume: the client mixes
/// all of them at once, apart from the player's own loop.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum AmbientLoop {
    Wind,
    /// The steam of the geysers near by, swelling with each burst.
    Geyser,
}

/// Audio playback contract.
pub trait AudioService {
    /// Plays a one-shot sound.
    fn play(&mut self, event: SoundEvent);
    /// Plays a one-shot sound scaled to `volume` (0.0..=1.0) of its loudness.
    fn play_with_volume(&mut self, event: SoundEvent, volume: f64) {
        let _ = volume;
        self.play(event);
    }
    /// Plays `sound` in a loop instead of the current one, or stops looping when `None`.
    fn play_loop(&mut self, sound: Option<SoundLoop>) {
        let _ = sound;
    }
    /// Keeps `sound` playing at `volume` (0.0..=1.0), or silent at `0.0`.
    fn set_ambient(&mut self, sound: AmbientLoop, volume: f64) {
        let _ = (sound, volume);
    }
    /// Sets the master volume (0.0..=1.0).
    fn set_volume(&mut self, volume: f64);
}

#[cfg(test)]
#[path = "audio.test.rs"]
mod tests;
