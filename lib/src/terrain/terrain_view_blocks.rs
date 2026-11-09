//! Terrain drawn with the atlas block sprites.

use iso::assets::{InkBox, SpriteFrame, ink_layout, terrain_sprite_source};
use iso::grid::WorldCoord;
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use iso::terrain::{TerrainColumn, TerrainMaterial};
use macroquad::prelude::{screen_height, screen_width};

use crate::assets::sprites::{ATLAS_TEXTURE, SpriteAtlas, SpriteDraw, ground_key};
use crate::terrain::terrain_view::{MATERIAL_SLOTS, MATERIALS, slot};
use crate::terrain::terrain_view_appearance::TerrainLook;

/// Terrain draws below everything that stands on it.
pub const TERRAIN_LAYER: i32 = 0;

/// How far below its surface a column is ever stacked. A column beside a deep sea trench would
const MAX_EXPOSED_BLOCKS: i32 = 10;

/// The atlas frame for each terrain material and where its artwork sits, resolved once at
pub struct TerrainFrames {
    frames: [Option<(SpriteFrame, InkBox)>; MATERIAL_SLOTS],
}

impl TerrainFrames {
    /// Resolves every material against the atlas. Returns the materials the atlas has no
    pub fn new(atlas: &SpriteAtlas) -> (Self, Vec<TerrainMaterial>) {
        let mut frames = [None; MATERIAL_SLOTS];
        let mut missing = Vec::new();
        for material in MATERIALS {
            match atlas
                .asset(terrain_sprite_source(material))
                .and_then(|asset| Some((asset.frame, asset.ink?)))
            {
                Some((frame, ink)) => frames[slot(material)] = Some((frame, ink)),
                None => missing.push(material),
            }
        }
        (Self { frames }, missing)
    }

    pub fn frame(&self, material: TerrainMaterial) -> Option<(SpriteFrame, InkBox)> {
        self.frames[slot(material)]
    }

    /// How far the artwork of any of these materials reaches above and below the ground it
    fn reach(&self, tile_width: f64) -> (f64, f64) {
        self.frames
            .iter()
            .flatten()
            .fold((0.0f64, 0.0f64), |(up, down), (_, ink)| {
                (
                    up.max(-ink.y * tile_width),
                    down.max((ink.y + ink.height) * tile_width),
                )
            })
    }
}

/// Queues the sprites for `columns`, which the caller sorts and draws with everything else.
pub fn collect_terrain_sprites(
    columns: &[TerrainColumn],
    projection: ProjectionConfig,
    frames: &TerrainFrames,
    look: &TerrainLook,
    height_at: impl Fn(WorldCoord) -> Option<i32>,
    out: &mut Vec<SpriteDraw>,
) {
    let step = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    let (screen_w, screen_h) = (f64::from(screen_width()), f64::from(screen_height()));
    let half_tile = projection.tile_width / 2.0;
    let (above, below) = frames.reach(projection.tile_width);
    let below = below + f64::from(MAX_EXPOSED_BLOCKS) * step;

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

        let in_front = [
            WorldCoord {
                x: column.coord.x,
                y: column.coord.y.saturating_sub(1),
            },
            WorldCoord {
                x: column.coord.x.saturating_sub(1),
                y: column.coord.y,
            },
            WorldCoord {
                x: column.coord.x.saturating_sub(1),
                y: column.coord.y.saturating_sub(1),
            },
        ];
        let floor = exposed_floor(column.elevation, in_front.into_iter().map(&height_at));

        for block in column.blocks_from(floor) {
            let Some((frame, ink)) = frames.frame(block.material) else {
                continue;
            };
            let (frame, ink) = match (block.elevation == column.elevation)
                .then(|| look.top(block.material, column.coord.x, column.coord.y))
                .flatten()
            {
                Some(top) => top,
                None => (frame, ink),
            };
            let tint = look.tint(block.material, column.coord.x, column.coord.y);
            let layout = ink_layout(
                ScreenPoint {
                    x: top.screen_x,
                    y: top.screen_y + f64::from(column.elevation - block.elevation + 1) * step,
                },
                ink,
                projection.tile_width,
            );
            if !SpriteAtlas::on_screen(layout) {
                continue;
            }
            let key = ground_key(
                centre.x,
                centre.y,
                f64::from(block.elevation),
                TERRAIN_LAYER,
                projection.tile_height,
            );
            out.push(SpriteDraw::tinted(key, ATLAS_TEXTURE, frame, layout, tint));
        }
    }
}

/// The lowest block of a column that still has to be drawn: as far down as the lowest of the
fn exposed_floor(elevation: i32, in_front: impl IntoIterator<Item = Option<i32>>) -> i32 {
    in_front
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(elevation)
        .clamp(elevation - MAX_EXPOSED_BLOCKS, elevation)
}

#[cfg(test)]
#[path = "terrain_view_blocks.test.rs"]
mod tests;
