//! Drawing atlas sprites.
//!
//! Terrain and entities come out of one texture, so the ground and everything standing on it is
//! one batch of textured quads. The player's poses do not: a sheet is 8 facings by up to 9
//! poses, and packing one into the shared atlas as a single sprite left a pose about sixteen
//! pixels across, so each sheet has a texture of its own and the manifest says which. Every
//! sprite therefore carries the texture it is cut from as well as its frame.

use armada_core::assets::{
    AssetEntry, AssetManifest, InkBox, SpriteBand, SpriteFrame, SpriteLayout, ink_layout,
};
use armada_core::projection::ScreenPoint;
use armada_core::scene_order::{DrawKey, LengthAxis, compare_draw_keys, get_draw_depth};
use macroquad::prelude::*;
use std::collections::HashMap;

/// The shared atlas, which is the texture of everything that is not a sheet of player poses.
pub const ATLAS_TEXTURE: usize = 0;

/// The rasterized atlas plus the lookup from an asset's source path to its frame.
///
/// Sprites are found by source path (`/assets/tree/block.svg`), which is exactly what a
/// blueprint's `asset.sprite` holds, so a blueprint and its artwork are joined by the same
/// string the pipeline rasterized. Guessing an entity's sprite from its id is what the first
/// version did, and it silently matched the wrong artwork whenever a blueprint and its file
/// were not named alike.
pub struct SpriteAtlas {
    /// Every texture the manifest names, the shared atlas first.
    textures: Vec<Texture2D>,
    by_source: HashMap<String, SpriteAsset>,
    sheets: HashMap<String, SheetAsset>,
}

/// What the manifest knows about one sprite: the pixels, and where they belong.
#[derive(Clone, Copy)]
pub struct SpriteAsset {
    pub frame: SpriteFrame,
    /// The artwork's place in the world, for everything the pipeline could measure. The few
    /// assets it cannot measure (the multi-asset sheets) have none and are not drawn.
    pub ink: Option<InkBox>,
    /// Which of the atlas's textures the frame is cut from.
    pub texture: usize,
}

/// A sheet of player poses: one texture, one row per facing and one column per pose.
///
/// Every cell is the same window on the character's template, so the whole sheet shares one
/// [`InkBox`]: the poses move inside that window and the window stays on the player's spot,
/// which is what keeps a walking figure from sliding about as its pose changes.
#[derive(Clone)]
pub struct SheetAsset {
    pub ink: InkBox,
    pub texture: usize,
    columns: usize,
    rows: usize,
    frames: Vec<SpriteFrame>,
    poses: Vec<String>,
}

impl SheetAsset {
    /// The frame of pose `pose` in `facing`'s row, with both wrapped into the grid: an
    /// animation that runs past the last pose shows the first again rather than nothing.
    pub fn frame(&self, facing: usize, pose: usize) -> SpriteFrame {
        let (facing, pose) = (facing % self.rows, pose % self.columns);
        self.frames[facing * self.columns + pose]
    }

    /// How many poses a row holds.
    pub fn columns(&self) -> usize {
        self.columns
    }

    /// The names the artwork gives its columns, where it names them (a jump's phases); empty
    /// for a numbered cycle.
    pub fn poses(&self) -> &[String] {
        &self.poses
    }
}

impl SpriteAtlas {
    /// Builds the lookup over the textures the manifest names: the shared atlas, and then the
    /// sheet textures in `extra`, each under the path the manifest gave it.
    pub fn new(atlas: Texture2D, extra: Vec<(String, Texture2D)>, manifest: &AssetManifest) -> Self {
        let mut textures = vec![atlas];
        debug_assert_eq!(ATLAS_TEXTURE, 0, "the shared atlas is the first texture");
        let mut indices: HashMap<&str, usize> = HashMap::new();
        for (path, texture) in &extra {
            indices.insert(path.as_str(), textures.len());
            textures.push(texture.clone());
        }
        let index = |entry: &AssetEntry| match &entry.texture {
            // A sheet whose texture never loaded would otherwise be cut out of the atlas, which
            // draws a corner of the terrain over the player.
            Some(path) => indices.get(path.as_str()).copied(),
            None => Some(0),
        };
        let mut by_source = HashMap::new();
        let mut sheets = HashMap::new();
        for entry in &manifest.entries {
            let Some(texture) = index(entry) else {
                continue;
            };
            if let (Some(sheet), Some(frames)) = (&entry.sheet, &entry.frames)
                && let Some(ink) = entry.ink
            {
                sheets.insert(entry.source.clone(), SheetAsset {
                    ink,
                    texture,
                    columns: sheet.columns as usize,
                    rows: sheet.rows as usize,
                    frames: frames.clone(),
                    poses: sheet.poses.clone(),
                });
            }
            if let Some(frame) = entry.primary_frame() {
                by_source.insert(entry.source.clone(), SpriteAsset {
                    frame,
                    ink: entry.ink,
                    texture,
                });
            }
        }
        Self { textures, by_source, sheets }
    }

    pub fn asset(&self, source: &str) -> Option<SpriteAsset> {
        self.by_source.get(source).copied()
    }

    /// The sheet of poses at `source`, for the player's animations.
    pub fn sheet(&self, source: &str) -> Option<&SheetAsset> {
        self.sheets.get(source)
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

    /// The texture a draw names, or the shared atlas if it names one that is not loaded.
    fn texture(&self, index: usize) -> &Texture2D {
        self.textures.get(index).unwrap_or(&self.textures[0])
    }

    /// Draws one frame of `texture` into the rectangle `layout` describes.
    pub fn draw(&self, texture: usize, frame: SpriteFrame, layout: SpriteLayout) {
        let source = self.source(frame);
        draw_texture_ex(
            self.texture(texture),
            layout.x as f32,
            layout.y as f32,
            WHITE,
            DrawTextureParams {
                source: Some(source),
                dest_size: Some(vec2(layout.width as f32, layout.height as f32)),
                ..Default::default()
            },
        );
    }

    /// Draws the part of a frame that falls inside `band`, which is a piece of the same
    /// rectangle `layout` describes.
    ///
    /// The artwork maps linearly onto that rectangle, so each corner of the band samples the
    /// frame at its own position within it — the band is a window on the drawing, never a
    /// squeezed copy of it.
    pub fn draw_band(&self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, band: &SpriteBand) {
        let source = self.source(frame);
        let texture = self.texture(texture);
        let (width, height) = (texture.width(), texture.height());
        let corners = band.corners();
        let vertices: Vec<Vertex> = corners
            .iter()
            .map(|&(x, y)| {
                let along = ((x - layout.x) / layout.width) as f32;
                let down = ((y - layout.y) / layout.height) as f32;
                Vertex::new(
                    x as f32,
                    y as f32,
                    0.0,
                    (source.x + along * source.w) / width,
                    (source.y + down * source.h) / height,
                    WHITE,
                )
            })
            .collect();
        // A fan: the band is convex, so every triangle from its first corner lies inside it.
        let mut indices = Vec::with_capacity((corners.len() - 2) * 3);
        for i in 1..corners.len() - 1 {
            indices.extend_from_slice(&[0, i as u16, i as u16 + 1]);
        }
        draw_mesh(&Mesh {
            vertices,
            indices,
            texture: Some(texture.clone()),
        });
    }

    /// The frame's pixels in the atlas, pulled in by half a texel on every side.
    ///
    /// Frames sit edge to edge in the atlas and some artwork reaches its frame's border, so
    /// sampling the outermost half texel of a frame blends in the neighbouring sprite. Half a
    /// texel in keeps a block's edge clean at the cost of 1/256 of the artwork, which is below
    /// a pixel on screen.
    fn source(&self, frame: SpriteFrame) -> Rect {
        const INSET: f32 = 0.5;
        Rect::new(
            frame.x as f32 + INSET,
            frame.y as f32 + INSET,
            frame.width as f32 - INSET * 2.0,
            frame.height as f32 - INSET * 2.0,
        )
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

/// One sprite queued for this frame, with the key it sorts by.
///
/// Terrain, entities and the player all go into the same list, so one depth sort decides what
/// covers what. Drawing the terrain in a pass of its own, as the first version did, made every
/// entity draw over ground that is in front of it: a tree at the foot of a cliff was painted on
/// top of the cliff.
pub struct SpriteDraw {
    pub key: DrawKey,
    /// Which of the atlas's textures the frame is cut from; `0` is the shared atlas.
    pub texture: usize,
    pub frame: SpriteFrame,
    pub layout: SpriteLayout,
    /// The piece of the drawing this draw shows, for a sprite cut up across its footprint;
    /// `None` for everything drawn in one piece.
    pub band: Option<SpriteBand>,
}

impl SpriteDraw {
    /// A sprite drawn whole, which is everything standing on a single cell.
    pub fn whole(key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout) -> Self {
        Self { key, texture, frame, layout, band: None }
    }
}

/// Sorts the queued sprites far to near and draws them.
pub fn draw_sorted(atlas: &SpriteAtlas, draws: &mut [SpriteDraw]) {
    // A stable sort, so sprites that share a key keep the order they were queued in: that is
    // what stacks a column's own blocks bottom first.
    draws.sort_by(|a, b| compare_draw_keys(&a.key, &b.key));
    for draw in draws.iter() {
        match &draw.band {
            Some(band) => atlas.draw_band(draw.texture, draw.frame, draw.layout, band),
            None => atlas.draw(draw.texture, draw.frame, draw.layout),
        }
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
