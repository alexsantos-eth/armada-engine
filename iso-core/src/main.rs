mod perf;
mod save;
mod services;
mod sprites;
mod terrain_view;

use armada_core::grid::{WorldCoord, to_chunk_coord};
use armada_core::player::physics::{
    PlayerGround, create_player, find_player_spawn, get_player_column,
    get_player_render_position, jump_player, set_player_jump_held,
    set_player_run, step_player,
};
use armada_core::services::{InputService, NormalizedInput, UiService, UiEvent, AudioService, SoundEvent};
use services::{MacroquadInput, MacroquadAudio, MacroquadUi};
use armada_core::projection::{
    GridPoint, ProjectionConfig, ScreenPoint, project_block, project_grid_point,
};
use armada_core::simulation::FixedStepper;
use armada_core::terrain::{TerrainColumn, TerrainConfig, TerrainGenerator, TerrainMaterial};
use armada_core::world::{ChunkManager, ChunkRadii};
use armada_core::assets::{InkBox, SVG_BLOCK_HEIGHT, SVG_TILE_WIDTH, SpriteFrame, footprint_band, ink_layout};
use armada_core::entities::{EntityCatalogV2, EntityLengthAxis, validate_catalog};
use armada_core::player::physics::PlayerObstacle;
use armada_core::camera::{
    CAMERA_LEVEL_SMOOTH_MS, Camera, CameraFocus, ScreenSize,
    visible_chunks as camera_visible_chunks,
};
use save::{
    load_archive_into_manager, load_save, restore_archive, restore_discovered_from_archive,
    save_archive, sync_manager_to_archive,
};
use perf::{FrameSample, PerfLog};
use sprites::{SpriteAtlas, SpriteDraw, draw_sorted, scene_key};
use terrain_view::blocks::{TerrainFrames, collect_terrain_sprites};
use macroquad::prelude::*;

fn window_conf() -> Conf {
    Conf {
        window_title: "Armada Engine".to_owned(),
        window_width: 960,
        window_height: 600,
        ..Default::default()
    }
}

/// Diagnostic centre of the world; the player spawns near here.
const PREVIEW_CENTRE: WorldCoord = WorldCoord { x: 16, y: 88 };
/// The scene's zoom: how wide one tile is drawn, in screen pixels. Everything else in the view
/// is derived from it — the elevation step, the player's size, the projection origin — so this is
/// the one knob to turn. Raising it zooms in, which also shrinks the camera's chunk cull and so
/// draws fewer chunks. `Camera::zoom` is left at 1.0 and only feeds that cull; the draw path
/// does not scale by it.
///
/// It is the TypeScript client's own view: its tile is 40 px (`TILE_WIDTH`) and its camera
/// starts at a zoom of 7 (`CAMERA_START_ZOOM`), so a tile reaches the screen 280 px across.
/// Drawing the tile smaller than that shows more world, but it also draws the player smaller
/// than the other client draws it, which is the thing this view is compared against.
const PREVIEW_TILE_WIDTH: f64 = 280.0;
const PREVIEW_TILE_HEIGHT: f64 = PREVIEW_TILE_WIDTH / 2.0;
/// One level of elevation, in screen pixels: as tall as the artwork draws a block's body, so
/// that a stack of them meets. See [`armada_core::assets::elevation_step`].
const PREVIEW_ELEVATION_STEP: f64 = PREVIEW_TILE_WIDTH * SVG_BLOCK_HEIGHT / SVG_TILE_WIDTH;

/// How far each band of a multi-cell sprite reaches past its cut, in screen pixels.
///
/// Two polygons that meet exactly along an edge leave a hairline of whatever is behind them
/// showing through. Half a pixel of overlap closes it and costs nothing: the bands are parts of
/// one drawing sampled the same way, so an overlapping band paints the very same pixels.
const BAND_BLEED: f64 = 0.5;

/// Entities draw above the terrain of the same depth, and the player either side of them.
///
/// The player shares a column with whatever stands on it, so one fixed order cannot be right:
/// walking along the back of a column it belongs behind the tree that grows there, and along
/// the front of the same column it belongs in front of it. The TypeScript client gives it two
/// layers for that (`SCENE_LAYER.behindObject` and the entities' own), and this is the same
/// pair: [`PLAYER_BEHIND_LAYER`] under the entities and [`PLAYER_FRONT_LAYER`] over them.
const ENTITY_LAYER: i32 = 2;
/// The player on the half of its column furthest from the camera: over the ground, under what
/// stands on it, so it walks behind a tree's trunk.
const PLAYER_BEHIND_LAYER: i32 = 1;
/// The player on the half of its column nearest the camera: over what stands there.
const PLAYER_FRONT_LAYER: i32 = 3;
/// How big the player is drawn, as a fraction of the size its artwork was drawn at: the same
/// scale the TypeScript client uses (`PLAYER_SCALE` in `src/isometric/content/player.ts`), so
/// the two look alike.
///
/// It scales the measured artwork about the ground point the player stands on, exactly as the
/// TypeScript client scales its sprite about that same point, so the figure keeps its place on
/// the tile at any scale. Sizing it against the tile instead — the frame's longest side at a
/// fraction of a tile width, centred on the feet — drew it almost three times too large and
/// put half of it below the ground it stands on.
const PLAYER_SCALE: f64 = 0.75;
/// Source path of the player's sprite in the asset manifest.
const PLAYER_SPRITE: &str = "/assets/player/block.svg";
/// Extra view the chunk cull keeps around the screen, as a fraction of it.
///
/// Zero: this client culls every frame, so a chunk is included on the frame it first touches the
/// screen and there is nothing for a margin to cover. `CHUNK_VIEW_MARGIN` exists for a client
/// that caches its cull between frames and needs the ring ahead of the camera.
const CHUNK_CULL_MARGIN: f64 = 0.0;

/// This view's projection with its origin at `(origin_x, origin_y)`: the tile size and the
/// elevation step are the view's own constants, so only the origin ever changes.
///
/// With the origin at zero it is also the projection to measure a lift with
/// (`ground_point_below()` reads only the elevation step and the tile height), which is how the
/// camera's focus is asked where to look before the origin that focus decides is known.
fn preview_projection(origin_x: f64, origin_y: f64) -> ProjectionConfig {
    ProjectionConfig {
        tile_width: PREVIEW_TILE_WIDTH,
        tile_height: PREVIEW_TILE_HEIGHT,
        elevation_step: Some(PREVIEW_ELEVATION_STEP),
        origin_x,
        origin_y,
    }
}

/// How far under its cell's own plane a material's top is drawn, in blocks.
///
/// Sand's artwork is a shallow slab rather than a full block, so the surface a walker sees is
/// half a block below the plane its elevation names. The TypeScript content says the same
/// (`TERRAIN_APPEARANCE.sand.topInset` in `src/isometric/content/terrain.ts`), and its player
/// stands and falls onto that sunken top. Without it the player walks half a block over every
/// beach — about 47 px at this tile size — which is what it did here.
fn preview_top_inset(material: TerrainMaterial) -> f64 {
    match material {
        TerrainMaterial::Sand => SAND_TOP_INSET,
        _ => 0.0,
    }
}

/// Blocks sand's drawn top lies below its cell's plane; see [`preview_top_inset`].
const SAND_TOP_INSET: f64 = 0.5;

/// The player's artwork: its frame in the atlas and where that drawing belongs over the ground
/// it stands on, both read from the manifest once at start-up.
#[derive(Clone, Copy)]
struct PlayerSprite {
    frame: SpriteFrame,
    ink: InkBox,
}

/// Which layer the player draws in over the column it stands on.
///
/// The player and whatever stands on its column are at the same depth, so the layer is what
/// decides between them, and neither answer is right for the whole cell: past the centre of the
/// column the player is further from the camera than the tree that grows there and belongs
/// behind its trunk; before it, in front of it. The TypeScript client splits the cell the same
/// way (`at.x + at.y > column.x + column.y` in `player-view.ts`).
fn player_layer(position: GridPoint, column: WorldCoord) -> i32 {
    if position.x + position.y > f64::from(column.x) + f64::from(column.y) {
        PLAYER_BEHIND_LAYER
    } else {
        PLAYER_FRONT_LAYER
    }
}

/// Projects the point where the player's feet meet the top of its current column.
///
/// Player coordinates identify a column by its integer coordinate: physics resolves it by
/// rounding them. Terrain projects that column from its visual centre, half a cell along each
/// axis, so the feet use that same point and cannot fall under a neighbouring tile.
fn player_feet(position: GridPoint, elevation: f64, projection: ProjectionConfig) -> ScreenPoint {
    let projected = project_block(
        GridPoint {
            x: position.x + 0.5,
            y: position.y + 0.5,
        },
        elevation,
        projection,
    );
    ScreenPoint { x: projected.screen_x, y: projected.screen_y }
}

/// How far this client streams chunks, below the shared defaults (1 / 2 / 3).
///
/// A chunk is 32 columns square and the player is drawn at [`PLAYER_SCALE`] of a tile, so at
/// most a few columns beyond the focus chunk are ever on screen: the outer rings were generated,
/// placed with entities, held in memory and written to the save without ever being drawn.
/// `load` stays at 1, which is the ring a shown chunk needs for its edges; `prefetch` and `keep`
/// each drop by one, taking the chunks discovered around a standing player from 25 to 9 and the
/// chunks kept from 49 to 25.
const CHUNK_RADII: ChunkRadii = ChunkRadii {
    load: 1,
    prefetch: 1,
    keep: 2,
};

/// Safety-net interval for the periodic save; the real save happens on quit and on request.
const AUTOSAVE_SECONDS: f64 = 120.0;

/// Wraps a `ChunkManager` so it satisfies `PlayerGround` for locomotion.
struct ChunkGround<'a> {
    manager: &'a ChunkManager,
}

impl PlayerGround for ChunkGround<'_> {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn> {
        self.manager.column_at(x, y)
    }
    fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle> {
        let coord = armada_core::grid::to_chunk_coord(armada_core::grid::WorldCoord { x, y });
        let Some(entities) = self.manager.entities_chunk(coord) else {
            return Vec::new();
        };
        entities
            .iter()
            .filter(|entity| {
                let axis = entity.length_axis().unwrap_or(EntityLengthAxis::X);
                let length = entity.length().max(1);
                (0..length).any(|i| {
                    let (cx, cy) = if axis == EntityLengthAxis::X {
                        (entity.x() + i, entity.y())
                    } else {
                        (entity.x(), entity.y() + i)
                    };
                    cx == x && cy == y
                })
            })
            .map(|entity| {
                let collision = entity.collision_at(x, y);
                PlayerObstacle {
                    walkable: entity.walkable(),
                    height: Some(entity.height() as f64),
                    elevation: Some(entity.elevation() as f64),
                    collision_at: Some(collision),
                }
            })
            .collect()
    }
    fn chunk_has(&self, coord: armada_core::grid::ChunkCoord) -> bool {
        self.manager.is_discovered(coord)
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    // Load the versioned entity catalog (embedded at compile time).
    let catalog_json = include_str!("../../src/isometric/content/entities.v2.json");

    // Load the asset manifest and atlas (P6 prototype).
    let manifest_json = include_str!("../content/assets.manifest.json");
    let manifest: armada_core::assets::AssetManifest =
        serde_json::from_str(manifest_json).expect("asset manifest is valid JSON");
    armada_core::assets::validate_manifest(&manifest).expect("asset manifest validates");
    // Macroquad loads the atlas as a single texture; sprites are addressed by frame rect.
    //
    // The manifest path is relative to the client root (iso-core/), which is the working
    // directory natively. On the web the fetch resolves against the page instead, and the page
    // lives in `web/`, so it needs one level up — without this the request went to
    // `web/content/atlas.png`, 404'd, and the client panicked before its first frame.
    let atlas_path = if cfg!(target_arch = "wasm32") {
        format!("../{}", manifest.atlas)
    } else {
        manifest.atlas.clone()
    };
    let texture = load_texture(&atlas_path)
        .await
        .unwrap_or_else(|err| panic!("could not load the atlas at {atlas_path}: {err}"));
    let atlas = SpriteAtlas::new(texture, &manifest);
    let (terrain_frames, missing_terrain) = TerrainFrames::new(&atlas);
    for material in &missing_terrain {
        eprintln!("warning: the atlas has no block for {material:?}; it will not be drawn");
    }
    let catalog: EntityCatalogV2 =
        serde_json::from_str(catalog_json).expect("entity catalog is valid JSON");
    validate_catalog(&catalog).expect("entity catalog validates");

    let generator = TerrainGenerator::new(TerrainConfig::default())
        .expect("default terrain configuration is valid");

    let mut manager = ChunkManager::with_radii(generator, catalog, CHUNK_RADII);

    // Try to restore a previous save.
    let save = load_save().await;
    let mut archive = restore_archive(save);
    if archive.chunks().count() > 0 {
        for id in load_archive_into_manager(&mut manager, &archive) {
            eprintln!("warning: save refers to unknown entity blueprint {id}; skipped");
        }
    }

    // Load enough chunks around the centre to find a spawn point.
    let centre_chunk = to_chunk_coord(PREVIEW_CENTRE);
    manager.set_focus(vec![centre_chunk]);
    for _ in 0..20 {
        manager.tick();
    }

    // Find a spawn point and create the player.
    let ground = ChunkGround { manager: &manager };
    let spawn = find_player_spawn(&ground, GridPoint {
        x: f64::from(PREVIEW_CENTRE.x),
        y: f64::from(PREVIEW_CENTRE.y),
    });
    let mut player = create_player(&ground, GridPoint { x: spawn.x, y: spawn.y });

    // Camera state: where it looks (the level under the player, eased when that changes) and the
    // centre it has eased to, started on the spawn so the first frame is not a swoop across the
    // world.
    let spawned = get_player_render_position(&player, 1.0);
    let mut camera_focus = CameraFocus::new(&spawned);
    let mut camera = Camera {
        x: spawned.x,
        y: spawned.y,
        zoom: 1.0,
    };

    let mut show_terrain = true;
    let mut last_save = get_time();
    // A saved world is only rewritten when something changed, so an idle player does not pay
    // for a full archive serialization every interval.
    let mut unsaved_changes = false;

    // The player sprite's atlas frame and its measured artwork never change, so they are
    // resolved once here instead of scanning all 63 manifest entries every frame.
    let player_asset = atlas.asset(PLAYER_SPRITE).and_then(|asset| {
        Some(PlayerSprite {
            frame: asset.frame,
            ink: asset.ink?,
        })
    });
    if player_asset.is_none() {
        eprintln!("warning: the atlas has no measured player sprite at {PLAYER_SPRITE}");
    }

    // Every sprite drawn in a frame goes through this one list, which is reused so a frame
    // costs no allocation.
    let mut draws: Vec<SpriteDraw> = Vec::new();

    // Fixed simulation step, variable frame rate. `FixedStepper` is the same accumulator the
    // TypeScript game uses and is checked against its fixture; stepping once per frame instead
    // tied the player's speed to the frame rate, so the same walk covered twice the ground at
    // 60 fps as at 30.
    let mut stepper = FixedStepper::default();

    // The quit is intercepted so the final save gets a frame to run before the window closes.
    prevent_quit();

    // Frame timings over a rolling window. The phases are kept beside the frame total: if the
    // three add up to much less than the frame took, the time went on the GPU or on waiting for
    // the display, and no amount of work removed from this loop will show up.
    let mut perf = PerfLog::default();

    // Services.
    let mut audio = MacroquadAudio::default();
    let mut ui = MacroquadUi::default();

    loop {
        let frame_start = get_time();
        if is_key_pressed(KeyCode::T) {
            show_terrain = !show_terrain;
        }
        // Not plain `S`: that walks the player south.
        let save_requested = is_key_pressed(KeyCode::F5)
            || (is_key_pressed(KeyCode::S)
                && (is_key_down(KeyCode::LeftControl) || is_key_down(KeyCode::RightControl)));
        if save_requested {
            sync_manager_to_archive(&manager, &mut archive);
            save_archive(&archive);
            unsaved_changes = false;
            last_save = get_time();
        }

        let width = screen_width();
        let height = screen_height();

        // Input via the normalized service.
        let mut input_service = MacroquadInput;
        let input: NormalizedInput = input_service.poll();
        player.walk = input.walk;
        set_player_run(&mut player, input.run);

        // Jump input.
        if input.jump_pressed {
            jump_player(&mut player);
        }
        set_player_jump_held(&mut player, input.jump_held);

        // Update streaming focus around the player.
        let focus = to_chunk_coord(WorldCoord {
            x: player.x.floor() as i32,
            y: player.y.floor() as i32,
        });
        manager.set_single_focus(focus);

        // Step the player: as many fixed ticks as the elapsed frame time earned.
        // `max_frame_ms` already caps a long frame, so the count always fits; saturating keeps
        // that an invariant of this call rather than an assumption about the stepper.
        let frame_ms = f64::from(get_frame_time()) * 1000.0;
        let ticks = u32::try_from(stepper.consume_frame(frame_ms)).unwrap_or(u32::MAX);
        if ticks > 0 {
            let jumps_before = player.feedback.jumps;
            let landings_before = player.feedback.landings;
            let mut ground = ChunkGround { manager: &manager };
            step_player(&mut player, &mut ground, ticks, preview_top_inset);
            if player.feedback.jumps > jumps_before {
                audio.play(SoundEvent::Jump);
            }
            if player.feedback.landings > landings_before {
                audio.play(SoundEvent::Land);
            }
        }

        // Everything drawn this frame is placed from the interpolated position, never from
        // `player` directly.
        //
        // The simulation runs at 20 ticks a second and the screen at 60 or more, so `player.x`
        // only changes on one frame in three. Drawing the sprite from the interpolated position
        // while the camera and the projection used the raw one made the world jump in 20 Hz
        // steps and the player slide smoothly against it: the whole scene appeared to shake,
        // and it looked like the game ran at a fraction of its real frame rate.
        let rp = get_player_render_position(&player, stepper.interpolation_alpha());

        // The camera sits on that same interpolated position, and the projection origin follows the
        // camera, so the player, the terrain and the entities all move as one.
        //
        // Only the height it looks at is smoothed, and it is smoothed on its own, outside the
        // camera's centre. That is the whole of this view's camera motion, and the two halves of
        // the choice were each measured against the other client:
        //
        // * The height has to be smoothed. Reading it straight off the player moved the whole world
        //   a full elevation step on the one frame the player changed level, and let every tick of a
        //   fall or a climb through unsmoothed. `CameraFocus` is the other client's answer
        //   (the `ground()` closure of `createPlayerView()`): it holds the level at the top the
        //   player stands on, does not let a jump bob it, follows the feet down a fall, and rises
        //   onto a higher top it did not climb to on a climb's own curve.
        // * The ground motion must not be. The other client eases its centre onto the point it
        //   looks at as well (`followCamera()`, half the distance left every 90 ms), and that lag is
        //   the one thing the player is drawn against, so every change in its own speed reads as the
        //   player sliding across the screen: it hopped a third of a block on a step up (±32 px) and
        //   two thirds on a step down, and during a climb it shot about 50 px the way it was
        //   climbing and drifted back. The player's own position is already interpolated every
        //   frame, so easing it again buys nothing.
        // * The height is smoothed twice over, and the second one is a spring
        //   ([`CAMERA_LEVEL_SMOOTH_MS`]). The level a camera aims at is as abrupt as the feet it
        //   follows, which accelerate under gravity and stop dead the frame the player lands, and
        //   the view arrives with a knock; smoothing rounds that off, at the price of the player
        //   drifting by whatever the smoothing is behind by. It is a critically damped spring and
        //   not a half-life chase because a chase answers at full speed, which puts a corner at the
        //   start of every move, and a short move — half a block of sand — is mostly made of that
        //   start. That constant's own documentation has the measured trade-off and is the one place
        //   to turn it.
        // So the centre is the player's column itself, and the level is added to the projection's
        // origin: the same shift `ground_point_below()` makes along both axes, without a lag of its
        // own. On screen the player then holds its place while the world moves under it, and the
        // only thing that moves it is a change of level, on the eased curve.
        camera.x = rp.x;
        camera.y = rp.y;
        let level = camera_focus.advance(&rp, player.motion, frame_ms, CAMERA_LEVEL_SMOOTH_MS);
        // Derived from the tile size, not written out: with the numbers inlined, changing
        // `PREVIEW_TILE_WIDTH` moved the world under the player instead of zooming.
        let projection = preview_projection(
            f64::from(width / 2.0) - (camera.x - camera.y) * (PREVIEW_TILE_WIDTH / 2.0),
            f64::from(height / 2.0 + 50.0)
                + (camera.x + camera.y) * (PREVIEW_TILE_HEIGHT / 2.0)
                + level * PREVIEW_ELEVATION_STEP,
        );

        // Tick streaming, then give any chunk the archive already holds its stored contents back
        // instead of the freshly generated ones.
        let discovered = manager.tick();
        if !discovered.is_empty() {
            unsaved_changes = true;
            for id in restore_discovered_from_archive(&mut manager, &archive, &discovered) {
                ui.push(UiEvent::Message {
                    text: format!("partida guardada con una entidad desconocida: {id}"),
                });
            }
        }

        // Drop chunks the player has left behind, after storing them: hiding a chunk keeps its
        // terrain and entities in memory, so without this a long session grows without bound.
        // One per frame, matching the load budget.
        if let Some(stale) = manager.next_unload_candidate()
            && let Some(saved) = manager.unload_chunk(stale)
        {
            archive.put(saved);
            unsaved_changes = true;
        }

        // Writing the save is one synchronous pass over the whole archive on the main thread:
        // ~25 ms at 42 chunks and growing with every chunk explored, which is a visible freeze.
        // So it happens on quit, on request, and otherwise only as an infrequent safety net.
        // Unloaded chunks are already safe in `archive` in the meantime.
        let quitting = is_quit_requested();
        if unsaved_changes && (quitting || get_time() - last_save > AUTOSAVE_SECONDS) {
            sync_manager_to_archive(&manager, &mut archive);
            save_archive(&archive);
            unsaved_changes = false;
            last_save = get_time();
        }
        if quitting {
            return;
        }

        let after_simulation = get_time();

        // Camera culling: determine which chunks are in the viewport.
        let viewport = ScreenSize {
            width: f64::from(width),
            height: f64::from(height),
        };
        let culled = camera_visible_chunks(camera, viewport, projection, CHUNK_CULL_MARGIN);

        // Render position, interpolated by how far into the current tick the frame sits.
        let elevation = player.elevation.floor() as i32;

        clear_background(Color::from_rgba(21, 29, 42, 255));
        draw_rectangle_lines(16.0, 16.0, width - 32.0, height - 32.0, 2.0, SKYBLUE);

        // Everything visible is queued into one list and sorted once, so a sprite covers
        // exactly what is behind it: the ground, what stands on the ground, and the player.
        draws.clear();
        if !show_terrain {
            draw_grid(projection, WorldCoord {
                x: player.x.floor() as i32,
                y: player.y.floor() as i32,
            });
        }
        // The camera already returns its small, ordered cull list. Iterating it directly avoids
        // allocating and sorting the stream's visible chunk set every frame; check the stream
        // membership without asking it to materialize that set.
        let mut chunks_drawn = 0usize;
        for coord in culled {
            if !manager.is_visible(coord) {
                continue;
            }
            chunks_drawn += 1;
            if show_terrain && let Some(chunk) = manager.terrain_chunk(coord) {
                // `column_at` indexes straight into the chunk. Scanning the chunk for a
                // matching coordinate searched up to 1024 columns per lookup, and the view
                // asks for two neighbour heights per drawn column: ~4 ms a frame, for a
                // lookup that is O(1).
                collect_terrain_sprites(
                    chunk,
                    projection,
                    &terrain_frames,
                    |point| manager.column_at(point.x, point.y).map(|c| c.elevation),
                    &mut draws,
                );
            }
            // Entities of the same chunk. Each one is drawn from its own blueprint: the sprite
            // its `asset.sprite` names, sized by the footprint and height the blueprint
            // declares. The first version guessed the sprite from the entity's id and drew
            // every one of them as a fixed 64x64 square, so a three-cell pier and a
            // six-storey tower came out the same size as a bush.
            let Some(entities) = manager.entities_chunk(coord) else {
                continue;
            };
            for entity in entities {
                let x = f64::from(entity.x()) + 0.5;
                let y = f64::from(entity.y()) + 0.5;
                let elevation = f64::from(entity.elevation());
                let ground = project_block(GridPoint { x, y }, elevation, projection);
                // The sprite goes where its artwork was drawn over the cell it stands on. The
                // footprint and height the blueprint declares describe the template the artwork
                // was drawn inside, not the artwork, so sizing a sprite from them drew a
                // knee-high boulder as a whole block and stood every tree on the south corner
                // of its tile.
                let Some((frame, layout)) = atlas.standing(
                    entity.texture_source(),
                    ScreenPoint { x: ground.screen_x, y: ground.screen_y },
                    projection.tile_width,
                ) else {
                    continue;
                };
                if !SpriteAtlas::on_screen(layout) {
                    continue;
                }
                // One drawing, one depth each. A sprite covering several cells is nearer the
                // camera at one end than at the other, so no single key is right for all of
                // it: keyed by its near cell it was painted over a tree standing beside its
                // far one, and keyed by its far cell the ground in front of its near one
                // painted over its base. It is cut where its cells meet instead, and each band
                // sorts by the cell it stands on. A single cell is one band, uncut.
                let cells = entity.length().max(1);
                let along_y = entity.length_axis() == Some(EntityLengthAxis::Y);
                // One cell along the engine's x is half a tile right and a quarter of one up
                // the screen; one along its y is half a tile left and the same quarter up.
                let (half, quarter) = (projection.tile_width / 2.0, projection.tile_height / 2.0);
                let step = if along_y { (-half, -quarter) } else { (half, -quarter) };
                let anchor = ScreenPoint { x: ground.screen_x, y: ground.screen_y };
                for index in 0..cells {
                    let Some(band) =
                        footprint_band(
                            layout,
                            anchor,
                            step,
                            index,
                            cells,
                            BAND_BLEED,
                        )
                    else {
                        continue;
                    };
                    // Depth from the cell this band stands on, the same key the terrain and the
                    // player use. The band's own centre on screen was used here, which is as far
                    // above that cell as the artwork is tall: a tree then sorted a third of a
                    // tile further from the camera than its cell, so the player sharing that
                    // cell always came out in front of it however the layers were set. Keyed by
                    // the cell, the two tie and the layer decides.
                    let (cell_x, cell_y) = if along_y {
                        (x, y + f64::from(index))
                    } else {
                        (x + f64::from(index), y)
                    };
                    draws.push(SpriteDraw {
                        key: scene_key(
                            cell_x,
                            cell_y,
                            elevation,
                            ENTITY_LAYER,
                            projection.tile_height,
                        ),
                        frame,
                        layout,
                        band: (cells > 1).then_some(band),
                    });
                }
            }
        }

        // The player, standing on the ground it is over, raised by however far into a jump it
        // is. It joins the same list, so it passes behind what is in front of it instead of
        // being painted over the whole scene.
        //
        // Drawn from its exact position so that walking is smooth, but sorted by the column it
        // stands on, like the TypeScript client: a key built from the exact position puts the
        // player behind its own ground for the half of every cell where its position sits past
        // that cell's centre.
        // Its feet stand on the top it is actually drawn on: the plane of its column, lowered
        // by that top's inset (sand), raised by however far into a jump it is. The same sum as
        // `drawnFoot` in the TypeScript client's `player-view.ts`.
        let feet = player_feet(
            GridPoint { x: rp.x, y: rp.y },
            rp.elevation - rp.inset + rp.height,
            projection,
        );
        let column = get_player_column(GridPoint { x: rp.x, y: rp.y });
        let column_elevation = manager
            .column_at(column.x, column.y)
            .map_or(rp.elevation, |c| f64::from(c.elevation));
        match player_asset {
            Some(asset) => draws.push(SpriteDraw::whole(
                scene_key(
                    f64::from(column.x) + 0.5,
                    f64::from(column.y) + 0.5,
                    column_elevation,
                    player_layer(GridPoint { x: rp.x, y: rp.y }, column),
                    projection.tile_height,
                ),
                asset.frame,
                ink_layout(feet, asset.ink.scaled(PLAYER_SCALE), projection.tile_width),
            )),
            // A marker while the atlas has no measured player sprite, drawn straight away: it
            // is not a sprite, so it cannot go through the sorted list.
            None => draw_circle(feet.x as f32, feet.y as f32, 12.0, GOLD),
        }

        let after_collect = get_time();
        let sprites = draws.len();
        draw_sorted(&atlas, &mut draws);
        let after_draw = get_time();
        perf.push(FrameSample {
            frame_ms,
            simulation_ms: (after_simulation - frame_start) * 1000.0,
            scene_ms: (after_collect - after_simulation) * 1000.0,
            draw_ms: (after_draw - after_collect) * 1000.0,
            sprites,
            chunks: chunks_drawn,
            chunks_alive: manager.discovered_count(),
        });
        // The whole report, in the same shape as the TypeScript client's, for comparing the two.
        if is_key_pressed(KeyCode::P) {
            info!("{}", perf.summary());
        }

        // Push HUD update via the UI service.
        ui.push(UiEvent::HudUpdate {
            x: player.x,
            y: player.y,
            elevation,
            motion: format!("{:?}", player.motion),
            chunks: manager.discovered_count(),
        });

        // HUD.
        draw_rectangle(20.0, 20.0, 510.0, 80.0, Color::from_rgba(21, 29, 42, 205));
        draw_text("Armada Engine / Macroquad", 32.0, 58.0, 32.0, WHITE);
        draw_text(
            "WASD/Flechas | Espacio: saltar | Shift: correr | T: terreno | P: perf | F5: guardar",
            32.0,
            89.0,
            18.0,
            LIGHTGRAY,
        );
        draw_rectangle(
            20.0,
            height - 70.0,
            width - 40.0,
            48.0,
            Color::from_rgba(21, 29, 42, 205),
        );
        if let Some((x, y, elev, motion, chunks)) = &ui.hud {
            let text = format!(
                "Mundo: ({x:.2}, {y:.2}, {elev}) | {motion} | chunks: {chunks} | {fps} fps ({frame_ms:.1} ms)",
                fps = get_fps(),
                frame_ms = frame_ms,
            );
            draw_text(
                &text,
                32.0,
                height - 42.0,
                22.0,
                LIGHTGRAY,
            );
        }

        // Frame-time readout, top right. Percentiles over the window rather than an average:
        // a stutter is a handful of frames, and an average hides exactly those.
        let (_, frame_p95, frame_max) = perf.frame_ms();
        let (_, cpu_p95, _) = perf.cpu_ms();
        let readout_colour = if frame_max > 33.4 {
            RED
        } else if frame_max > 20.0 {
            ORANGE
        } else {
            LIME
        };
        draw_rectangle(width - 230.0, 20.0, 210.0, 92.0, Color::from_rgba(21, 29, 42, 205));
        draw_text(
            format!("{} fps", get_fps()),
            width - 218.0,
            46.0,
            28.0,
            readout_colour,
        );
        draw_text(
            format!("frame p95 {frame_p95:.1} max {frame_max:.1}"),
            width - 218.0,
            66.0,
            15.0,
            readout_colour,
        );
        draw_text(
            format!("cpu p95 {cpu_p95:.1} ms · {} caidos", perf.dropped()),
            width - 218.0,
            82.0,
            15.0,
            LIGHTGRAY,
        );
        // Where the worst frame of the window went: simulation, sprite list, drawing.
        let worst = perf.worst();
        draw_text(
            format!(
                "peor: sim {:.1} esc {:.1} dib {:.1}",
                worst.simulation_ms, worst.scene_ms, worst.draw_ms
            ),
            width - 218.0,
            98.0,
            15.0,
            LIGHTGRAY,
        );

        // Draw any UI messages.
        for (i, msg) in ui.messages.iter().enumerate() {
            draw_text(msg, 32.0, 120.0 + i as f32 * 20.0, 18.0, YELLOW);
        }
        ui.messages.clear();
        next_frame().await;
    }
}

fn screen_point(point: GridPoint, projection: ProjectionConfig) -> Vec2 {
    let screen = project_grid_point(point, projection);
    vec2(screen.x as f32, screen.y as f32)
}

fn draw_grid(projection: ProjectionConfig, centre: WorldCoord) {
    let color = Color::from_rgba(96, 142, 161, 130);
    for x in centre.x - 3..=centre.x + 2 {
        for y in centre.y - 3..=centre.y + 2 {
            let corner = screen_point(
                GridPoint {
                    x: x as f64,
                    y: y as f64,
                },
                projection,
            );
            let along_x = screen_point(
                GridPoint {
                    x: (x + 1) as f64,
                    y: y as f64,
                },
                projection,
            );
            let along_y = screen_point(
                GridPoint {
                    x: x as f64,
                    y: (y + 1) as f64,
                },
                projection,
            );
            draw_line(corner.x, corner.y, along_x.x, along_x.y, 1.0, color);
            draw_line(corner.x, corner.y, along_y.x, along_y.y, 1.0, color);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_feet_stay_at_their_terrain_column_centre() {
        let projection = ProjectionConfig {
            tile_width: 150.0,
            tile_height: 75.0,
            elevation_step: Some(50.0),
            origin_x: 400.0,
            origin_y: 300.0,
        };
        let position = GridPoint { x: 12.0, y: 7.0 };

        assert_eq!(
            player_feet(position, 0.0, projection),
            ScreenPoint { x: 775.0, y: -450.0 },
            "player feet use the same projected centre as their supporting terrain column"
        );
    }

    #[test]
    fn the_player_is_drawn_at_its_measured_artwork_scaled_about_its_feet() {
        // The manifest's box for `/assets/player/block.svg`, in tile widths.
        let ink = InkBox {
            x: -0.128_125,
            y: -0.278_809,
            width: 0.263_086,
            height: 0.332_91,
        };
        let feet = ScreenPoint { x: 400.0, y: 300.0 };

        let layout = ink_layout(feet, ink.scaled(PLAYER_SCALE), PREVIEW_TILE_WIDTH);

        // What the TypeScript client draws: the same box, three quarters of its measured size,
        // scaled about the ground point, so the figure stands on the middle of its tile.
        let expect = |value: f64| value * PLAYER_SCALE * PREVIEW_TILE_WIDTH;
        assert!((layout.x - (feet.x + expect(ink.x))).abs() < 1e-9);
        assert!((layout.y - (feet.y + expect(ink.y))).abs() < 1e-9);
        assert!((layout.width - expect(ink.width)).abs() < 1e-9);
        assert!((layout.height - expect(ink.height)).abs() < 1e-9);
        assert!(
            layout.width < PREVIEW_TILE_WIDTH,
            "the figure is narrower than the tile it stands on"
        );
    }

    #[test]
    fn the_player_and_what_stands_on_its_column_sort_by_the_same_point() {
        use armada_core::scene_order::compare_draw_keys;
        use terrain_view::blocks::TERRAIN_LAYER;

        let (x, y, elevation) = (12.5, 7.5, 2.0);
        let key = |layer| scene_key(x, y, elevation, layer, PREVIEW_TILE_HEIGHT);

        // All three are keyed by the same cell, so only the layer separates them: the entity
        // draws between the player's two layers whichever side of the cell it is on.
        let entity = key(ENTITY_LAYER);
        let behind = key(PLAYER_BEHIND_LAYER);
        let front = key(PLAYER_FRONT_LAYER);

        assert_eq!(behind.depth, entity.depth, "one cell is one depth");
        assert_eq!(
            compare_draw_keys(&behind, &entity),
            std::cmp::Ordering::Less,
            "walking along the back of the column it goes under the tree"
        );
        assert_eq!(
            compare_draw_keys(&front, &entity),
            std::cmp::Ordering::Greater,
            "along the front of the same column it goes over it"
        );

        // The ground of its own cell is under both, and the ground of the cell nearer the
        // camera is drawn after everything standing a row further away, so it hides it.
        let own_ground = key(TERRAIN_LAYER);
        let in_front = scene_key(x - 1.0, y, elevation, TERRAIN_LAYER, PREVIEW_TILE_HEIGHT);
        assert_eq!(
            compare_draw_keys(&own_ground, &behind),
            std::cmp::Ordering::Less,
            "the player stands on its column's top, not under it"
        );
        assert_eq!(
            compare_draw_keys(&in_front, &front),
            std::cmp::Ordering::Greater,
            "a terrain block nearer the camera covers the player behind it"
        );
    }

    #[test]
    fn the_player_stands_on_the_top_sand_is_drawn_at() {
        assert_eq!(
            preview_top_inset(TerrainMaterial::Sand),
            0.5,
            "sand's slab is drawn half a block under its cell, as `TERRAIN_APPEARANCE` says"
        );
        for material in [
            TerrainMaterial::Grass,
            TerrainMaterial::Ground,
            TerrainMaterial::Path,
            TerrainMaterial::Water,
        ] {
            assert_eq!(
                preview_top_inset(material),
                0.0,
                "every other material fills its block, so its top is its own plane"
            );
        }
    }

    #[test]
    fn the_player_passes_behind_what_stands_on_the_far_half_of_its_column() {
        let column = WorldCoord { x: 12, y: 7 };

        assert_eq!(
            player_layer(GridPoint { x: 12.3, y: 7.0 }, column),
            PLAYER_BEHIND_LAYER,
            "past the column's centre it is further from the camera than the tree on it"
        );
        assert_eq!(
            player_layer(GridPoint { x: 11.7, y: 7.0 }, column),
            PLAYER_FRONT_LAYER,
            "before the centre it is nearer the camera and covers what stands there"
        );
        assert_eq!(
            player_layer(GridPoint { x: 12.0, y: 7.0 }, column),
            PLAYER_FRONT_LAYER,
            "on the centre it stands in front, like the TypeScript client"
        );
        const {
            // The entities of a column are drawn between the player's two layers.
            assert!(PLAYER_BEHIND_LAYER < ENTITY_LAYER && ENTITY_LAYER < PLAYER_FRONT_LAYER);
        }
    }
}

