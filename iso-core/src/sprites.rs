//! Drawing atlas sprites.
//!
//! Every sprite the client draws comes out of one texture, so the whole scene — terrain,
//! entities and the player — is one batch of textured quads.

use armada_core::assets::{AssetManifest, InkBox, SpriteAnchor, SpriteFrame, SpriteLayout, ink_layout};
use armada_core::projection::ScreenPoint;
use armada_core::scene_order::{DrawKey, LengthAxis, compare_draw_keys, get_draw_depth};
use macroquad::prelude::*;
use std::collections::HashMap;

/// The rasterized atlas plus the lookup from an asset's source path to its frame.
///
/// Sprites are found by source path (`/assets/tree/block.svg`), which is exactly what a
/// blueprint's `asset.sprite` holds, so a blueprint and its artwork are joined by the same
/// string the pipeline rasterized. Guessing an entity's sprite from its id is what the first
/// version did, and it silently matched the wrong artwork whenever a blueprint and its file
/// were not named alike.
pub struct SpriteAtlas {
    texture: Texture2D,
    by_source: HashMap<String, SpriteAsset>,
}

/// What the manifest knows about one sprite: the pixels, and where they belong.
#[derive(Clone, Copy)]
pub struct SpriteAsset {
    pub frame: SpriteFrame,
    pub anchor: SpriteAnchor,
    /// The artwork's place in the world, for everything the pipeline could measure. Sprite
    /// sheets have none, and are placed by their anchor instead.
    pub ink: Option<InkBox>,
}

impl SpriteAtlas {
    pub fn new(texture: Texture2D, manifest: &AssetManifest) -> Self {
        let by_source = manifest
            .entries
            .iter()
            .filter_map(|entry| {
                Some((
                    entry.source.clone(),
                    SpriteAsset {
                        frame: entry.primary_frame()?,
                        anchor: entry.anchor,
                        ink: entry.ink,
                    },
                ))
            })
            .collect();
        Self { texture, by_source }
    }

    pub fn asset(&self, source: &str) -> Option<SpriteAsset> {
        self.by_source.get(source).copied()
    }

    /// Frame of the asset rasterized from `source`, or `None` if the atlas has no such asset.
    pub fn frame(&self, source: &str) -> Option<SpriteFrame> {
        self.by_source.get(source).map(|asset| asset.frame)
    }

    /// The manifest's anchor for an asset, as a fraction of its frame.
    ///
    /// Used for the sprites the pipeline could not measure, where the frame is all there is to
    /// go on. Everything else is placed by its [`InkBox`], which says where the artwork was
    /// drawn rather than where its pixels happen to sit in the atlas.
    pub fn anchor(&self, source: &str) -> Option<SpriteAnchor> {
        self.by_source.get(source).map(|asset| asset.anchor)
    }

    /// The frame for something standing on `ground` and the rectangle to draw it into, or
    /// `None` if the atlas has no such asset or the pipeline never measured it.
    pub fn standing(
        &self,
        source: &str,
        ground: ScreenPoint,
        tile_width: f64,
    ) -> Option<(SpriteFrame, SpriteLayout)> {
        let asset = self.by_source.get(source)?;
        Some((asset.frame, ink_layout(ground, asset.ink?, tile_width)))
    }

    /// Draws one frame into the square `layout` describes.
    pub fn draw(&self, frame: SpriteFrame, layout: SpriteLayout) {
        // Frames sit edge to edge in the atlas and some artwork reaches its frame's border, so
        // sampling the outermost half texel of a frame blends in the neighbouring sprite. Half
        // a texel in from every side keeps a block's edge clean at the cost of 1/256 of the
        // artwork, which is below a pixel on screen.
        const INSET: f32 = 0.5;
        draw_texture_ex(
            &self.texture,
            layout.x as f32,
            layout.y as f32,
            WHITE,
            DrawTextureParams {
                source: Some(Rect::new(
                    frame.x as f32 + INSET,
                    frame.y as f32 + INSET,
                    frame.width as f32 - INSET * 2.0,
                    frame.height as f32 - INSET * 2.0,
                )),
                dest_size: Some(vec2(layout.width as f32, layout.height as f32)),
                ..Default::default()
            },
        );
    }

    /// Whether `layout` would land anywhere on screen.
    pub fn on_screen(layout: SpriteLayout) -> bool {
        let (x, y) = (layout.x as f32, layout.y as f32);
        x + layout.width as f32 >= 0.0
            && y + layout.height as f32 >= 0.0
            && x <= screen_width()
            && y <= screen_height()
    }
}

/// Places `frame` at `size` along its longer side, so that its `anchor` lands on `at`.
///
/// This is the placement for a sprite drawn at a size the game chooses rather than the size the
/// artwork was drawn at. The player is the one: it is deliberately drawn at a fraction of a
/// tile, so its own measurements would make it twice the size the game wants it.
pub fn anchored(at: ScreenPoint, size: f64, anchor: SpriteAnchor, frame: SpriteFrame) -> SpriteLayout {
    let longest = f64::from(frame.width.max(frame.height).max(1));
    let width = size * f64::from(frame.width) / longest;
    let height = size * f64::from(frame.height) / longest;
    SpriteLayout {
        x: at.x - anchor.x * width,
        y: at.y - anchor.y * height,
        width,
        height,
    }
}

/// One sprite queued for this frame, with the key it sorts by.
///
/// Terrain, entities and the player all go into the same list, so one depth sort decides what
/// covers what. Drawing the terrain in a pass of its own, as the first version did, made every
/// entity draw over ground that is in front of it: a tree at the foot of a cliff was painted on
/// top of the cliff.
pub struct SpriteDraw {
    pub key: DrawKey,
    pub frame: SpriteFrame,
    pub layout: SpriteLayout,
}

/// Sorts the queued sprites far to near and draws them.
pub fn draw_sorted(atlas: &SpriteAtlas, draws: &mut [SpriteDraw]) {
    // A stable sort, so sprites that share a key keep the order they were queued in: that is
    // what stacks a column's own blocks bottom first.
    draws.sort_by(|a, b| compare_draw_keys(&a.key, &b.key));
    for draw in draws.iter() {
        atlas.draw(draw.frame, draw.layout);
    }
}

/// Depth key of something standing on the cell whose centre is `(x, y)`, at `elevation`.
///
/// Terrain and entities used to build this key from different coordinates — whole cell corners
/// for the ground, cell centres for the entities on it — which put every entity one row nearer
/// the camera than the ground it stands on. One helper, fed cell centres, keeps them on the
/// same scale; `layer` is the tie-break for things sharing a cell.
pub fn scene_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {
    DrawKey {
        depth: get_draw_depth(
            -(tile_height / 2.0) * (x + y),
            elevation,
            x,
            tile_height,
            0,
            LengthAxis::X,
        ),
        layer,
    }
}
