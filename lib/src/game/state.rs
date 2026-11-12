//! The game's state and its boot: world, player, camera, artwork and saves.
//!
//! `Game::new` composes everything the frame needs and nothing else; the frame itself is
//! `game::frame` (update) and `game::scene` (view), driven by `loops`.
//!
//! No test boots the game: `Game::new` depends on textures and audio devices. The pure rule it
//! owns (`client_path`) is tested in `state.test.rs`; the boot path is checked manually with
//! `scripts/run-native.sh` by the FILE_STRUCTURE exception for GPU/IO-bound code.

use iso::assets::{AssetManifest, validate_manifest};
use iso::camera::{Camera, CameraFocus};
use iso::entities::{EntityCatalog, validate_catalog};
use iso::grid::to_chunk_coord;
use iso::lighting::phase_at;
use iso::player::physics::{create_player, find_player_spawn, get_player_render_position};
use iso::simulation::FixedStepper;
use iso::terrain::{TerrainConfig, TerrainGenerator};
use iso::time::WorldClock;
use iso::world::{ChunkArchive, ChunkManager};
use macroquad::prelude::*;

use crate::assets::sprites::{SpriteAtlas, SpriteDraw};
use crate::effects::ambient::AmbientParticles;
use crate::game::config::{
    CHUNK_RADII, MAKER_CHUNK, MAX_FRAME_MS, PLAYER_SPRITE, PREVIEW_CENTRE, SceneMetrics, WORLD_SEED,
};
use crate::game::ground::ChunkGround;
use crate::game::scene::{PlayerSprite, player_sheets};
use crate::gui::Route;
use crate::lighting::cloud_shadows::{CLOUD_SHADOW_SOURCE, CloudShadows};
use crate::lighting::shadow_view::ShadowScene;
use crate::lighting::shadow_view_atlas::ShadowAtlas;
use crate::lighting::shadow_view_masks::SilhouetteMasks;
use crate::maker::MakerSession;
use crate::perf::PerfLog;
use crate::player::body_motion::BodyMotion;
use crate::player::dust_view::DustPuffs;
use crate::player::flip::FlipMotion;
use crate::player::player_view::PlayerAnimation;
use crate::rendering::grade::GradeMaterial;
use crate::rendering::render_target::SceneTarget;
use crate::rendering::scene_material::SceneMaterial;
use crate::save::{load_archive_into_manager, load_save, restore_archive};
use crate::services::{MacroquadAudio, MacroquadUi};
use crate::terrain::terrain_view_appearance::TerrainLook;
use crate::terrain::terrain_view_blocks::TerrainFrames;
use crate::touch::{TouchControls, coarse_pointer};

/// Where a manifest path is fetched from.
#[cfg(target_arch = "wasm32")]
fn client_path(path: &str) -> String {
    format!("./{path}")
}

/// Where a manifest path is fetched from.
#[cfg(not(target_arch = "wasm32"))]
fn client_path(path: &str) -> String {
    crate::app::asset_path(path)
}

/// The composed game: world, player, camera, artwork and the save in flight.
pub(crate) struct Game {
    pub(crate) manager: ChunkManager,
    pub(crate) archive: ChunkArchive,
    pub(crate) player: iso::player::physics::PlayerState,
    pub(crate) camera: Camera,
    pub(crate) camera_focus: CameraFocus,
    pub(crate) stepper: FixedStepper,
    pub(crate) show_terrain: bool,
    pub(crate) last_save: f64,
    pub(crate) unsaved_changes: bool,
    pub(crate) atlas: SpriteAtlas,
    pub(crate) clouds: Option<CloudShadows>,
    pub(crate) shadows: Option<ShadowScene>,
    pub(crate) material: Option<SceneMaterial>,
    pub(crate) grade: Option<GradeMaterial>,
    pub(crate) scene_target: SceneTarget,
    pub(crate) terrain_frames: TerrainFrames,
    pub(crate) terrain_look: TerrainLook,
    pub(crate) player_asset: Option<PlayerSprite>,
    pub(crate) sheets: crate::player::player_view::PlayerSheets,
    pub(crate) animation: PlayerAnimation,
    pub(crate) body: BodyMotion,
    pub(crate) flip: FlipMotion,
    pub(crate) drawn_at: (f64, f64),
    pub(crate) dust: DustPuffs,
    /// The motes and fireflies drifting over the world; view state like the dust.
    pub(crate) particles: AmbientParticles,
    pub(crate) draws: Vec<SpriteDraw>,
    pub(crate) perf: PerfLog,
    pub(crate) audio: MacroquadAudio,
    /// The motion state the audio layer last reacted to, one frame behind `player.motion`.
    pub(crate) last_motion: Option<iso::player::PlayerMotionType>,
    /// When the player became idle, for the dance delay (`None` once the dance starts or motion resumes).
    pub(crate) idle_since: Option<f64>,
    pub(crate) ui: MacroquadUi,
    pub(crate) touch: TouchControls,
    /// The logical world clock; only the fixed step advances it.
    pub(crate) clock: WorldClock,
    /// A phase picked by hand from the playground HUD, overriding the clock until it is
    /// unpicked; `None` means the phase follows the game clock.
    pub(crate) phase_override: Option<iso::lighting::BakePhase>,
    pub(crate) tile_metrics: SceneMetrics,
    /// The editing session, on the `/maker` route only; `None` plays the streamed world.
    pub(crate) maker: Option<MakerSession>,
    /// Real time the wind has been blowing, for the sway of what reacts to it; accumulates
    /// frame time like the clouds and the dust, independent of the fixed step.
    pub(crate) wind_ms: f64,
}

impl Game {
    /// Boots the game: loads the catalog and the artwork, restores the save if there is one,
    /// generates the spawn area and frames the player. Exits the process only through
    /// `loops::run`; asset failures downgrade to warnings, never panic.
    pub(crate) async fn new(route: Route) -> Self {
        let catalog_json = include_str!("../../content/entities.json");

        let manifest_json = include_str!("../../content/assets.manifest.json");
        let manifest: AssetManifest =
            serde_json::from_str(manifest_json).expect("asset manifest is valid JSON");
        validate_manifest(&manifest).expect("asset manifest validates");
        let atlas_path = client_path(&manifest.atlas);
        let texture = load_texture(&atlas_path)
            .await
            .unwrap_or_else(|err| panic!("could not load the atlas at {atlas_path}: {err}"));
        let mut sheet_textures = Vec::new();
        let mut sheet_paths: Vec<&String> = manifest
            .entries
            .iter()
            .filter_map(|entry| entry.texture.as_ref())
            .collect();
        sheet_paths.sort();
        sheet_paths.dedup();
        for path in sheet_paths {
            let loaded = load_texture(&client_path(path)).await;
            match loaded {
                Ok(texture) => sheet_textures.push((path.clone(), texture)),
                Err(err) => eprintln!("warning: could not load the sheet at {path}: {err}"),
            }
        }
        let atlas = SpriteAtlas::new(texture, sheet_textures, &manifest);
        let clouds = match load_texture(&client_path(CLOUD_SHADOW_SOURCE)).await {
            Ok(texture) => Some(CloudShadows::new(texture)),
            Err(err) => {
                eprintln!(
                    "warning: could not load the cloud shadows at {CLOUD_SHADOW_SOURCE}: {err}"
                );
                None
            }
        };
        let masks = SilhouetteMasks::load(&atlas_path, &manifest).await;
        if masks.is_none() {
            eprintln!(
                "warning: could not read {atlas_path} for the shadow silhouettes; no shadows"
            );
        }
        if !atlas.has_white_patch() {
            eprintln!(
                "warning: the atlas has no {}; the shadows still draw, but each one binds a texture \
                 of its own and the scene is no longer one batch",
                crate::assets::sprites::WHITE_PATCH
            );
        }
        let shadow_atlas = ShadowAtlas::new();
        let material = match SceneMaterial::load(shadow_atlas.texture()) {
            Ok(material) => Some(material),
            Err(reason) => {
                eprintln!("warning: {reason}; se dibujara sin sombras horneadas");
                None
            }
        };
        let grade = match GradeMaterial::load() {
            Ok(grade) => Some(grade),
            Err(reason) => {
                eprintln!("warning: {reason}; la escena se compone sin grado por fase");
                None
            }
        };
        let tile_metrics = SceneMetrics::for_pointer(coarse_pointer());
        let shadows = masks.filter(|_| material.is_some()).map(|masks| {
            ShadowScene::new(
                phase_at(iso::time::WORLD_START_TICK),
                masks,
                shadow_atlas,
                tile_metrics.tile_width,
                tile_metrics.elevation_step,
            )
        });
        let (terrain_frames, missing_terrain, missing_reflections, missing_paths) =
            TerrainFrames::new(&atlas);
        for material in &missing_terrain {
            eprintln!("warning: the atlas has no block for {material:?}; it will not be drawn");
        }
        for material in &missing_reflections {
            eprintln!(
                "warning: the atlas has no reflection sprite for {material:?}; it will not be reflected"
            );
        }
        for mask in &missing_paths {
            if *mask == 0 {
                eprintln!(
                    "warning: the atlas has no path block for connection mask 0; path columns will not be drawn"
                );
            } else {
                eprintln!(
                    "warning: the atlas has no path block for connection mask {mask}; it will fall back to the plain path block"
                );
            }
        }
        let terrain_config = TerrainConfig {
            seed: WORLD_SEED,
            ..TerrainConfig::default()
        };
        let catalog: EntityCatalog =
            serde_json::from_str(catalog_json).expect("entity catalog is valid JSON");
        validate_catalog(&catalog).expect("entity catalog validates");

        let biomes_json = include_str!("../../content/biomes.json");
        let biomes_catalog =
            iso::biomes::parse_biomes(biomes_json, &catalog).expect("biomes content validates");
        let wfc_json = include_str!("../../content/wfc.json");
        let wfc_catalog = iso::entities::wfc::parse_wfc(wfc_json, &catalog, Some(&biomes_catalog))
            .expect("wfc content validates");
        let world_biomes = iso::biomes::WorldBiomes::new(terrain_config.seed, &biomes_catalog);

        let (terrain_look, missing_tops) = TerrainLook::new(
            terrain_config.seed,
            |source| {
                atlas
                    .asset(source)
                    .and_then(|asset| Some((asset.frame, asset.ink?)))
            },
            Some(&world_biomes),
        );
        for source in &missing_tops {
            eprintln!("warning: the atlas has no measured artwork for {source}; it will not grow");
        }

        let generator =
            TerrainGenerator::new(terrain_config).expect("default terrain configuration is valid");

        let mut manager = ChunkManager::with_radii(generator, catalog, CHUNK_RADII);
        manager.set_biomes(world_biomes);
        manager.set_wfc(wfc_catalog);

        let editing = route.edits_the_world();
        let archive = if editing {
            restore_archive(None)
        } else {
            let save = load_save().await;
            let archive = restore_archive(save);
            if archive.chunks().count() > 0 {
                for id in load_archive_into_manager(&mut manager, &archive) {
                    eprintln!("warning: save refers to unknown entity blueprint {id}; skipped");
                }
            }
            archive
        };

        let centre = if editing {
            iso::grid::to_world_coord(
                MAKER_CHUNK,
                iso::grid::LocalCoord {
                    lx: iso::grid::CHUNK_SIZE / 2,
                    ly: iso::grid::CHUNK_SIZE / 2,
                },
            )
        } else {
            PREVIEW_CENTRE
        };
        if editing {
            manager.load_columns(
                MAKER_CHUNK,
                iso::terrain::flat_chunk(MAKER_CHUNK, 0, iso::terrain::TerrainMaterial::Grass),
            );
            manager.set_single_focus(MAKER_CHUNK);
        } else {
            manager.set_focus(vec![to_chunk_coord(PREVIEW_CENTRE)]);
            for _ in 0..20 {
                manager.tick();
            }
        }

        let ground = ChunkGround { manager: &manager };
        let spawn = find_player_spawn(
            &ground,
            iso::projection::GridPoint {
                x: f64::from(centre.x),
                y: f64::from(centre.y),
            },
        );
        let player = create_player(
            &ground,
            iso::projection::GridPoint {
                x: spawn.x,
                y: spawn.y,
            },
        );

        let spawned = get_player_render_position(&player, 1.0);
        let camera_focus = CameraFocus::new(&spawned);
        let camera = Camera {
            x: spawned.x,
            y: spawned.y,
            zoom: 1.0,
        };

        let player_asset = atlas.asset(PLAYER_SPRITE).and_then(|asset| {
            Some(PlayerSprite {
                frame: asset.frame,
                ink: asset.ink?,
                texture: asset.texture,
            })
        });
        if player_asset.is_none() {
            eprintln!("warning: the atlas has no measured player sprite at {PLAYER_SPRITE}");
        }
        let sheets = player_sheets(&atlas);
        if sheets.walk_poses.is_none() {
            eprintln!("warning: the atlas has no player sheets; the still figure will be drawn");
        }

        prevent_quit();

        Self {
            manager,
            archive,
            player,
            camera,
            camera_focus,
            stepper: FixedStepper::new(iso::simulation::StepperOptions {
                max_frame_ms: MAX_FRAME_MS,
                ..iso::simulation::StepperOptions::default()
            })
            .expect("the client's stepper options are valid"),
            show_terrain: true,
            last_save: get_time(),
            unsaved_changes: false,
            atlas,
            clouds,
            shadows,
            material,
            grade,
            scene_target: SceneTarget::new(screen_width(), screen_height()),
            terrain_frames,
            terrain_look,
            player_asset,
            sheets,
            animation: PlayerAnimation::default(),
            body: BodyMotion::default(),
            flip: FlipMotion::default(),
            drawn_at: (spawned.x, spawned.y),
            dust: DustPuffs::new(),
            particles: AmbientParticles::new(WORLD_SEED),
            draws: Vec::new(),
            perf: PerfLog::default(),
            audio: MacroquadAudio::load().await,
            last_motion: None,
            idle_since: None,
            ui: MacroquadUi::default(),
            touch: TouchControls::new(coarse_pointer()),
            tile_metrics,
            clock: WorldClock::default(),
            maker: editing.then(|| MakerSession::new(MAKER_CHUNK)),
            phase_override: None,
            wind_ms: 0.0,
        }
    }
}

#[cfg(test)]
#[path = "state.test.rs"]
mod tests;
