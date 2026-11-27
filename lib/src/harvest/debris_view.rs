//! How a gathered entity is shown going: its pieces, the ones it was assembled from, thrown apart
//! and falling over the spot where it stood. View state only: nothing here is saved or reaches
//! the simulation.
//!
//! What every piece does is `iso::debris` (the blast); this puts each piece's sprite (the same
//! clay render as the entities, `artifacts/vox/clay/vox_debris.py`) on the screen where the blast
//! has taken it, and keeps the clocks. The placing is pure and tested in `debris_view.test.rs`;
//! `DebrisView::collect` only turns it into draws.

use iso::debris::{Body, DEBRIS_MS, EntityParts, FALL_STEP, Floor, blast, look_at, model_to_grid};
use iso::grid::WorldCoord;
use iso::projection::{GridPoint, ProjectionConfig, ScreenPoint, project_block};
use iso::terrain::TerrainMaterial;
use macroquad::prelude::Color;

use crate::assets::sprites::{SpriteAtlas, SpriteDraw, scene_key};
use crate::game::config::ENTITY_LAYER;
use iso::assets::SpriteLayout;

/// Entities coming apart at once; the oldest gives way to a new one when they are all alive.
pub(crate) const MAX_BLASTS: usize = 6;

/// One piece, where it is in the scene at this moment.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Placed {
    /// The piece's sprite, `debris/p_<hash>`.
    pub(crate) sprite: String,
    /// Columns (x, y) of the piece's origin and blocks above sea level (the entity's base plus
    /// the piece's height).
    pub(crate) at: [f64; 3],
    /// Share of its size it is drawn at.
    pub(crate) scale: f64,
    pub(crate) alpha: f64,
}

/// What the piece finds under column `(x, y)`: the top of its terrain, or the water's surface.
pub(crate) fn floor_at(manager: &iso::world::ChunkManager, x: i32, y: i32) -> Option<Floor> {
    manager.column_at(x, y).map(|column| Floor {
        top: f64::from(column.elevation),
        water: column.surface == TerrainMaterial::Water,
    })
}

/// One entity coming apart.
#[derive(Clone, Debug)]
struct Blast {
    parts: EntityParts,
    /// Each piece in flight, by its index in `parts`, falling over the terrain.
    bodies: Vec<(usize, Body)>,
    /// Real milliseconds since it went.
    ms: f64,
    /// Milliseconds of the fall that have not been stepped yet.
    owed: f64,
}

/// The entities going apart.
#[derive(Clone, Debug, Default)]
pub(crate) struct DebrisView {
    blasts: Vec<Blast>,
}

impl Blast {
    /// Steps every piece's fall to catch up with the clock.
    fn fall(&mut self, ground: &dyn Fn(i32, i32) -> Option<Floor>) {
        let step_ms = FALL_STEP * 1000.0;
        while self.owed >= step_ms {
            self.owed -= step_ms;
            for (_, body) in &mut self.bodies {
                body.step(ground);
            }
        }
    }

    /// Every piece that is still there, put where its fall has taken it.
    fn placed(&self) -> Vec<Placed> {
        let Some((scale, alpha)) = look_at(self.ms) else {
            return Vec::new();
        };
        self.bodies
            .iter()
            .map(|(index, body)| {
                let part = &self.parts.parts[*index];
                // A wide piece's sprite was rendered moved off its foot: its foot goes back by that.
                let moved = model_to_grid(part.shift[0], part.shift[1]);
                Placed {
                    sprite: part.sprite.clone(),
                    at: [body.at[0] - moved.x, body.at[1] - moved.y, body.at[2]],
                    scale,
                    alpha,
                }
            })
            .collect()
    }
}

impl DebrisView {
    /// Starts the blast of an entity of `parts` that stood on the tile `anchor`, on the block
    /// `elevation`. `seed` scatters the pieces: the same one breaks the same way. The pieces
    /// listed in `kept` do not fade with the rest: they stay as the items to pick up.
    pub(crate) fn spawn(
        &mut self,
        parts: &EntityParts,
        anchor: WorldCoord,
        elevation: i32,
        seed: u64,
        kept: &[usize],
    ) {
        if self.blasts.len() >= MAX_BLASTS {
            self.blasts.remove(0);
        }
        let origin = [f64::from(anchor.x) + 0.5, f64::from(anchor.y) + 0.5];
        self.blasts.push(Blast {
            bodies: blast(parts, seed)
                .iter()
                .filter(|fragment| !kept.contains(&fragment.part))
                .map(|fragment| {
                    (
                        fragment.part,
                        Body::thrown(fragment, origin, f64::from(elevation)),
                    )
                })
                .collect(),
            parts: parts.clone(),
            ms: 0.0,
            owed: 0.0,
        });
    }

    /// Ages every blast by `elapsed_ms` of real time, lets its pieces fall over `ground` and drops
    /// the blasts that are over.
    pub(crate) fn advance(&mut self, elapsed_ms: f64, ground: &dyn Fn(i32, i32) -> Option<Floor>) {
        for blast in &mut self.blasts {
            let elapsed = elapsed_ms.max(0.0);
            blast.ms += elapsed;
            blast.owed += elapsed;
            blast.fall(ground);
        }
        self.blasts.retain(|blast| blast.ms < DEBRIS_MS);
    }

    /// How many entities are still coming apart.
    #[cfg(test)]
    pub(crate) fn live(&self) -> usize {
        self.blasts.len()
    }

    /// Queues every piece in flight into `draws`, each sorted where it is. A piece whose sprite
    /// the atlas does not have is skipped.
    pub(crate) fn collect(
        &self,
        projection: ProjectionConfig,
        atlas: &SpriteAtlas,
        draws: &mut Vec<SpriteDraw>,
    ) {
        for blast in &self.blasts {
            for placed in blast.placed() {
                let source = format!("/assets/{}.png", placed.sprite);
                let projected = project_block(
                    GridPoint {
                        x: placed.at[0],
                        y: placed.at[1],
                    },
                    placed.at[2],
                    projection,
                );
                let ground = ScreenPoint {
                    x: projected.screen_x,
                    y: projected.screen_y,
                };
                let Some((frame, layout)) = atlas.standing(&source, ground, projection.tile_width)
                else {
                    continue;
                };
                let layout = scaled_about(layout, ground, placed.scale);
                if !SpriteAtlas::on_screen(layout) {
                    continue;
                }
                let texture = atlas.asset(&source).map_or(0, |asset| asset.texture);
                let key = scene_key(
                    placed.at[0],
                    placed.at[1],
                    placed.at[2],
                    ENTITY_LAYER,
                    projection.tile_height,
                );
                draws.push(
                    SpriteDraw::whole(key, texture, frame, layout).tinted_by(Color::new(
                        1.0,
                        1.0,
                        1.0,
                        placed.alpha as f32,
                    )),
                );
            }
        }
    }
}

/// `layout` scaled by `scale` about the point `about`, so a shrinking piece stays on its spot.
pub(crate) fn scaled_about(layout: SpriteLayout, about: ScreenPoint, scale: f64) -> SpriteLayout {
    SpriteLayout {
        x: about.x + (layout.x - about.x) * scale,
        y: about.y + (layout.y - about.y) * scale,
        width: layout.width * scale,
        height: layout.height * scale,
    }
}

/// The columns where the piece at model voxels `(x, y)` lies, from the anchor's centre: a
/// convenience for tests of where a blast starts.
#[cfg(test)]
pub(crate) fn ground_of(x: f64, y: f64) -> GridPoint {
    model_to_grid(x, y)
}

#[cfg(test)]
#[path = "debris_view.test.rs"]
mod tests;
