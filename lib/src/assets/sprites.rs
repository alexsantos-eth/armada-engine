//! Drawing atlas sprites.

use iso::assets::{
    AssetEntry, AssetManifest, InkBox, SpriteBand, SpriteFrame, SpriteLayout, artwork_key,
    ink_layout,
};
use iso::lighting::ShadeGrid;
use iso::player::VoxelFaces;
use iso::projection::ScreenPoint;
use iso::scene_order::{CoverMask, DrawKey, LengthAxis, compare_draw_keys, get_draw_depth};
use macroquad::prelude::*;
use std::collections::HashMap;
use std::rc::Rc;

use crate::rendering::depth_of_field::{DepthFrame, DepthStamp};
use crate::rendering::scene_material::{Veil, vertex};

/// The shared atlas, which is the texture of everything that is not a sheet of player poses.
pub const ATLAS_TEXTURE: usize = 0;

/// The asset that is nothing but opaque white, for drawing flat colour out of the shared atlas.
pub const WHITE_PATCH: &str = "/assets/shadow/white.png";

/// The rasterized atlas plus the lookup from an asset to its frame, by [`artwork_key`].
pub struct SpriteAtlas {
    /// Every texture the manifest names, the shared atlas first.
    textures: Vec<Texture2D>,
    by_artwork: HashMap<String, SpriteAsset>,
    sheets: HashMap<String, SheetAsset>,
    /// The middle of [`WHITE_PATCH`] in the shared atlas, in texture coordinates.
    white: Option<(f32, f32)>,
    /// Where each sprite of the shared atlas is solid, by [`artwork_key`].
    masks: HashMap<String, CoverMask>,
    /// The one mesh every draw is built in: Macroquad copies its vertices into the batch, so
    /// the same buffers are cleared and filled again instead of allocated for each draw.
    scratch: Mesh,
    /// The depth the draw in hand writes, while the depth pass is drawing.
    stamp: Option<DepthStamp>,
}

/// What the manifest knows about one sprite: the pixels, and where they belong.
#[derive(Clone, Copy)]
pub struct SpriteAsset {
    pub frame: SpriteFrame,
    /// The artwork's place in the world, for everything the pipeline could measure. The few
    pub ink: Option<InkBox>,
    /// Which of the atlas's textures the frame is cut from.
    pub texture: usize,
}

/// A sheet of player poses: one texture, one row per facing and one column per pose.
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
    pub fn frame(&self, facing: usize, pose: usize) -> SpriteFrame {
        let (facing, pose) = (facing % self.rows, pose % self.columns);
        self.frames[facing * self.columns + pose]
    }

    /// How many poses a row holds.
    pub fn columns(&self) -> usize {
        self.columns
    }

    /// The names the artwork gives its columns, where it names them (a jump's phases); empty
    pub fn poses(&self) -> &[String] {
        &self.poses
    }
}

impl SpriteAtlas {
    /// Builds the lookup over the textures the manifest names: the shared atlas, and then the
    pub fn new(
        atlas: Texture2D,
        extra: Vec<(String, Texture2D)>,
        manifest: &AssetManifest,
    ) -> Self {
        let mut textures = vec![atlas];
        debug_assert_eq!(ATLAS_TEXTURE, 0, "the shared atlas is the first texture");
        let mut indices: HashMap<&str, usize> = HashMap::new();
        for (path, texture) in &extra {
            indices.insert(path.as_str(), textures.len());
            textures.push(texture.clone());
        }
        let index = |entry: &AssetEntry| match &entry.texture {
            Some(path) => indices.get(path.as_str()).copied(),
            None => Some(0),
        };
        let mut by_artwork = HashMap::new();
        let mut sheets = HashMap::new();
        for entry in &manifest.entries {
            let Some(texture) = index(entry) else {
                continue;
            };
            if let (Some(sheet), Some(frames)) = (&entry.sheet, &entry.frames)
                && let Some(ink) = entry.ink
            {
                sheets.insert(
                    artwork_key(&entry.source).to_owned(),
                    SheetAsset {
                        ink,
                        texture,
                        columns: sheet.columns as usize,
                        rows: sheet.rows as usize,
                        frames: frames.clone(),
                        poses: sheet.poses.clone(),
                    },
                );
            }
            if let Some(frame) = entry.primary_frame() {
                by_artwork.insert(
                    artwork_key(&entry.source).to_owned(),
                    SpriteAsset {
                        frame,
                        ink: entry.ink,
                        texture,
                    },
                );
            }
        }
        let white = by_artwork
            .get(artwork_key(WHITE_PATCH))
            .filter(|asset| asset.texture == ATLAS_TEXTURE)
            .map(|asset| {
                let texture = &textures[ATLAS_TEXTURE];
                (
                    (asset.frame.x as f32 + asset.frame.width as f32 / 2.0) / texture.width(),
                    (asset.frame.y as f32 + asset.frame.height as f32 / 2.0) / texture.height(),
                )
            });
        Self {
            textures,
            by_artwork,
            sheets,
            white,
            masks: HashMap::new(),
            stamp: None,
            scratch: Mesh {
                vertices: Vec::new(),
                indices: Vec::new(),
                texture: None,
            },
        }
    }

    /// Measures where every sprite of the shared atlas is solid, out of the atlas's own
    /// pixels: `width` by `height` of them, four bytes each, row by row.
    pub fn measure_cover(&mut self, width: u32, height: u32, rgba: &[u8]) {
        self.masks = cover_masks(
            self.by_artwork
                .iter()
                .filter(|(_, asset)| asset.texture == ATLAS_TEXTURE && asset.ink.is_some())
                .map(|(key, asset)| (key.as_str(), asset.frame)),
            width,
            height,
            rgba,
        );
    }

    /// Where the artwork of `source` is solid, if it was measured.
    pub fn cover_mask(&self, source: &str) -> Option<&CoverMask> {
        self.masks.get(artwork_key(source))
    }

    /// Whether the atlas carries [`WHITE_PATCH`]. Without it the shadows still draw, but each
    pub fn has_white_patch(&self) -> bool {
        self.white.is_some()
    }

    pub fn asset(&self, source: &str) -> Option<SpriteAsset> {
        self.by_artwork.get(artwork_key(source)).copied()
    }

    /// The sheet of poses at `source`, for the player's animations.
    pub fn sheet(&self, source: &str) -> Option<&SheetAsset> {
        self.sheets.get(artwork_key(source))
    }

    /// The frame for something standing on `ground` and the rectangle to draw it into, or
    pub fn standing(
        &self,
        source: &str,
        ground: ScreenPoint,
        tile_width: f64,
    ) -> Option<(SpriteFrame, SpriteLayout)> {
        let asset = self.by_artwork.get(artwork_key(source))?;
        Some((asset.frame, ink_layout(ground, asset.ink?, tile_width)))
    }

    /// The texture a draw names, or the shared atlas if it names one that is not loaded.
    fn texture(&self, index: usize) -> &Texture2D {
        self.textures.get(index).unwrap_or(&self.textures[0])
    }

    /// Clears the scratch mesh and points it at `texture`: a draw fills it and hands it to
    /// Macroquad, which copies its vertices into the batch, so the buffers outlive the draw.
    fn begin_mesh(&mut self, texture: Option<Texture2D>) -> &mut Mesh {
        let mesh = &mut self.scratch;
        mesh.vertices.clear();
        mesh.indices.clear();
        mesh.texture = texture;
        mesh
    }

    /// Draws one frame of `texture` into the rectangle `layout` describes, multiplied by `tint`.
    pub fn draw(&self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, tint: Color) {
        let source = self.source(frame);
        draw_texture_ex(
            self.texture(texture),
            layout.x as f32,
            layout.y as f32,
            tint,
            DrawTextureParams {
                source: Some(source),
                dest_size: Some(vec2(layout.width as f32, layout.height as f32)),
                ..Default::default()
            },
        );
    }

    /// Draws one frame of `texture` into the rectangle `layout` describes, multiplied by `tint`
    /// and thinned by `veil`: the whole sprite the player stands behind.
    pub fn draw_veiled(
        &mut self,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        tint: Color,
        veil: Veil,
    ) {
        let source = self.source(frame);
        let texture = self.texture(texture).clone();
        let (width, height) = (texture.width(), texture.height());
        let mesh = self.begin_mesh(Some(texture));
        for &(along, down) in [(0.0f32, 0.0f32), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)].iter() {
            mesh.vertices.push(veil.over(vertex(
                (
                    layout.x as f32 + along * layout.width as f32,
                    layout.y as f32 + down * layout.height as f32,
                ),
                (
                    (source.x + along * source.w) / width,
                    (source.y + down * source.h) / height,
                ),
                tint,
                (0.0, 0.0),
                crate::rendering::scene_material::SPRITE,
            )));
        }
        mesh.indices.extend_from_slice(&[0, 1, 2, 0, 2, 3]);
        self.submit();
    }

    /// Draws the part of a frame that falls inside `band`, which is a piece of the same
    /// artwork: one vertex per corner at the band's un-sheared read of it, fanned from the
    /// first corner.
    pub fn draw_band(
        &mut self,
        texture: usize,
        frame: SpriteFrame,
        band: &SpriteBand,
        shade: Option<&ShadeLattice>,
        veil: Veil,
    ) {
        let source = self.source(frame);
        let texture = self.texture(texture).clone();
        let (width, height) = (texture.width(), texture.height());
        let corners = band.corners();
        let uvs = band.uvs();
        let mesh = self.begin_mesh(Some(texture));
        for (&(x, y), &(along, down)) in corners.iter().zip(uvs.iter()) {
            let (along, down) = (along as f32, down as f32);
            let colour = match shade {
                None => WHITE,
                Some(shade) => {
                    let light = shade.light_in(along, down);
                    Color::new(light, light, light, 1.0)
                }
            };
            mesh.vertices.push(veil.over(vertex(
                (x as f32, y as f32),
                (
                    (source.x + along * source.w) / width,
                    (source.y + down * source.h) / height,
                ),
                colour,
                (0.0, 0.0),
                crate::rendering::scene_material::SPRITE,
            )));
        }
        for i in 1..corners.len() - 1 {
            mesh.indices.extend_from_slice(&[0, i as u16, i as u16 + 1]);
        }
        self.submit();
    }

    /// Draws one frame as a lattice of quads, each corner darkened by the shadows falling on it.
    /// Draws one frame of `texture` into the quad `corners` (clockwise from its top left), as
    /// one mesh: the artwork is carried along with the quad, so a leant or turned body keeps
    /// its own shape. `shade`, when there is one, darkens it corner by corner as
    /// [`Self::draw_shaded`] does; without one the artwork is drawn as it is.
    pub fn draw_quad(
        &mut self,
        texture: usize,
        frame: SpriteFrame,
        corners: &[(f64, f64); 4],
        shade: Option<&ShadeLattice>,
    ) {
        let source = self.source(frame);
        let texture = self.texture(texture).clone();
        let (width, height) = (texture.width(), texture.height());
        let (columns, rows) = shade.map_or((1, 1), |shade| (shade.columns, shade.rows));
        let mesh = self.begin_mesh(Some(texture));
        for row in 0..=rows {
            let down = f64::from(row) / f64::from(rows);
            for column in 0..=columns {
                let along = f64::from(column) / f64::from(columns);
                let top = (
                    corners[0].0 + (corners[1].0 - corners[0].0) * along,
                    corners[0].1 + (corners[1].1 - corners[0].1) * along,
                );
                let bottom = (
                    corners[3].0 + (corners[2].0 - corners[3].0) * along,
                    corners[3].1 + (corners[2].1 - corners[3].1) * along,
                );
                let light = shade.map_or(1.0, |shade| shade.light_at(column, row));
                mesh.vertices.push(vertex(
                    (
                        (top.0 + (bottom.0 - top.0) * down) as f32,
                        (top.1 + (bottom.1 - top.1) * down) as f32,
                    ),
                    (
                        (source.x + along as f32 * source.w) / width,
                        (source.y + down as f32 * source.h) / height,
                    ),
                    Color::new(light, light, light, 1.0),
                    (0.0, 0.0),
                    crate::rendering::scene_material::SPRITE,
                ));
            }
        }
        for row in 0..rows {
            for column in 0..columns {
                let corner = (row * (columns + 1) + column) as u16;
                let next = corner + columns as u16 + 1;
                mesh.indices.extend_from_slice(&[
                    corner,
                    corner + 1,
                    next + 1,
                    corner,
                    next + 1,
                    next,
                ]);
            }
        }
        self.submit();
    }

    pub fn draw_shaded(
        &mut self,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        (shade, tint): (&ShadeLattice, Color),
        veil: Veil,
    ) {
        let source = self.source(frame);
        let texture = self.texture(texture).clone();
        let (width, height) = (texture.width(), texture.height());
        let (columns, rows) = (shade.columns, shade.rows);
        let mesh = self.begin_mesh(Some(texture));
        for row in 0..=rows {
            let down = f32::from(row as u16) / rows as f32;
            for column in 0..=columns {
                let along = f32::from(column as u16) / columns as f32;
                let light = shade.light_at(column, row);
                mesh.vertices.push(veil.over(vertex(
                    (
                        layout.x as f32 + along * layout.width as f32,
                        layout.y as f32 + down * layout.height as f32,
                    ),
                    (
                        (source.x + along * source.w) / width,
                        (source.y + down * source.h) / height,
                    ),
                    Color::new(light * tint.r, light * tint.g, light * tint.b, 1.0),
                    (0.0, 0.0),
                    crate::rendering::scene_material::SPRITE,
                )));
            }
        }
        for row in 0..rows {
            for column in 0..columns {
                let corner = (row * (columns + 1) + column) as u16;
                let next = corner + columns as u16 + 1;
                mesh.indices.extend_from_slice(&[
                    corner,
                    corner + 1,
                    next + 1,
                    corner,
                    next + 1,
                    next,
                ]);
            }
        }
        self.submit();
    }

    /// Draws a shadow over the flat quad `corners`: a lattice of black, as opaque at each
    pub fn draw_face_shadow(
        &mut self,
        corners: &[(f64, f64); 4],
        shade: &ShadeLattice,
        opacity: f32,
    ) {
        let (columns, rows) = (shade.columns, shade.rows);
        let (u, v) = self.white.unwrap_or((0.0, 0.0));
        let texture = self.white.map(|_| self.textures[ATLAS_TEXTURE].clone());
        let mesh = self.begin_mesh(texture);
        for row in 0..=rows {
            let down = f64::from(row) / f64::from(rows);
            for column in 0..=columns {
                let along = f64::from(column) / f64::from(columns);
                let top = (
                    corners[0].0 + (corners[1].0 - corners[0].0) * along,
                    corners[0].1 + (corners[1].1 - corners[0].1) * along,
                );
                let bottom = (
                    corners[3].0 + (corners[2].0 - corners[3].0) * along,
                    corners[3].1 + (corners[2].1 - corners[3].1) * along,
                );
                let alpha = (1.0 - shade.light_at(column, row)) * opacity;
                mesh.vertices.push(vertex(
                    (
                        (top.0 + (bottom.0 - top.0) * down) as f32,
                        (top.1 + (bottom.1 - top.1) * down) as f32,
                    ),
                    (u, v),
                    Color::new(0.0, 0.0, 0.0, alpha),
                    (0.0, 0.0),
                    crate::rendering::scene_material::SPRITE,
                ));
            }
        }
        for row in 0..rows {
            for column in 0..columns {
                let corner = (row * (columns + 1) + column) as u16;
                let next = corner + columns as u16 + 1;
                mesh.indices.extend_from_slice(&[
                    corner,
                    corner + 1,
                    next + 1,
                    corner,
                    next + 1,
                    next,
                ]);
            }
        }
        self.submit();
    }

    /// Draws one voxel of dust: its three visible faces in flat colour, as one mesh.
    pub fn draw_voxel(&mut self, faces: &VoxelFaces, colours: &[Color; 3]) {
        let (u, v) = self.white.unwrap_or((0.0, 0.0));
        let texture = self.white.map(|_| self.textures[ATLAS_TEXTURE].clone());
        let mesh = self.begin_mesh(texture);
        for (face, colour) in [faces.top, faces.left, faces.right].iter().zip(colours) {
            let corner = mesh.vertices.len() as u16;
            for point in face {
                mesh.vertices.push(vertex(
                    (point.0 as f32, point.1 as f32),
                    (u, v),
                    *colour,
                    (0.0, 0.0),
                    crate::rendering::scene_material::SPRITE,
                ));
            }
            mesh.indices.extend_from_slice(&[
                corner,
                corner + 1,
                corner + 2,
                corner,
                corner + 2,
                corner + 3,
            ]);
        }
        self.submit();
    }

    /// Draws the shadow baked on a column's top face: one quad, shaded by the shadow atlas.
    pub fn draw_ground_shadow(
        &mut self,
        corners: &[(f64, f64); 4],
        map_uv: &[(f32, f32); 4],
        opacity: f32,
    ) {
        let white = self.white.unwrap_or((0.0, 0.0));
        let colour = Color::new(0.0, 0.0, 0.0, opacity);
        let texture = self.textures[ATLAS_TEXTURE].clone();
        let mesh = self.begin_mesh(Some(texture));
        for corner in 0..4 {
            let (x, y) = corners[corner];
            mesh.vertices.push(vertex(
                (x as f32, y as f32),
                white,
                colour,
                map_uv[corner],
                crate::rendering::scene_material::SHADOW,
            ));
        }
        mesh.indices.extend_from_slice(&[0, 1, 2, 0, 2, 3]);
        self.submit();
    }

    /// Draws a sprite's artwork as the water shows it: the polygon `points` on a water top, each
    /// read at its own `uv`.
    pub fn draw_reflection(
        &mut self,
        texture: usize,
        frame: SpriteFrame,
        points: &[(f64, f64)],
        uv: &[(f64, f64)],
        colour: Color,
    ) {
        self.draw_polygon(texture, frame, points, uv, colour);
    }

    /// Draws `frame`'s artwork over the convex polygon `points`, each corner reading it at the
    fn draw_polygon(
        &mut self,
        texture: usize,
        frame: SpriteFrame,
        points: &[(f64, f64)],
        uv: &[(f64, f64)],
        colour: Color,
    ) {
        if points.len() < 3 || points.len() != uv.len() {
            return;
        }
        let source = self.source(frame);
        let texture = self.texture(texture).clone();
        let (width, height) = (texture.width(), texture.height());
        let mesh = self.begin_mesh(Some(texture));
        for (point, read) in points.iter().zip(uv) {
            mesh.vertices.push(vertex(
                (point.0 as f32, point.1 as f32),
                (
                    (source.x + read.0 as f32 * source.w) / width,
                    (source.y + read.1 as f32 * source.h) / height,
                ),
                colour,
                (0.0, 0.0),
                crate::rendering::scene_material::SPRITE,
            ));
        }
        for corner in 1..points.len() - 1 {
            let corner = corner as u16;
            mesh.indices.extend_from_slice(&[0, corner, corner + 1]);
        }
        self.submit();
    }

    /// Draws the clipped fan of a ground ellipse using the atlas scratch mesh.
    pub fn draw_ground_ellipse(
        &mut self,
        triangles: &[[crate::player::shadow_clip::ShadowVertex; 3]],
    ) {
        if triangles.is_empty() {
            return;
        }
        let mesh = self.begin_mesh(None);
        for triangle in triangles {
            for &((x, y), alpha) in triangle {
                mesh.vertices.push(Vertex::new(
                    x as f32,
                    y as f32,
                    0.0,
                    0.0,
                    0.0,
                    Color::new(0.0, 0.0, 0.0, alpha),
                ));
                mesh.indices.push((mesh.vertices.len() - 1) as u16);
            }
        }
        self.submit();
    }

    /// Hands the scratch mesh to Macroquad; during the depth pass every vertex first carries
    /// the depth stamp of the draw instead of its colour.
    fn submit(&mut self) {
        if let Some(stamp) = self.stamp {
            for vertex in &mut self.scratch.vertices {
                stamp.over(vertex);
            }
        }
        draw_mesh(&self.scratch);
    }

    /// The frame's pixels in the atlas, pulled in by half a texel on every side.
    fn source(&self, frame: SpriteFrame) -> Rect {
        const INSET: f32 = 0.5;
        Rect::new(
            frame.x as f32 + INSET,
            frame.y as f32 + INSET,
            frame.width as f32 - INSET * 2.0,
            frame.height as f32 - INSET * 2.0,
        )
    }

    /// Whether `layout` would land anywhere within `screen`.
    pub fn on_screen_in(layout: SpriteLayout, screen: (f32, f32)) -> bool {
        let (x, y) = (layout.x as f32, layout.y as f32);
        x + layout.width as f32 >= 0.0
            && y + layout.height as f32 >= 0.0
            && x <= screen.0
            && y <= screen.1
    }

    /// Whether `layout` would land anywhere on screen.
    pub fn on_screen(layout: SpriteLayout) -> bool {
        Self::on_screen_in(layout, (screen_width(), screen_height()))
    }
}

/// The mask of each of `frames`, read from an image `width` by `height` pixels of four bytes.
/// A frame that reaches outside the image gets no mask.
pub(crate) fn cover_masks<'a>(
    frames: impl Iterator<Item = (&'a str, SpriteFrame)>,
    width: u32,
    height: u32,
    rgba: &[u8],
) -> HashMap<String, CoverMask> {
    if rgba.len() < width as usize * height as usize * 4 {
        return HashMap::new();
    }
    frames
        .filter(|(_, frame)| {
            frame.x.saturating_add(frame.width) <= width
                && frame.y.saturating_add(frame.height) <= height
        })
        .map(|(key, frame)| {
            let mask = CoverMask::from_alpha(frame.width, frame.height, |x, y| {
                let pixel = (frame.y + y) as usize * width as usize + (frame.x + x) as usize;
                rgba[pixel * 4 + 3]
            });
            (key.to_owned(), mask)
        })
        .collect()
}

/// How dark each corner of a lattice over a sprite is: the shadows falling on it.
#[derive(Clone, Debug)]
pub struct ShadeLattice {
    columns: u32,
    rows: u32,
    /// One factor to multiply the artwork by per corner, row by row from its top left.
    light: Vec<f32>,
}

impl ShadeLattice {
    /// The lattice that draws `grid` faded by `fade`: a corner shaded `v` keeps `1 − v · fade`
    /// of its colour, so `0.0` lifts every corner to lit and `1.0` keeps the grid's own shadows.
    /// The whole lattice is built in this one pass, without a second copy to scale.
    pub fn faded(grid: &ShadeGrid, fade: f32) -> Self {
        let fade = fade.clamp(0.0, 1.0);
        let (columns, rows) = (grid.columns(), grid.rows());
        let mut light = Vec::with_capacity(((columns + 1) * (rows + 1)) as usize);
        for row in 0..=rows {
            for column in 0..=columns {
                light.push((1.0 - grid.at(column, row) * fade).clamp(0.0, 1.0));
            }
        }
        Self {
            columns,
            rows,
            light,
        }
    }

    /// A lattice straight from coverage values, row by row, for a surface that has no artwork
    pub fn from_coverage(columns: u32, rows: u32, coverage: Vec<f32>) -> Self {
        let light = coverage
            .into_iter()
            .map(|value| (1.0 - value).clamp(0.0, 1.0))
            .collect();
        Self {
            columns,
            rows,
            light,
        }
    }

    /// The light `along` across the lattice and `down` it, both in `[0, 1]`, read between the
    pub(crate) fn light_in(&self, along: f32, down: f32) -> f32 {
        let place = |value: f32, count: u32| {
            let scaled = (value.clamp(0.0, 1.0)) * count as f32;
            let first = (scaled.floor() as u32).min(count.saturating_sub(1));
            (first, scaled - first as f32)
        };
        let (column, tx) = place(along, self.columns);
        let (row, ty) = place(down, self.rows);
        let top = self.light_at(column, row)
            + (self.light_at(column + 1, row) - self.light_at(column, row)) * tx;
        let bottom = self.light_at(column, row + 1)
            + (self.light_at(column + 1, row + 1) - self.light_at(column, row + 1)) * tx;
        top + (bottom - top) * ty
    }

    fn light_at(&self, column: u32, row: u32) -> f32 {
        self.light[(row * (self.columns + 1) + column) as usize]
    }
}

/// What one queued draw puts on screen.
pub enum DrawKind {
    /// An atlas sprite, whole or cut to the band of its footprint standing on one cell.
    Sprite {
        /// Which of the atlas's textures the frame is cut from; `0` is the shared atlas.
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        /// The piece of the drawing this draw shows, for a sprite cut up across its footprint;
        band: Option<SpriteBand>,
        /// What the artwork is multiplied by: the colour zone the ground stands in, or [`WHITE`]
        tint: Color,
        /// How much of itself it keeps: below `1.0` while the player stands behind it.
        opacity: f32,
    },
    /// An atlas sprite drawn as a lattice, darkened by the shadows falling on it.
    Shaded {
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        shade: Rc<ShadeLattice>,
        /// The piece of the drawing this draw shows, as in [`DrawKind::Sprite`].
        band: Option<SpriteBand>,
        /// What the lit artwork is multiplied by; a band ignores it.
        tint: Color,
        /// How much of itself it keeps, as in [`DrawKind::Sprite`].
        opacity: f32,
    },
    /// A sprite drawn into a quad of its own instead of an upright rectangle: the player's
    /// body, leant into where it walks or turned over while it flies.
    Leaning {
        texture: usize,
        frame: SpriteFrame,
        corners: [(f64, f64); 4],
        /// The shadows falling on it, if any fall.
        shade: Option<Rc<ShadeLattice>>,
    },
    /// The baked shadow on a column's top face: the flat quad of its own cell, shaded from the
    GroundShadow {
        /// The quad's four corners on screen, from the one towards the camera, clockwise.
        corners: [(f64, f64); 4],
        /// Where each of those corners reads the shadow atlas.
        map_uv: [(f32, f32); 4],
        /// How dark the shadow is drawn: the lighting phase's own opacity.
        opacity: f32,
    },
    /// What the water shows of one sprite, on one cell of water: the artwork again, cut to that
    Reflection {
        texture: usize,
        frame: SpriteFrame,
        /// The piece on screen, convex, as a fan from its first corner.
        points: Vec<(f64, f64)>,
        /// Where each of those corners reads the artwork, in `[0, 1]`.
        uv: Vec<(f64, f64)>,
        /// The tint and opacity the water lays over what it mirrors.
        colour: Color,
    },
    /// One voxel of a puff of the player's dust: three flat-coloured faces of a small block.
    Voxel {
        /// Where the voxel's faces are on screen, from [`iso::player::voxel_faces`] offset to
        faces: VoxelFaces,
        /// The colour of the top, the left face and the right face, each already the voxel's
        colours: [Color; 3],
    },
    /// The baked shadow on one exposed vertical face of the ground.
    FaceShadow {
        /// The quad's four corners on screen, from the one towards the camera, clockwise.
        corners: [(f64, f64); 4],
        shade: Rc<ShadeLattice>,
        /// How dark the shadow is drawn: the lighting phase's own opacity.
        opacity: f32,
    },
    /// A soft cast shadow on the ground: a fan fading from a dark core to a transparent rim,
    /// sheared onto the screen by `shear`, cut to the top faces it may land on.
    GroundEllipse {
        centre: ScreenPoint,
        width: f64,
        height: f64,
        /// The caster's own alpha at the core; the rim always fades to zero.
        alpha: f32,
        /// The screen-space anisotropy of the unsheared ground blob.
        shear: [[f64; 2]; 2],
        /// The top faces of the cells at the blob's own level: where it may show. Empty means
        /// no ground was found at that level and the full blob paints, as a fallback.
        clip: Vec<[(f64, f64); 4]>,
    },
}

/// One sprite queued for this frame, with the key it sorts by.
pub struct SpriteDraw {
    pub key: DrawKey,
    /// What depth of field reads this draw at: see [`Focus`].
    pub focus: Focus,
    pub kind: DrawKind,
}

/// How the depth-of-field pass places a draw in depth, so the blur follows the isometric
/// depth (the cell's `x + y`, the same coordinate the draws sort by) and not the height on
/// screen: everything standing on one cell is exactly as sharp as that cell's ground.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Focus {
    /// Something upright on its cell (an entity or a building's band): the whole
    /// artwork reads at its key's depth, so the crown of a tall tree is as sharp as its trunk.
    Standing,
    /// A player sprite whose visible pixels always bypass the depth blur.
    Player,
    /// A block of terrain whose column's top face is at `top`: each pixel of that face reads
    /// at the ground it shows, so a flat field blurs as a smooth gradient and not tile by tile;
    /// the sides below it read at the cell's near corner.
    Surface { top: f64 },
}

impl SpriteDraw {
    /// A sprite drawn whole, which is everything standing on a single cell.
    pub fn whole(key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout) -> Self {
        Self::tinted(key, texture, frame, layout, WHITE)
    }

    /// This draw read as a block of terrain whose column tops out at `top`; see [`Focus`].
    pub fn on_surface(mut self, top: f64) -> Self {
        self.focus = Focus::Surface { top };
        self
    }

    /// A sprite drawn whole and multiplied by `tint`: a block of ground in a colour zone.
    pub fn tinted(
        key: DrawKey,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        tint: Color,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::Sprite {
                texture,
                frame,
                layout,
                band: None,
                tint,
                opacity: 1.0,
            },
        }
    }

    /// The same draw keeping `opacity` of itself: an entity's sprite the player stands behind.
    /// Only sprites thin out; every other kind of draw is returned as it is.
    pub fn see_through(mut self, opacity: f32) -> Self {
        if let DrawKind::Sprite { opacity: own, .. } | DrawKind::Shaded { opacity: own, .. } =
            &mut self.kind
        {
            *own = opacity;
        }
        self
    }

    /// The same draw multiplied by `tint`: a character's own coat. Only a sprite drawn whole,
    /// lit or shaded, takes it; every other kind of draw is returned as it is.
    pub fn tinted_by(mut self, tint: Color) -> Self {
        if let DrawKind::Sprite { tint: own, .. } | DrawKind::Shaded { tint: own, .. } =
            &mut self.kind
        {
            *own = tint;
        }
        self
    }

    /// One band of a sprite whose footprint covers several cells.
    pub fn band(
        key: DrawKey,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        band: Option<SpriteBand>,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::Sprite {
                texture,
                frame,
                layout,
                band,
                tint: WHITE,
                opacity: 1.0,
            },
        }
    }

    /// A sprite darkened by the shadows falling on it.
    pub fn shaded(
        key: DrawKey,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        shade: Rc<ShadeLattice>,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::Shaded {
                texture,
                frame,
                layout,
                shade,
                band: None,
                tint: WHITE,
                opacity: 1.0,
            },
        }
    }

    /// One band of a sprite that spans several cells, darkened by the shadows falling on it.
    /// A sprite drawn into the quad `corners` (clockwise from its top left), shaded or not.
    pub fn leaning(
        key: DrawKey,
        texture: usize,
        frame: SpriteFrame,
        corners: [(f64, f64); 4],
        shade: Option<Rc<ShadeLattice>>,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::Leaning {
                texture,
                frame,
                corners,
                shade,
            },
        }
    }

    pub fn shaded_band(
        key: DrawKey,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        shade: Rc<ShadeLattice>,
        band: SpriteBand,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::Shaded {
                texture,
                frame,
                layout,
                shade,
                band: Some(band),
                tint: WHITE,
                opacity: 1.0,
            },
        }
    }

    /// The shadow baked on a column's top face, read from the shadow atlas.
    pub fn ground_shadow(
        key: DrawKey,
        corners: [(f64, f64); 4],
        map_uv: [(f32, f32); 4],
        opacity: f32,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::GroundShadow {
                corners,
                map_uv,
                opacity,
            },
        }
    }

    /// One water cell's share of what the water mirrors.
    pub fn reflection(
        key: DrawKey,
        texture: usize,
        frame: SpriteFrame,
        points: Vec<(f64, f64)>,
        uv: Vec<(f64, f64)>,
        colour: Color,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::Reflection {
                texture,
                frame,
                points,
                uv,
                colour,
            },
        }
    }

    /// One voxel of a puff of the player's dust.
    pub fn voxel(key: DrawKey, faces: VoxelFaces, colours: [Color; 3]) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::Voxel { faces, colours },
        }
    }

    /// A shadow on one exposed vertical face of the ground.
    pub fn face_shadow(
        key: DrawKey,
        corners: [(f64, f64); 4],
        shade: Rc<ShadeLattice>,
        opacity: f32,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::FaceShadow {
                corners,
                shade,
                opacity,
            },
        }
    }

    /// A soft cast shadow on the ground: a core fading to a transparent rim, sheared by `shear`
    /// and cut to the top faces of the cells it may land on. An empty `clip` paints it whole.
    pub fn ground_ellipse(
        key: DrawKey,
        centre: ScreenPoint,
        width: f64,
        height: f64,
        alpha: f32,
        shear: [[f64; 2]; 2],
        clip: Vec<[(f64, f64); 4]>,
    ) -> Self {
        Self {
            key,
            focus: Focus::Standing,
            kind: DrawKind::GroundEllipse {
                centre,
                width,
                height,
                alpha,
                shear,
                clip,
            },
        }
    }
}

/// Sorts the queued sprites far to near and draws them, with `material` bound throughout.
pub fn draw_sorted(
    atlas: &mut SpriteAtlas,
    material: Option<&crate::rendering::scene_material::SceneMaterial>,
    draws: &mut [SpriteDraw],
) {
    if let Some(material) = material {
        material.bind();
    }
    draw_queue(atlas, draws, material.is_some());
    if let Some(material) = material {
        material.release();
    }
}

/// Redraws the sorted `draws` as depths for the depth of field, with the depth material bound
/// by the caller: only what is solid and stands in the scene, never a shadow, a reflection or
/// a sprite the player is seen through.
pub fn draw_depth(atlas: &mut SpriteAtlas, draws: &[SpriteDraw], frame: &DepthFrame) {
    let plain = Veil::of(1.0, false);
    for draw in draws {
        atlas.stamp = Some(frame.stamp(draw.key, draw.focus));
        match &draw.kind {
            DrawKind::Shaded {
                texture,
                frame,
                band: None,
                layout,
                shade,
                ..
            } if draw.focus == Focus::Player => {
                atlas.draw_shaded(*texture, *frame, *layout, (shade.as_ref(), WHITE), plain);
            }
            DrawKind::Sprite {
                texture,
                frame,
                band,
                layout,
                opacity,
                ..
            }
            | DrawKind::Shaded {
                texture,
                frame,
                band,
                layout,
                opacity,
                ..
            } if *opacity >= 1.0 => match band {
                Some(band) => atlas.draw_band(*texture, *frame, band, None, plain),
                None => atlas.draw_veiled(*texture, *frame, *layout, WHITE, plain),
            },
            DrawKind::Leaning {
                texture,
                frame,
                corners,
                ..
            } => atlas.draw_quad(*texture, *frame, corners, None),
            DrawKind::Voxel { faces, colours } => atlas.draw_voxel(faces, colours),
            _ => {}
        }
    }
    atlas.stamp = None;
}

fn draw_queue(atlas: &mut SpriteAtlas, draws: &mut [SpriteDraw], dithered: bool) {
    draws.sort_by(|a, b| compare_draw_keys(&a.key, &b.key));
    for draw in draws.iter() {
        match &draw.kind {
            DrawKind::Sprite {
                texture,
                frame,
                band: Some(band),
                opacity,
                ..
            } => {
                atlas.draw_band(*texture, *frame, band, None, Veil::of(*opacity, dithered));
            }
            DrawKind::Sprite {
                texture,
                frame,
                layout,
                band: None,
                tint,
                opacity,
            } => {
                if *opacity < 1.0 || draw.focus == Focus::Player {
                    atlas.draw_veiled(
                        *texture,
                        *frame,
                        *layout,
                        *tint,
                        Veil::of(*opacity, dithered),
                    );
                } else {
                    atlas.draw(*texture, *frame, *layout, *tint);
                }
            }
            DrawKind::Shaded {
                texture,
                frame,
                shade,
                band: Some(band),
                opacity,
                ..
            } => {
                atlas.draw_band(
                    *texture,
                    *frame,
                    band,
                    Some(shade.as_ref()),
                    Veil::of(*opacity, dithered),
                );
            }
            DrawKind::Shaded {
                texture,
                frame,
                layout,
                shade,
                band: None,
                tint,
                opacity,
            } => {
                atlas.draw_shaded(
                    *texture,
                    *frame,
                    *layout,
                    (shade.as_ref(), *tint),
                    Veil::of(*opacity, dithered),
                );
            }
            DrawKind::Leaning {
                texture,
                frame,
                corners,
                shade,
            } => {
                atlas.draw_quad(*texture, *frame, corners, shade.as_deref());
            }
            DrawKind::GroundShadow {
                corners,
                map_uv,
                opacity,
            } => {
                atlas.draw_ground_shadow(corners, map_uv, *opacity);
            }
            DrawKind::Reflection {
                texture,
                frame,
                points,
                uv,
                colour,
            } => {
                atlas.draw_reflection(*texture, *frame, points, uv, *colour);
            }
            DrawKind::Voxel { faces, colours } => {
                atlas.draw_voxel(faces, colours);
            }
            DrawKind::FaceShadow {
                corners,
                shade,
                opacity,
            } => {
                atlas.draw_face_shadow(corners, shade, *opacity);
            }
            DrawKind::GroundEllipse {
                centre,
                width,
                height,
                alpha,
                shear,
                clip,
            } => {
                let triangles = crate::player::shadow_clip::cast_pieces(
                    *centre, *width, *height, *shear, *alpha, clip, 20,
                );
                atlas.draw_ground_ellipse(&triangles);
            }
        }
    }
}

/// Depth key of something standing on the cell whose centre is `(x, y)`, at `elevation`.
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

/// Depth key of a cell's surface: the terrain itself, and what is painted onto it — a baked
pub fn ground_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {
    let key = scene_key(x, y, elevation, layer, tile_height);
    DrawKey {
        depth: key.depth - tile_height / 2.0,
        ..key
    }
}

#[cfg(test)]
#[path = "sprites.test.rs"]
mod tests;
