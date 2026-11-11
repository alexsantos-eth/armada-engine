//! Game configuration for the demo scene: the world seed, tile metrics, layering and streaming knobs.
//!
//! These are data, not behaviour: the world, the projection and the sprite collection read them, and the
//! composition in `main.rs` picks the values.

use iso::assets::{SVG_BLOCK_HEIGHT, SVG_TILE_WIDTH};
use iso::grid::WorldCoord;
use iso::world::ChunkRadii;

/// The game's display name: window title, the `.app` bundle name and the per-user support
/// directory on macOS. This is the single place to change to rename the game everywhere.
pub const GAME_TITLE: &str = "Yorch Adventure";
/// Diagnostic centre of the world; the player spawns near here.
pub const PREVIEW_CENTRE: WorldCoord = WorldCoord { x: -120, y: -72 };
/// The scene's zoom: how wide one tile is drawn, in screen pixels.
pub const PREVIEW_TILE_WIDTH: f64 = 280.0;
/// How tall one tile is drawn, in screen pixels.
pub const PREVIEW_TILE_HEIGHT: f64 = PREVIEW_TILE_WIDTH / 2.0;
/// One level of elevation, in screen pixels.
pub const PREVIEW_ELEVATION_STEP: f64 = PREVIEW_TILE_WIDTH * SVG_BLOCK_HEIGHT / SVG_TILE_WIDTH;
/// How much of the reference tile a coarse-pointer platform draws: the scene pulled back a
/// little, so a small touch screen shows more of the world.
pub const MOBILE_ZOOM: f64 = 0.7;
/// Most simulation milliseconds a single frame may advance the fixed step. One tick's worth:
/// the game slows down after a hitch (GC, GPU stall, chunk bake) instead of teleporting the
/// player forward several ticks in one frame, which is what the eye catches as a jolt.
pub(crate) const MAX_FRAME_MS: f64 = iso::simulation::STEP_MS;

/// One scene's tile metrics, in screen pixels: the tile, and one level of elevation.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SceneMetrics {
    pub tile_width: f64,
    pub tile_height: f64,
    pub elevation_step: f64,
}

impl SceneMetrics {
    /// The reference metrics a fine-pointer platform draws at.
    pub const REFERENCE: Self = Self {
        tile_width: PREVIEW_TILE_WIDTH,
        tile_height: PREVIEW_TILE_HEIGHT,
        elevation_step: PREVIEW_ELEVATION_STEP,
    };

    /// The metrics for `coarse`: the reference on desktop, zoomed out a little on touch-first
    /// platforms.
    pub fn for_pointer(coarse: bool) -> Self {
        if !coarse {
            return Self::REFERENCE;
        }
        let tile_width = PREVIEW_TILE_WIDTH * MOBILE_ZOOM;
        Self {
            tile_width,
            tile_height: tile_width / 2.0,
            elevation_step: tile_width * SVG_BLOCK_HEIGHT / SVG_TILE_WIDTH,
        }
    }
}

/// How far each band of a multi-cell sprite reaches past its cut, in screen pixels.
pub const BAND_BLEED: f64 = 0.5;

/// Entities draw above the terrain of the same depth, and the player either side of them.
pub const ENTITY_LAYER: i32 = 3;
/// The player on the half of its column furthest from the camera.
pub const PLAYER_BEHIND_LAYER: i32 = 2;
/// The player on the half of its column nearest the camera.
pub const PLAYER_FRONT_LAYER: i32 = 4;
/// How big the player is drawn, as a fraction of the size its artwork was drawn at.
pub const PLAYER_SCALE: f64 = 0.75;
/// Source path of the player's still figure in the asset manifest, drawn if a sheet is missing.
pub const PLAYER_SPRITE: &str = "/assets/player/block.svg";
/// The player's sheets of poses, in the manifest: walking, standing, jumping and climbing.
pub const PLAYER_WALK_SHEET: &str = "/assets/player-16/walk.svg";
pub const PLAYER_IDLE_SHEET: &str = "/assets/player-16/idle.svg";
pub const PLAYER_JUMP_SHEET: &str = "/assets/player-16/jump.svg";
pub const PLAYER_CLIMB_SHEET: &str = "/assets/player-16/climb.svg";
/// Extra view the chunk cull keeps around the screen, as a fraction of it.
pub const CHUNK_CULL_MARGIN: f64 = 0.0;

/// How far this client streams chunks, below the shared defaults (1 / 2 / 3).
pub const CHUNK_RADII: ChunkRadii = ChunkRadii {
    load: 1,
    prefetch: 1,
    keep: 2,
};
/// Finite bounds for the exponential follow of an unbounded world: wide enough that the clamp
/// never engages, narrow enough to stay in range everywhere. The zoom window mirrors the
/// demo's working range.
pub(crate) const UNBOUNDED_CAMERA_LIMITS: iso::camera::CameraLimits = iso::camera::CameraLimits {
    min_zoom: 0.5,
    max_zoom: 4.0,
    bounds: iso::camera::CameraBounds {
        min_x: -1.0e17,
        min_y: -1.0e17,
        max_x: 1.0e17,
        max_y: 1.0e17,
    },
};

/// Safety-net interval for the periodic save; the real save happens on quit and on request.
pub const AUTOSAVE_SECONDS: f64 = 120.0;

/// The seed the world generates from; the domain default and the tests pin the same value.
pub const WORLD_SEED: u64 = iso::terrain::WORLD_SEED;
/// Seconds a phase change takes end to end: the presentation grade crossfades and each chunk
/// re-baked for the new phase eases its shadows in, both over this one value.
pub const PHASE_TRANSITION_SECONDS: f32 = 0.6;

#[cfg(test)]
#[path = "config.test.rs"]
mod tests;
