//! Terrain drawn with the atlas block sprites.
//!
//! A column is one block sprite standing on the column in front of it. Where the ground drops
//! away, the column is stacked down past the lowest neighbour it is exposed to, so a cliff shows
//! a wall of blocks rather than one block floating over a gap. `TerrainColumn::material_at`
//! decides what each level is made of — dirt under a dry surface, water under water — so the
//! stack matches what the world says is there.

use armada_core::assets::{InkBox, SpriteFrame, ink_layout, terrain_sprite_source};
use armada_core::grid::WorldCoord;
use armada_core::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use armada_core::terrain::{AroundHeights, TerrainColumn, TerrainMaterial, top_is_flush};
use macroquad::prelude::{screen_height, screen_width};

use crate::sprites::{ATLAS_TEXTURE, SpriteAtlas, SpriteDraw, scene_key};

/// Terrain draws below everything that stands on it.
pub const TERRAIN_LAYER: i32 = 0;

/// How far below its surface a column is ever stacked. A column beside a deep sea trench would
/// otherwise queue a sprite per level of the drop, most of them off screen.
const MAX_EXPOSED_BLOCKS: i32 = 10;

/// The atlas frame for each terrain material and where its artwork sits, resolved once at
/// startup: the alternative is a hash lookup per drawn block, several hundred a frame.
pub struct TerrainFrames {
    frames: [Option<(SpriteFrame, InkBox, f64)>; 5],
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
            // Both or neither: a frame the pipeline never measured cannot be placed on the
            // ground, and guessing would put it half a tile out.
            match atlas
                .asset(terrain_sprite_source(material))
                // Drawn at the size it was drawn at, like every other sprite and like the
                // TypeScript client, which draws the block's whole template one tile wide. The
                // blocks are clay with rounded corners, so the drawing is about four percent
                // narrower than the tile it covers and a field of them shows a groove along
                // every edge — that groove is how both clients look. Stretching the drawing to
                // the tile instead closed the grooves but left every ground diamond two percent
                // oversized, and the tile in front of the player then painted that overshoot
                // over its feet.
                .and_then(|asset| Some((asset.frame, asset.ink?)))
            {
                Some((frame, ink)) => frames[slot(material)] = Some((frame, ink, 0.0)),
                None => missing.push(material),
            }
        }
        // How far a material's top face is drawn under the plane its elevation names, measured
        // against the tallest artwork there is so that the rounded corners every block has
        // cancel out. Sand is a shallow slab and the only one with any.
        let full_top = frames
            .iter()
            .flatten()
            .map(|(_, ink, _)| ink.y)
            .fold(f64::INFINITY, f64::min);
        for entry in frames.iter_mut().flatten() {
            entry.2 = (entry.1.y - full_top).max(0.0);
        }
        (Self { frames }, missing)
    }

    pub fn frame(&self, material: TerrainMaterial) -> Option<(SpriteFrame, InkBox, f64)> {
        self.frames[slot(material)]
    }

    /// How wide a material's top face is drawn, in tile widths, which is how wide the whole
    /// drawing is: a block's widest points are the left and right corners its top face shares
    /// with its sides.
    ///
    /// Blocks are clay with rounded corners and are drawn at the size they were drawn at, so a
    /// top face is a few percent narrower than the cell it stands on — sand, the shallowest
    /// slab, by about seven. Anything laid flat on that face has to be placed against the face
    /// and not the cell. One tile wide for a material the atlas never measured, which is the
    /// cell itself.
    pub fn top_width(&self, material: TerrainMaterial) -> f64 {
        self.frames[slot(material)].map_or(1.0, |(_, ink, _)| ink.width)
    }

    /// How far the artwork of any of these materials reaches above and below the ground it
    /// stands on, in screen pixels. The cull needs it: a column whose ground is just off the
    /// bottom of the screen still shows the block standing on it.
    fn reach(&self, tile_width: f64) -> (f64, f64) {
        self.frames
            .iter()
            .flatten()
            .fold((0.0f64, 0.0f64), |(up, down), (_, ink, sink)| {
                (
                    up.max((-ink.y + sink) * tile_width),
                    down.max((ink.y + ink.height) * tile_width),
                )
            })
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

        // The faces that can be seen are the ones towards the camera, where x and y decrease;
        // a column is exposed as far down as the lowest of those neighbours. **The diagonal
        // counts too**, which is what `COVERING_CELLS` says in TypeScript (`[-1, -1, 1]`):
        // where two columns of the same height meet a lower one across the corner, the corner
        // is open, and the blocks are clay with rounded corners, so nothing covers it. Left
        // out, a square of background showed at every such corner.
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

        // The second step of the shore terrace: a beach row standing against a step up keeps
        // its elevation and draws its top at its cell's plane, so what is left of the climb is
        // split into two smaller steps. The cost is four neighbour lookups, and only sand ever
        // pays them.
        let flush_top = column.surface == TerrainMaterial::Sand
            && top_is_flush(column.surface, column.elevation, around_heights(column, &height_at));

        for block in column.blocks_from(floor) {
            let Some((frame, ink, sink)) = frames.frame(block.material) else {
                continue;
            };
            let lift = drawn_lift(block.elevation, column, flush_top, sink, projection.tile_width);
            // A block stands on the top face of the block below it, which is `step` further
            // down the screen for each level below the column's own surface.
            let layout = ink_layout(
                ScreenPoint {
                    x: top.screen_x,
                    y: top.screen_y + f64::from(column.elevation - block.elevation + 1) * step
                        - lift,
                },
                ink,
                projection.tile_width,
            );
            if !SpriteAtlas::on_screen(layout) {
                continue;
            }
            let key = scene_key(
                centre.x,
                centre.y,
                f64::from(block.elevation),
                TERRAIN_LAYER,
                projection.tile_height,
            );
            if lift > 0.0 {
                // The lifted copy closes the join with the block above; this one, in the slab's
                // own place, still closes the join with whatever is below. They are the same
                // drawing, so the overlap paints the same pixels.
                out.push(SpriteDraw::whole(
                    key,
                    ATLAS_TEXTURE,
                    frame,
                    ink_layout(
                        ScreenPoint {
                            x: top.screen_x,
                            y: top.screen_y
                                + f64::from(column.elevation - block.elevation + 1) * step,
                        },
                        ink,
                        projection.tile_width,
                    ),
                ));
            }
            out.push(SpriteDraw::whole(key, ATLAS_TEXTURE, frame, layout));
        }
    }
}

/// The four orthogonal neighbours' elevations, for [`top_is_flush`].
fn around_heights(
    column: TerrainColumn,
    height_at: impl Fn(WorldCoord) -> Option<i32>,
) -> AroundHeights {
    [(1, 0), (-1, 0), (0, 1), (0, -1)].map(|(dx, dy)| {
        height_at(WorldCoord {
            x: column.coord.x.saturating_add(dx),
            y: column.coord.y.saturating_add(dy),
        })
    })
}

/// How far up a block is drawn from the plane it stands on, which is nothing at all unless its
/// top has to meet something: the block above it, or the step its column stands against.
///
/// Sand's artwork is a shallow slab, so along the left and right corners of a cell it covers only
/// its own body: two sand blocks stacked a level apart left a notch at each corner and the upper
/// one read as a plate floating over the one below. Lifted by the slab's `sink` — how far its top
/// face is drawn under its cell's plane — a buried slab's top meets the base of the block above it
/// exactly. A column's own top keeps the sunken top the material is drawn with, which is the
/// beach's look and what the player walks on, unless `flush_top` says this is the terrace row
/// against a step up ([`top_is_flush`]).
fn drawn_lift(
    elevation: i32,
    column: TerrainColumn,
    flush_top: bool,
    sink: f64,
    tile_width: f64,
) -> f64 {
    if elevation < column.elevation || flush_top {
        sink * tile_width
    } else {
        0.0
    }
}

/// The lowest block of a column that still has to be drawn: as far down as the lowest of the
/// columns in front of it, which is one block past the drop rather than level with it.
///
/// Past it, not level with it, because not every material's artwork fills a whole block (sand is
/// a shallow slab), so a stack that stopped at the neighbour's own surface left a wedge of
/// background showing at the foot of every cliff. On level ground the clamp makes this the one
/// surface block, so it costs nothing where nothing is exposed; an unknown neighbour (a chunk
/// still loading) counts as level ground rather than growing a wall.
fn exposed_floor(elevation: i32, in_front: impl IntoIterator<Item = Option<i32>>) -> i32 {
    in_front
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(elevation)
        .clamp(elevation - MAX_EXPOSED_BLOCKS, elevation)
}

#[cfg(test)]
#[path = "blocks.test.rs"]
mod tests;
