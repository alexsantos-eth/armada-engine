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
use crate::effects::emitters::{EffectSpot, Emitters};
use crate::effects::fire::{Fire, FireSpot};
use crate::game::config::{
    CHUNK_RADII, DEFAULT_ZOOM, MAKER_CHUNK, MAX_FRAME_MS, PLAYER_SPRITE, PREVIEW_CENTRE,
    SceneMetrics, WORLD_SEED,
};
use crate::game::ground::ChunkGround;
use crate::game::scene::{PlayerSprite, npc_sheets, player_sheets};
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
use crate::rendering::depth_of_field::{DepthMaterial, DepthTarget};
use crate::rendering::grade::GradeMaterial;
use crate::rendering::render_target::SceneTarget;
use crate::rendering::scene_material::SceneMaterial;
use crate::save::{
    boot_seed, load_archive_into_manager, load_save, restore_archive, take_fresh_seed,
};
use crate::services::{MacroquadAudio, MacroquadHaptic, MacroquadUi};
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
    /// The characters of the chunks on show; born from the seed, never saved.
    pub(crate) npcs: iso::npc::Npcs,
    /// Their animation between frames; view state like the player's.
    pub(crate) npc_views: crate::npc::npc_view::NpcViews,
    /// The seed of the world in play, for what is born from it after the boot.
    pub(crate) world_seed: u64,
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
    /// The depth pass's material; without it the blur falls back to the height on screen.
    pub(crate) depth_material: Option<DepthMaterial>,
    pub(crate) depth_target: DepthTarget,
    pub(crate) terrain_frames: TerrainFrames,
    pub(crate) terrain_look: TerrainLook,
    pub(crate) player_asset: Option<PlayerSprite>,
    pub(crate) sheets: crate::player::player_view::PlayerSheets,
    /// How many poses each animal's sheets hold.
    pub(crate) npc_sheets: NpcSheets,
    pub(crate) animation: PlayerAnimation,
    pub(crate) body: BodyMotion,
    pub(crate) flip: FlipMotion,
    /// The fade of each entity sprite the player stands behind.
    pub(crate) occlusion: iso::scene_order::OcclusionFades,
    pub(crate) drawn_at: (f64, f64),
    pub(crate) dust: DustPuffs,
    /// The motes and fireflies drifting over the world; view state like the dust.
    pub(crate) particles: AmbientParticles,
    /// The sparks and smoke of the campfires in view; view state like the dust.
    pub(crate) fire: Fire,
    /// The fires on screen this frame, gathered while the entities are laid out.
    pub(crate) fire_spots: Vec<FireSpot>,
    /// What the animated entities in view throw off (sparks, steam, leaves); view state.
    pub(crate) emitters: Emitters,
    /// The animated entities on screen this frame, gathered while the entities are laid out.
    pub(crate) effect_spots: Vec<EffectSpot>,
    pub(crate) draws: Vec<SpriteDraw>,
    pub(crate) perf: PerfLog,
    pub(crate) audio: MacroquadAudio,
    pub(crate) haptic: MacroquadHaptic,
    /// The motion state the audio layer last reacted to, one frame behind `player.motion`.
    pub(crate) last_motion: Option<iso::player::PlayerMotionType>,
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
    /// The scripted run in flight, when a scene file is driving the game; `None` reads input.
    pub(crate) script: Option<crate::testbed::ScriptRun>,
    /// Whether the world streams around the player. A blank world holds one chunk and never
    /// generates, places, unloads or saves.
    pub(crate) streams: bool,
    /// Whether this run loads and writes the player's save.
    pub(crate) persists: bool,
    /// Whether what is on screen is generated and its shadows are baked and faded in, as of
    /// the end of the last frame. A scripted settle waits for it.
    pub(crate) lit: bool,
    /// The chunks the last frame drew, so a scripted report lists what its shots show.
    pub(crate) shown: Vec<iso::grid::ChunkCoord>,
    /// Whether the player is wearing the jetpack: equipment the development surfaces toggle,
    /// until it is an item found in the world. Worn, a held jump key flies (`PlayerState`).
    pub(crate) jetpack: bool,
    /// What can be carried, the tools and which entities yield what (`content/json/items.json`).
    pub(crate) items: iso::items::ItemCatalog,
    /// The player's slots and tools; saved in the save's `systems`.
    pub(crate) carried: iso::inventory::Carried,
    /// What merchants pay and charge (`content/json/economy.json`).
    pub(crate) economy: iso::economy::EconomyCatalog,
    /// The player's coins; saved in the save's `systems`.
    pub(crate) wallet: iso::economy::Wallet,
    /// What this planet pays and charges today and the tools on the shelf; restocked each day.
    pub(crate) market: iso::economy::Market,
    /// The shop the player has open, if any; never saved.
    pub(crate) shop: Option<crate::shop::Shop>,
    /// Pixels of blur behind an open menu this frame (see `rendering::backdrop`).
    pub(crate) menu_blur: f32,
    /// The toasts on screen.
    pub(crate) toasts: crate::ui::Toasts,
    /// Whether the gather action was held last frame, to tell a new press from a held one.
    pub(crate) gather_was_held: bool,
    /// The merchant in reach this frame, if any.
    pub(crate) merchant: Option<iso::economy::Merchant>,
    /// The icons floating over the markets on screen, gathered while the entities are laid out.
    pub(crate) market_marks: Vec<crate::shop::MarketMark>,
    /// What a scripted run asked of the shop since the last frame.
    pub(crate) scripted_trade: Vec<iso::testbed::SceneTrade>,
    /// The work on what is in reach; never saved, a reload starts the harvest over.
    pub(crate) harvester: iso::harvest::Harvester,
    /// What the harvest did on the last fixed step, for the prompt.
    pub(crate) harvest_status: iso::harvest::HarvestStatus,
    /// The note of the last harvest and how long it stays up, in milliseconds.
    pub(crate) gain_note: Option<(String, f64)>,
    /// What the player picked up since the last frame was drawn, for the HUD's flights.
    pub(crate) pending_gains: Vec<iso::drops::StackGain>,
    /// The exported UI kit the HUD draws with; `None` when `content/ui/` cannot be loaded (the
    /// plain hotbar draws instead).
    pub(crate) clay_skin: Option<crate::ui::ClaySkin>,
    /// The HUD's animations.
    pub(crate) clay_hud: crate::ui::ClayHud,
    /// The heaps of items lying on the ground; saved in the save's `systems`.
    pub(crate) drops: iso::drops::Drops,
    /// How long each heap has been on the ground, for its toss and bob; view state.
    pub(crate) drop_views: crate::harvest::drop_view::DropViews,
    /// The shake of what the player strikes and the bursts of chips due; view state.
    pub(crate) impacts: crate::harvest::impact::Impacts,
    /// Real time the wind has been blowing, for the sway of what reacts to it; accumulates
    /// frame time like the clouds and the dust, independent of the fixed step.
    pub(crate) wind_ms: f64,
    /// Real time since a bird last sang, for the gap between calls.
    pub(crate) since_bird_call_ms: f64,
    /// The draws that decide when a bird sings and which phrase.
    pub(crate) bird_random: iso::player::DustRandom,
}

impl Game {
    /// Boots the game: loads the catalog and the artwork, restores the save if there is one,
    /// generates the spawn area and frames the player. Exits the process only through
    /// `loops::run`; asset failures downgrade to warnings, never panic.
    pub(crate) async fn new(route: Route, scene: Option<&iso::testbed::Scene>) -> Self {
        let catalog_json = include_str!("../../content/json/entities.json");

        let manifest_json = include_str!("../../content/json/assets.manifest.json");
        let manifest: AssetManifest =
            serde_json::from_str(manifest_json).expect("asset manifest is valid JSON");
        validate_manifest(&manifest).expect("asset manifest validates");
        let atlas_path = client_path(&manifest.atlas);
        let atlas_image = load_image(&atlas_path)
            .await
            .unwrap_or_else(|err| panic!("could not load the atlas at {atlas_path}: {err}"));
        let texture = Texture2D::from_image(&atlas_image);
        let mut sheet_textures = Vec::new();
        let mut sheet_paths: Vec<String> = manifest
            .entries
            .iter()
            .filter_map(|entry| entry.texture.clone())
            .collect();
        sheet_paths.sort();
        sheet_paths.dedup();
        let sheets_loaded = futures::future::join_all(sheet_paths.iter().map(|path| {
            let path = path.clone();
            let full_path = client_path(&path);
            async move { (path, load_texture(&full_path).await) }
        }))
        .await;
        for (path, loaded) in sheets_loaded {
            match loaded {
                Ok(texture) => sheet_textures.push((path, texture)),
                Err(err) => eprintln!("warning: could not load the sheet at {path}: {err}"),
            }
        }
        let mut atlas = SpriteAtlas::new(texture, sheet_textures, &manifest);
        atlas.measure_cover(
            u32::from(atlas_image.width),
            u32::from(atlas_image.height),
            &atlas_image.bytes,
        );
        drop(atlas_image);
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
        let depth_material = match DepthMaterial::load() {
            Ok(depth) => Some(depth),
            Err(reason) => {
                eprintln!("warning: {reason}; el desenfoque sigue la altura en pantalla");
                None
            }
        };
        let metrics = SceneMetrics::for_pointer(coarse_pointer()).scaled(DEFAULT_ZOOM);
        let tile_metrics = match scene.and_then(|scene| scene.zoom) {
            Some(zoom) => metrics.scaled(zoom),
            None => metrics,
        };
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
        let keeps_save = route.keeps_the_save() && !crate::save::flush_requested();
        let (fresh, save) = if keeps_save {
            let fresh = take_fresh_seed();
            let save = if fresh.is_some() {
                None
            } else {
                load_save().await
            };
            (fresh, save)
        } else {
            (None, None)
        };
        let saved_systems = save.as_ref().map(|save| save.systems.clone());
        let terrain_config = TerrainConfig {
            seed: boot_seed(
                scene.and_then(|scene| scene.seed),
                fresh,
                save.as_ref()
                    .and_then(|save| iso::world::saved_seed(&save.systems)),
                WORLD_SEED,
            ),
            ..TerrainConfig::default()
        };
        let world_seed = terrain_config.seed;
        let catalog: EntityCatalog =
            serde_json::from_str(catalog_json).expect("entity catalog is valid JSON");
        validate_catalog(&catalog).expect("entity catalog validates");

        let items_json = include_str!("../../content/json/items.json");
        let items = iso::items::parse_items(items_json, &catalog).expect("item content validates");
        let clay_skin = crate::ui::ClaySkin::load(
            client_path,
            items
                .item_ids()
                .into_iter()
                .chain(items.tool_ids())
                .map(str::to_owned),
        )
        .await;
        let carried = match saved_systems.as_ref().and_then(|systems| {
            iso::inventory::saved_carried(systems, iso::inventory::STARTING_SLOTS, &items)
        }) {
            Some(restored) => {
                for id in &restored.dropped {
                    eprintln!("warning: save carries unknown item or tool {id}; dropped");
                }
                restored.carried
            }
            None => iso::inventory::Carried::starting(iso::inventory::STARTING_SLOTS, &items),
        };

        let economy_json = include_str!("../../content/json/economy.json");
        let economy = iso::economy::parse_economy(economy_json, &items, &catalog)
            .expect("economy content validates");
        let wallet = saved_systems
            .as_ref()
            .and_then(iso::economy::saved_wallet)
            .unwrap_or_default();

        let drops = saved_systems
            .as_ref()
            .and_then(|systems| iso::drops::saved_drops(systems, &items))
            .unwrap_or_default();

        let biomes_json = include_str!("../../content/json/biomes.json");
        let biomes_catalog =
            iso::biomes::parse_biomes(biomes_json, &catalog).expect("biomes content validates");
        let wfc_json = include_str!("../../content/json/wfc.json");
        let wfc_catalog = iso::entities::wfc::parse_wfc(wfc_json, &catalog, Some(&biomes_catalog))
            .expect("wfc content validates");
        let world_biomes = iso::biomes::WorldBiomes::new(terrain_config.seed, &biomes_catalog);
        let settlements_json = include_str!("../../content/json/settlements.json");
        let settlements_catalog =
            iso::settlements::parse_settlements(settlements_json, &catalog, &wfc_catalog)
                .expect("settlements content validates");
        let generator =
            TerrainGenerator::new(terrain_config).expect("default terrain configuration is valid");
        let world_settlements =
            iso::settlements::WorldSettlements::new(terrain_config.seed, &settlements_catalog)
                .on_ground(generator.clone());

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

        let mut manager = ChunkManager::with_radii(generator, catalog, CHUNK_RADII);
        manager.set_biomes(world_biomes);
        manager.set_wfc(wfc_catalog);
        manager.set_settlements(world_settlements);

        let blank = scene.map_or(route.edits_the_world(), |scene| {
            scene.world == iso::testbed::SceneWorld::Blank
        });
        let archive = if !keeps_save {
            restore_archive(None)
        } else {
            let archive = restore_archive(save);
            if archive.chunks().count() > 0 {
                for id in load_archive_into_manager(&mut manager, &archive) {
                    eprintln!("warning: save refers to unknown entity blueprint {id}; skipped");
                }
            }
            archive
        };

        let asked_centre = scene
            .and_then(|scene| scene.centre)
            .map(|[x, y]| iso::grid::WorldCoord { x, y });
        let generated_centre = if blank {
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
        let centre = asked_centre.unwrap_or(generated_centre);
        if blank {
            let flat = asked_centre.map_or(MAKER_CHUNK, to_chunk_coord);
            manager.load_columns(
                flat,
                iso::terrain::flat_chunk(flat, 0, iso::terrain::TerrainMaterial::Grass),
            );
            manager.set_single_focus(flat);
        } else {
            manager.set_focus(vec![to_chunk_coord(centre)]);
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
        let npc_sheets = NpcSheets {
            crab: npc_sheets(&atlas, crate::game::config::CRAB_ART),
            rabbit: npc_sheets(&atlas, crate::game::config::RABBIT_ART),
        };
        if sheets.walk_poses.is_none() {
            eprintln!("warning: the atlas has no player sheets; the still figure will be drawn");
        }

        prevent_quit();

        Self {
            manager,
            archive,
            player,
            npcs: iso::npc::Npcs::default(),
            npc_views: crate::npc::npc_view::NpcViews::default(),
            world_seed,
            camera,
            camera_focus,
            stepper: FixedStepper::new(iso::simulation::StepperOptions {
                max_frame_ms: MAX_FRAME_MS,
                ..iso::simulation::StepperOptions::default()
            })
            .expect("the client's stepper options are valid"),
            show_terrain: true,
            jetpack: false,
            last_save: get_time(),
            unsaved_changes: false,
            atlas,
            clouds,
            shadows,
            material,
            grade,
            scene_target: SceneTarget::new(screen_width(), screen_height()),
            depth_material,
            depth_target: DepthTarget::new(screen_width(), screen_height()),
            terrain_frames,
            terrain_look,
            player_asset,
            sheets,
            npc_sheets,
            animation: PlayerAnimation::default(),
            body: BodyMotion::default(),
            flip: FlipMotion::default(),
            occlusion: iso::scene_order::OcclusionFades::default(),
            drawn_at: (spawned.x, spawned.y),
            dust: DustPuffs::new(),
            particles: AmbientParticles::new(WORLD_SEED),
            fire: Fire::default(),
            fire_spots: Vec::new(),
            emitters: Emitters::default(),
            effect_spots: Vec::new(),
            draws: Vec::new(),
            perf: PerfLog::default(),
            audio: MacroquadAudio::load().await,
            haptic: MacroquadHaptic::default(),
            last_motion: None,
            ui: MacroquadUi::default(),
            touch: TouchControls::new(coarse_pointer()),
            tile_metrics,
            clock: WorldClock::default(),
            maker: route
                .edits_the_world()
                .then(|| MakerSession::new(MAKER_CHUNK)),
            script: None,
            streams: !blank,
            persists: keeps_save,
            lit: false,
            shown: Vec::new(),
            phase_override: None,
            wind_ms: 0.0,
            since_bird_call_ms: 0.0,
            bird_random: iso::player::DustRandom::new(world_seed),
            market: iso::economy::Market::open(
                &economy,
                world_seed,
                iso::time::clock_time(iso::time::WorldClock::default().tick).day,
            ),
            economy,
            wallet,
            shop: None,
            menu_blur: 0.0,
            toasts: crate::ui::Toasts::default(),
            gather_was_held: false,
            merchant: None,
            market_marks: Vec::new(),
            scripted_trade: Vec::new(),
            items,
            carried,
            harvester: iso::harvest::Harvester::default(),
            harvest_status: iso::harvest::HarvestStatus::Idle,
            gain_note: None,
            pending_gains: Vec::new(),
            clay_skin,
            clay_hud: crate::ui::ClayHud::default(),
            impacts: crate::harvest::impact::Impacts::default(),
            drop_views: crate::harvest::drop_view::DropViews::landed(drops.list()),
            drops,
        }
    }
}

#[cfg(test)]
#[path = "state.test.rs"]
mod tests;

/// How many poses the sheets of each animal hold, read once from the atlas.
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct NpcSheets {
    pub(crate) crab: crate::player::player_view::PlayerSheets,
    pub(crate) rabbit: crate::player::player_view::PlayerSheets,
}

impl NpcSheets {
    /// The sheets of `kind`.
    pub(crate) fn of(&self, kind: iso::npc::NpcKind) -> crate::player::player_view::PlayerSheets {
        match kind {
            iso::npc::NpcKind::Crab => self.crab,
            iso::npc::NpcKind::Rabbit => self.rabbit,
        }
    }
}
