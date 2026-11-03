//! Drawing atlas sprites.
//!
//! Every sprite the client draws comes out of one texture, so the whole scene — terrain,
//! entities and the player — is one batch of textured quads.

use armada_core::assets::{AssetManifest, SpriteAnchor, SpriteFrame, SpriteLayout};
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
    by_source: HashMap<String, (SpriteFrame, SpriteAnchor)>,
}

impl SpriteAtlas {
    pub fn new(texture: Texture2D, manifest: &AssetManifest) -> Self {
        let by_source = manifest
            .entries
            .iter()
            .filter_map(|entry| Some((entry.source.clone(), (entry.primary_frame()?, entry.anchor))))
            .collect();
        Self { texture, by_source }
    }

    /// Frame of the asset rasterized from `source`, or `None` if the atlas has no such asset.
    pub fn frame(&self, source: &str) -> Option<SpriteFrame> {
        self.by_source.get(source).map(|(frame, _)| *frame)
    }

    /// The manifest's anchor for an asset, as a fraction of its frame.
    ///
    /// This is only meaningful for artwork that fills its frame: the rasterizer fits each
    /// drawing into a square and centres it, so for anything else the padding around the
    /// drawing is part of what the anchor points at. Block artwork is placed from the world
    /// instead, by [`armada_core::assets::sprite_layout`].
    pub fn anchor(&self, source: &str) -> Option<SpriteAnchor> {
        self.by_source.get(source).map(|(_, anchor)| *anchor)
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
                dest_size: Some(vec2(layout.size as f32, layout.size as f32)),
                ..Default::default()
            },
        );
    }

    /// Whether `layout` would land anywhere on screen.
    pub fn on_screen(layout: SpriteLayout) -> bool {
        let (x, y, size) = (layout.x as f32, layout.y as f32, layout.size as f32);
        x + size >= 0.0 && y + size >= 0.0 && x <= screen_width() && y <= screen_height()
    }
}

/// Places a square frame of `size` so that its `anchor` lands on `at`.
///
/// For artwork that fills its frame this is the whole placement rule, and it is what the
/// manifest's anchor is for. The player is drawn this way: its drawing is square rather than
/// the two-diamond block template, so the template would stand it half a tile too low, where
/// the column in front of it paints over everything but its head.
pub fn anchored(at: ScreenPoint, size: f64, anchor: SpriteAnchor) -> SpriteLayout {
    SpriteLayout {
        x: at.x - anchor.x * size,
        y: at.y - anchor.y * size,
        size,
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
