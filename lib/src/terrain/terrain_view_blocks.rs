//! Terrain drawn with the atlas block sprites.

use iso::assets::{
    InkBox, SpriteFrame, SpriteLayout, ink_layout, terrain_reflection_source, terrain_sprite_source,
};
use iso::grid::WorldCoord;
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use iso::terrain::{TerrainColumn, TerrainMaterial};

use crate::assets::sprites::{ATLAS_TEXTURE, SpriteAtlas, SpriteDraw, ground_key};
use crate::terrain::terrain_view::{MATERIAL_SLOTS, MATERIALS, slot};
use crate::terrain::terrain_view_appearance::TerrainLook;
use crate::water::reflection_view::{Reflected, WaterCell, collect_reflection};

/// Terrain draws below everything that stands on it.
pub const TERRAIN_LAYER: i32 = 0;

/// How far below its surface a column is ever stacked. A column beside a deep sea trench would
const MAX_EXPOSED_BLOCKS: i32 = 10;

/// The atlas frame for each terrain material and where its artwork sits, resolved once at
pub struct TerrainFrames {
    frames: [Option<(SpriteFrame, InkBox)>; MATERIAL_SLOTS],
    reflections: [Option<(SpriteFrame, InkBox)>; MATERIAL_SLOTS],
}

impl TerrainFrames {
    /// Resolves every material against the atlas. Returns the materials missing artwork —
    /// the blocks themselves first, their reflection sprites second.
    pub fn new(atlas: &SpriteAtlas) -> (Self, Vec<TerrainMaterial>, Vec<TerrainMaterial>) {
        let mut frames = [None; MATERIAL_SLOTS];
        let mut reflections = [None; MATERIAL_SLOTS];
        let mut missing = Vec::new();
        let mut missing_reflections = Vec::new();
        for material in MATERIALS {
            match atlas
                .asset(terrain_sprite_source(material))
                .and_then(|asset| Some((asset.frame, asset.ink?)))
            {
                Some((frame, ink)) => frames[slot(material)] = Some((frame, ink)),
                None => missing.push(material),
            }
            match terrain_reflection_source(material)
                .and_then(|source| atlas.asset(source))
                .and_then(|asset| Some((asset.frame, asset.ink?)))
            {
                Some((frame, ink)) => reflections[slot(material)] = Some((frame, ink)),
                None => missing_reflections.push(material),
            }
        }
        (
            Self {
                frames,
                reflections,
            },
            missing,
            missing_reflections,
        )
    }

    pub fn frame(&self, material: TerrainMaterial) -> Option<(SpriteFrame, InkBox)> {
        self.frames[slot(material)]
    }

    /// The reflection sprite the water draws of `material`, hung from the waterline under it.
    pub fn reflection(&self, material: TerrainMaterial) -> Option<(SpriteFrame, InkBox)> {
        self.reflections[slot(material)]
    }

    /// Frames for every material, one plain block each, for tests. The reflection hangs one
    /// elevation step below the anchor, as the shipped reflection art does.
    #[cfg(test)]
    pub(crate) fn for_test() -> Self {
        let frame = SpriteFrame {
            x: 0,
            y: 0,
            width: 32,
            height: 32,
        };
        let block = InkBox {
            x: -0.5,
            y: -1.0,
            width: 1.0,
            height: 1.0,
        };
        let reflection = InkBox {
            x: -0.5,
            y: 0.0,
            width: 1.0,
            height: iso::assets::SVG_BLOCK_HEIGHT / iso::assets::SVG_TILE_WIDTH,
        };
        Self {
            frames: [Some((frame, block)); MATERIAL_SLOTS],
            reflections: [Some((frame, reflection)); MATERIAL_SLOTS],
        }
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

/// One queued terrain reflection, flushed after every column has been laid. On a water
/// cell shared by two blocks, the piece of the block further away queues first, so the
/// block in front paints over its sliver.
struct ReflectionJob {
    /// Depth of the casting block on the view axis: larger `coord.x + coord.y` is further
    /// back.
    depth: i32,
    frame: SpriteFrame,
    layout: SpriteLayout,
    feet: ScreenPoint,
    level: f64,
}

/// Queues the sprites for `columns`, which the caller sorts and draws with everything else.
/// Each block above the water also queues what the water shows of it, cut to the water cells
/// it falls on. `screen` is the window size the culling tests each block's layout against.
#[allow(clippy::too_many_arguments)]
pub fn collect_terrain_sprites(
    columns: &[TerrainColumn],
    projection: ProjectionConfig,
    frames: &TerrainFrames,
    look: &TerrainLook,
    height_at: impl Fn(WorldCoord) -> Option<i32>,
    water_at: impl Fn(i32, i32) -> Option<WaterCell>,
    screen: (f64, f64),
    out: &mut Vec<SpriteDraw>,
) {
    let step = projection
        .elevation_step
        .unwrap_or(projection.tile_height / 2.0);
    let (screen_w, screen_h) = screen;
    let half_tile = projection.tile_width / 2.0;
    let (above, below) = frames.reach(projection.tile_width);
    let below = below + f64::from(MAX_EXPOSED_BLOCKS) * step;
    let mut reflection_jobs = Vec::new();

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

        let water_level = [
            (column.coord.x, column.coord.y.saturating_sub(1)),
            (column.coord.x.saturating_sub(1), column.coord.y),
            (
                column.coord.x.saturating_sub(1),
                column.coord.y.saturating_sub(1),
            ),
            (column.coord.x, column.coord.y.saturating_add(1)),
            (column.coord.x.saturating_add(1), column.coord.y),
            (
                column.coord.x.saturating_add(1),
                column.coord.y.saturating_add(1),
            ),
            (
                column.coord.x.saturating_sub(1),
                column.coord.y.saturating_add(1),
            ),
        ]
        .into_iter()
        .find_map(|(x, y)| water_at(x, y).map(|cell| cell.level))
        .filter(|_| column.surface != TerrainMaterial::Water);
        let flank_y = height_at(WorldCoord {
            x: column.coord.x,
            y: column.coord.y.saturating_sub(1),
        });
        let flank_x = height_at(WorldCoord {
            x: column.coord.x.saturating_sub(1),
            y: column.coord.y,
        });
        let across = height_at(WorldCoord {
            x: column.coord.x.saturating_sub(1),
            y: column.coord.y.saturating_sub(1),
        });
        let water_line = water_level.map(|level| project_block(centre, level, projection).screen_y);
        let floor = exposed_floor(column.elevation, [flank_y, flank_x, across]);
        let flank = [flank_y, flank_x];
        let mut above_water = 0i32;

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
            let anchor = ScreenPoint {
                x: top.screen_x,
                y: top.screen_y + f64::from(column.elevation - block.elevation + 1) * step,
            };
            let layout = ink_layout(anchor, ink, projection.tile_width);
            if !SpriteAtlas::on_screen_in(layout, (screen_w as f32, screen_h as f32)) {
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
            if let (Some(level), Some(water_line)) = (water_level, water_line) {
                let block_level = f64::from(block.elevation);
                let walled_in = flank
                    .iter()
                    .all(|flank| flank.is_some_and(|height| height >= block.elevation));
                if block_level > level
                    && !walled_in
                    && let Some((reflection_frame, reflection_ink)) =
                        frames.reflection(block.material)
                {
                    let feet = ScreenPoint {
                        x: top.screen_x,
                        y: water_line + f64::from(above_water) * step,
                    };
                    reflection_jobs.push(ReflectionJob {
                        depth: column.coord.x + column.coord.y,
                        frame: reflection_frame,
                        layout: ink_layout(feet, reflection_ink, projection.tile_width),
                        feet,
                        level: block_level,
                    });
                    above_water += 1;
                }
            }
        }
    }
    reflection_jobs.sort_by_key(|job| std::cmp::Reverse(job.depth));
    for job in reflection_jobs {
        collect_reflection(
            ATLAS_TEXTURE,
            job.frame,
            job.layout,
            job.feet,
            job.level,
            0.0,
            Reflected::AsDrawn,
            projection,
            &water_at,
            out,
        );
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
