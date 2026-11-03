//! Terrain drawn with the atlas block sprites.
//!
//! A column is one block sprite standing on the column in front of it. Where the ground drops
//! away, the column is stacked down to the lowest neighbour it is exposed to, so a cliff shows
//! a wall of blocks rather than one block floating over a gap. `TerrainColumn::material_at`
//! decides what each level is made of — dirt under a dry surface, water under water — so the
//! stack matches what the world says is there.

use armada_core::assets::{SpriteFrame, sprite_layout, terrain_sprite_source};
use armada_core::entities::EntityLengthAxis;
use armada_core::grid::WorldCoord;
use armada_core::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use armada_core::terrain::{TerrainColumn, TerrainMaterial};
use macroquad::prelude::{screen_height, screen_width};

use crate::sprites::{SpriteAtlas, SpriteDraw, scene_key};

/// Terrain draws below everything that stands on it.
pub const TERRAIN_LAYER: i32 = 0;

/// How far below its surface a column is ever stacked. A column beside a deep sea trench would
/// otherwise queue a sprite per level of the drop, most of them off screen.
const MAX_EXPOSED_BLOCKS: i32 = 10;

/// The atlas frame for each terrain material, resolved once at startup.
pub struct TerrainFrames {
    frames: [Option<SpriteFrame>; 5],
}

fn slot(material: TerrainMaterial) -> usize {
    match material {
        TerrainMaterial::Water => 0,
        TerrainMaterial::Sand => 1,
        TerrainMaterial::Ground => 2,
        TerrainMaterial::Grass => 3,
        TerrainMaterial::Path => 4,
    }
}

impl TerrainFrames {
    /// Resolves every material against the atlas. Returns the materials the atlas has no
    /// artwork for, so the client can say so instead of drawing invisible ground.
    pub fn new(atlas: &SpriteAtlas) -> (Self, Vec<TerrainMaterial>) {
        let materials = [
            TerrainMaterial::Water,
            TerrainMaterial::Sand,
            TerrainMaterial::Ground,
            TerrainMaterial::Grass,
            TerrainMaterial::Path,
        ];
        let mut frames = [None; 5];
        let mut missing = Vec::new();
        for material in materials {
            match atlas.frame(terrain_sprite_source(material)) {
                Some(frame) => frames[slot(material)] = Some(frame),
                None => missing.push(material),
            }
        }
        (Self { frames }, missing)
    }

    pub fn frame(&self, material: TerrainMaterial) -> Option<SpriteFrame> {
        self.frames[slot(material)]
    }
}

/// Queues the sprites for `columns`, which the caller sorts and draws with everything else.
///
/// `height_at` answers for any column, loaded or not; an unknown neighbour counts as level
/// ground, which is what keeps a chunk edge from growing a wall while the next chunk loads.
pub fn collect_terrain_sprites(
    columns: &[TerrainColumn],
    projection: ProjectionConfig,
    frames: &TerrainFrames,
    height_at: impl Fn(WorldCoord) -> Option<i32>,
    out: &mut Vec<SpriteDraw>,
) {
    let step = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    // Chunks are culled against the camera, but a chunk is 32x32 columns and only a fraction of
    // one is ever on screen: a frame walks ~12 000 columns of which ~600 are visible. So the
    // projected point is tested against these bounds before anything else is computed — the two
    // neighbour lookups per column alone cost over a millisecond a frame when every column paid
    // for them.
    let (screen_w, screen_h) = (f64::from(screen_width()), f64::from(screen_height()));
    let half_tile = projection.tile_width / 2.0;
    let above = projection.tile_height / 2.0;
    let below = f64::from(MAX_EXPOSED_BLOCKS + 1) * step + projection.tile_height / 2.0;

    for &column in columns {
        let centre = GridPoint {
            x: f64::from(column.coord.x) + 0.5,
            y: f64::from(column.coord.y) + 0.5,
        };
        let top = project_block(centre, f64::from(column.elevation), projection);
        if top.screen_x + half_tile < 0.0
            || top.screen_x - half_tile > screen_w
            || top.screen_y + below < 0.0
            || top.screen_y - above > screen_h
        {
            continue;
        }

        // The two faces that can be seen are the ones towards the camera, where x and y
        // decrease; a column is exposed as far down as the lower of those neighbours.
        let in_front = [
            WorldCoord {
                x: column.coord.x,
                y: column.coord.y.saturating_sub(1),
            },
            WorldCoord {
                x: column.coord.x.saturating_sub(1),
                y: column.coord.y,
            },
        ];
        let exposed_to = in_front
            .into_iter()
            .filter_map(&height_at)
            .min()
            .unwrap_or(column.elevation);
        let floor = (exposed_to + 1).clamp(column.elevation - MAX_EXPOSED_BLOCKS, column.elevation);

        for block in column.blocks_from(floor) {
            let Some(frame) = frames.frame(block.material) else {
                continue;
            };
            // A block stands on the top face of the block below it, which is `step` further
            // down the screen for each level below the column's own surface.
            let layout = sprite_layout(
                ScreenPoint {
                    x: top.screen_x,
                    y: top.screen_y + f64::from(column.elevation - block.elevation + 1) * step,
                },
                1,
                1,
                EntityLengthAxis::X,
                projection,
            );
            if !SpriteAtlas::on_screen(layout) {
                continue;
            }
            out.push(SpriteDraw {
                key: scene_key(
                    centre.x,
                    centre.y,
                    f64::from(block.elevation),
                    TERRAIN_LAYER,
                    projection.tile_height,
                ),
                frame,
                layout,
            });
        }
    }
}
