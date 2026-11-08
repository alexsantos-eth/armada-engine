//! Drawing atlas sprites.
//!
//! Terrain and entities come out of one texture, so the ground and everything standing on it is
//! one batch of textured quads. The player's poses do not: a sheet is 8 facings by up to 9
//! poses, and packing one into the shared atlas as a single sprite left a pose about sixteen
//! pixels across, so each sheet has a texture of its own and the manifest says which. Every
//! sprite therefore carries the texture it is cut from as well as its frame.

use iso::assets::{
    AssetEntry, AssetManifest, InkBox, SpriteBand, SpriteFrame, SpriteLayout, ink_layout,
};
use iso::lighting::ShadeGrid;
use iso::player::VoxelFaces;
use iso::projection::ScreenPoint;
use iso::scene_order::{DrawKey, LengthAxis, compare_draw_keys, get_draw_depth};
use macroquad::prelude::*;
use std::collections::HashMap;
use std::rc::Rc;

use crate::rendering::scene_material::vertex;

/// The shared atlas, which is the texture of everything that is not a sheet of player poses.
pub const ATLAS_TEXTURE: usize = 0;

/// The asset that is nothing but opaque white, for drawing flat colour out of the shared atlas.
///
/// A shadow is flat black at a per-corner alpha and needs no artwork, so the obvious thing is a
/// mesh with no texture. But Macroquad starts a new draw call whenever the bound texture
/// changes, and a shadow sits between the block it lies on and the next one: every shadow cost
/// two draw calls, and a scene that used to be one batch became a hundred and thirty. Sampling
/// one white texel of the atlas instead leaves the texture alone, so the shadows go into the
/// same batch as the ground they fall on. `artifacts` has no generator for it: it is a plain
/// white square (`web/public/assets/shadow/white.svg`).
///
/// The shadows on the ground no longer need it — they read the shadow atlas through
/// [`crate::scene_material`] and ignore their own texture coordinate — but the shadows on the
/// ground's vertical faces still do, because a face's shading is worked out at its corners and
/// carried as vertex colour.
pub const WHITE_PATCH: &str = "/assets/shadow/white.svg";

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
    /// The middle of [`WHITE_PATCH`] in the shared atlas, in texture coordinates.
    white: Option<(f32, f32)>,
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
                sheets.insert(
                    entry.source.clone(),
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
                by_source.insert(
                    entry.source.clone(),
                    SpriteAsset {
                        frame,
                        ink: entry.ink,
                        texture,
                    },
                );
            }
        }
        // The middle of the patch, so that however the sampler filters it the answer is the
        // one texel's own white.
        let white = by_source
            .get(WHITE_PATCH)
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
            by_source,
            sheets,
            white,
        }
    }

    /// Whether the atlas carries [`WHITE_PATCH`]. Without it the shadows still draw, but each
    /// one binds a texture of its own and breaks the batch, so the client says so once.
    pub fn has_white_patch(&self) -> bool {
        self.white.is_some()
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

    /// Draws one frame of `texture` into the rectangle `layout` describes, multiplied by `tint`.
    ///
    /// The tint is a per-draw colour, not a pipeline change, so a tinted sprite stays in the same
    /// batch as an untinted one: the terrain's colour zones cost nothing in draw calls.
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

    /// Draws the part of a frame that falls inside `band`, which is a piece of the same
    /// rectangle `layout` describes.
    ///
    /// The artwork maps linearly onto that rectangle, so each corner of the band samples the
    /// frame at its own position within it — the band is a window on the drawing, never a
    /// squeezed copy of it.
    pub fn draw_band(
        &self,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        band: &SpriteBand,
        shade: Option<&ShadeLattice>,
    ) {
        let source = self.source(frame);
        let texture = self.texture(texture);
        let (width, height) = (texture.width(), texture.height());
        let corners = band.corners();
        let vertices: Vec<Vertex> = corners
            .iter()
            .map(|&(x, y)| {
                let along = ((x - layout.x) / layout.width) as f32;
                let down = ((y - layout.y) / layout.height) as f32;
                // A band is a slice of the same drawing, so it reads its shading out of the
                // lattice over the whole sprite rather than carrying one of its own: the
                // shadow then runs across a long building instead of stepping at every cut.
                let colour = match shade {
                    None => WHITE,
                    Some(shade) => {
                        let light = shade.light_in(along, down);
                        Color::new(light, light, light, 1.0)
                    }
                };
                vertex(
                    (x as f32, y as f32),
                    (
                        (source.x + along * source.w) / width,
                        (source.y + down * source.h) / height,
                    ),
                    colour,
                    (0.0, 0.0),
                    crate::rendering::scene_material::SPRITE,
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

    /// Draws one frame as a lattice of quads, each corner darkened by the shadows falling on it.
    ///
    /// The drawing is the same as [`Self::draw`] puts on screen — the lattice spans exactly the
    /// rectangle `layout` describes and samples the frame linearly across it — so a sprite that
    /// starts being shaded does not move or change size. What changes is its colour, corner by
    /// corner, and the sprite's own transparency keeps the shading inside its silhouette.
    pub fn draw_shaded(
        &self,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        shade: &ShadeLattice,
    ) {
        let source = self.source(frame);
        let texture = self.texture(texture);
        let (width, height) = (texture.width(), texture.height());
        let (columns, rows) = (shade.columns, shade.rows);
        let mut vertices = Vec::with_capacity(((columns + 1) * (rows + 1)) as usize);
        for row in 0..=rows {
            let down = f32::from(row as u16) / rows as f32;
            for column in 0..=columns {
                let along = f32::from(column as u16) / columns as f32;
                let light = shade.light_at(column, row);
                vertices.push(vertex(
                    (
                        layout.x as f32 + along * layout.width as f32,
                        layout.y as f32 + down * layout.height as f32,
                    ),
                    (
                        (source.x + along * source.w) / width,
                        (source.y + down * source.h) / height,
                    ),
                    Color::new(light, light, light, 1.0),
                    (0.0, 0.0),
                    crate::rendering::scene_material::SPRITE,
                ));
            }
        }
        let mut indices = Vec::with_capacity((columns * rows * 6) as usize);
        for row in 0..rows {
            for column in 0..columns {
                let corner = (row * (columns + 1) + column) as u16;
                let next = corner + columns as u16 + 1;
                indices.extend_from_slice(&[corner, corner + 1, next + 1, corner, next + 1, next]);
            }
        }
        draw_mesh(&Mesh {
            vertices,
            indices,
            texture: Some(texture.clone()),
        });
    }

    /// Draws a shadow over the flat quad `corners`: a lattice of black, as opaque at each
    /// corner as that corner is shaded, scaled by the phase's `opacity`.
    ///
    /// The projection is affine, so a lattice of `(along, down)` over the quad maps straight
    /// onto the screen and the corners can be read between. The mesh samples the atlas's own
    /// [`WHITE_PATCH`] rather than carrying no texture, so it joins the batch the ground is
    /// drawn in; with no patch in the atlas it falls back to an untextured mesh, which draws
    /// the same pixels but costs a draw call of its own.
    pub fn draw_face_shadow(&self, corners: &[(f64, f64); 4], shade: &ShadeLattice, opacity: f32) {
        let (columns, rows) = (shade.columns, shade.rows);
        let (u, v) = self.white.unwrap_or((0.0, 0.0));
        let mut vertices = Vec::with_capacity(((columns + 1) * (rows + 1)) as usize);
        for row in 0..=rows {
            let down = f64::from(row) / f64::from(rows);
            for column in 0..=columns {
                let along = f64::from(column) / f64::from(columns);
                // Bilinear between the four corners, which on an affine projection is the quad.
                let top = (
                    corners[0].0 + (corners[1].0 - corners[0].0) * along,
                    corners[0].1 + (corners[1].1 - corners[0].1) * along,
                );
                let bottom = (
                    corners[3].0 + (corners[2].0 - corners[3].0) * along,
                    corners[3].1 + (corners[2].1 - corners[3].1) * along,
                );
                // The lattice carries light; what a shadow draws is the dark that is left.
                let alpha = (1.0 - shade.light_at(column, row)) * opacity;
                vertices.push(vertex(
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
        let mut indices = Vec::with_capacity((columns * rows * 6) as usize);
        for row in 0..rows {
            for column in 0..columns {
                let corner = (row * (columns + 1) + column) as u16;
                let next = corner + columns as u16 + 1;
                indices.extend_from_slice(&[corner, corner + 1, next + 1, corner, next + 1, next]);
            }
        }
        draw_mesh(&Mesh {
            vertices,
            indices,
            texture: self.white.map(|_| self.textures[ATLAS_TEXTURE].clone()),
        });
    }

    /// Draws one voxel of dust: its three visible faces in flat colour, as one mesh.
    ///
    /// Three quads in a single mesh rather than three meshes, and out of the atlas's own
    /// [`WHITE_PATCH`] rather than untextured, so a puff of twelve cubes adds twelve meshes to
    /// the batch the scene is already drawing and no draw call of its own. With no patch in the
    /// atlas it falls back to an untextured mesh, which draws the same pixels and breaks the
    /// batch — the same trade-off the shadows make.
    pub fn draw_voxel(&self, faces: &VoxelFaces, colours: &[Color; 3]) {
        let (u, v) = self.white.unwrap_or((0.0, 0.0));
        let mut vertices = Vec::with_capacity(12);
        let mut indices = Vec::with_capacity(18);
        for (face, colour) in [faces.top, faces.left, faces.right].iter().zip(colours) {
            let corner = vertices.len() as u16;
            for point in face {
                vertices.push(vertex(
                    (point.0 as f32, point.1 as f32),
                    (u, v),
                    *colour,
                    (0.0, 0.0),
                    crate::rendering::scene_material::SPRITE,
                ));
            }
            indices.extend_from_slice(&[
                corner,
                corner + 1,
                corner + 2,
                corner,
                corner + 2,
                corner + 3,
            ]);
        }
        draw_mesh(&Mesh {
            vertices,
            indices,
            texture: self.white.map(|_| self.textures[ATLAS_TEXTURE].clone()),
        });
    }

    /// Draws the shadow baked on a column's top face: one quad, shaded by the shadow atlas.
    ///
    /// `corners` is the cell on screen, from the corner towards the camera clockwise, and
    /// `map_uv` is where each of those corners reads the atlas. The projection is affine, so
    /// interpolating the coordinate across the quad lands on the same texels the lattice used to
    /// read on the CPU — only the sampler does it now, and between the texels rather than
    /// between a lattice's corners.
    ///
    /// The mesh binds the sprite atlas, not the shadow atlas: that is what keeps it in the same
    /// batch as the ground it falls on. [`crate::scene_material`] reads the shadow atlas through
    /// a sampler of its own, and the vertex's own texture coordinate is never looked at — it
    /// points at [`WHITE_PATCH`] so that the draw is still correct if it ever is.
    pub fn draw_ground_shadow(
        &self,
        corners: &[(f64, f64); 4],
        map_uv: &[(f32, f32); 4],
        opacity: f32,
    ) {
        let white = self.white.unwrap_or((0.0, 0.0));
        // The phase's opacity rides in the alpha; the shader multiplies the map's coverage by it.
        let colour = Color::new(0.0, 0.0, 0.0, opacity);
        let vertices: Vec<Vertex> = (0..4)
            .map(|corner| {
                let (x, y) = corners[corner];
                vertex(
                    (x as f32, y as f32),
                    white,
                    colour,
                    map_uv[corner],
                    crate::rendering::scene_material::SHADOW,
                )
            })
            .collect();
        draw_mesh(&Mesh {
            vertices,
            indices: vec![0, 1, 2, 0, 2, 3],
            texture: Some(self.textures[ATLAS_TEXTURE].clone()),
        });
    }

    /// Draws a sprite's artwork as the water shows it: the polygon `points` on a water top, each
    /// corner reading the artwork at the matching `uv`, multiplied by `colour`.
    ///
    /// The same convex mesh, in the water's own colour instead of black. The
    /// reflection is cut to one water cell ([`iso::water::reflection_piece`]), so it sorts with
    /// that cell and the land drawn in front of the water covers it. See
    /// [`crate::reflection_view`].
    pub fn draw_reflection(
        &self,
        texture: usize,
        frame: SpriteFrame,
        points: &[(f64, f64)],
        uv: &[(f64, f64)],
        colour: Color,
    ) {
        self.draw_polygon(texture, frame, points, uv, colour);
    }

    /// Draws `frame`'s artwork over the convex polygon `points`, each corner reading it at the
    /// matching `uv` (in `[0, 1]`), multiplied by `colour`.
    ///
    /// The polygon is drawn as a fan from its first corner, which is exact because every polygon
    /// that gets here is convex: a sprite's rectangle cut by straight lines.
    fn draw_polygon(
        &self,
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
        let texture = self.texture(texture);
        let (width, height) = (texture.width(), texture.height());
        let vertices: Vec<Vertex> = points
            .iter()
            .zip(uv)
            .map(|(point, read)| {
                vertex(
                    (point.0 as f32, point.1 as f32),
                    (
                        (source.x + read.0 as f32 * source.w) / width,
                        (source.y + read.1 as f32 * source.h) / height,
                    ),
                    colour,
                    (0.0, 0.0),
                    crate::rendering::scene_material::SPRITE,
                )
            })
            .collect();
        let mut indices = Vec::with_capacity((points.len() - 2) * 3);
        for corner in 1..points.len() - 1 {
            let corner = corner as u16;
            indices.extend_from_slice(&[0, corner, corner + 1]);
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

/// How dark each corner of a lattice over a sprite is: the shadows falling on it.
///
/// The shadows another sprite throws on a standing one cannot be a quad on the ground, because
/// what they land on has a silhouette of its own and the shadow has to stop where it stops. So
/// the sprite is drawn as a lattice of quads instead of one, each corner carrying how dark the
/// sprite is there, and the sprite's own pixels mask the shading for nothing: the shading *is*
/// the sprite, drawn darker. See [`iso::lighting::received`].
#[derive(Clone, Debug)]
pub struct ShadeLattice {
    columns: u32,
    rows: u32,
    /// One factor to multiply the artwork by per corner, row by row from its top left.
    light: Vec<f32>,
}

impl ShadeLattice {
    /// The lattice that draws `grid`: a corner shaded `v` keeps `1 − v` of its colour.
    pub fn new(grid: &ShadeGrid) -> Self {
        let (columns, rows) = (grid.columns(), grid.rows());
        let mut light = Vec::with_capacity(((columns + 1) * (rows + 1)) as usize);
        for row in 0..=rows {
            for column in 0..=columns {
                light.push((1.0 - grid.at(column, row)).clamp(0.0, 1.0));
            }
        }
        Self {
            columns,
            rows,
            light,
        }
    }

    /// A lattice straight from coverage values, row by row, for a surface that has no artwork
    /// of its own: the shadow on a vertical face of ground is worked out at its corners.
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
    /// corners around that point.
    fn light_in(&self, along: f32, down: f32) -> f32 {
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
        /// `None` for everything drawn in one piece.
        band: Option<SpriteBand>,
        /// What the artwork is multiplied by: the colour zone the ground stands in, or [`WHITE`]
        /// for a sprite drawn as it was painted.
        tint: Color,
    },
    /// An atlas sprite drawn as a lattice, darkened by the shadows falling on it.
    Shaded {
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        shade: ShadeLattice,
        /// The piece of the drawing this draw shows, as in [`DrawKind::Sprite`].
        band: Option<SpriteBand>,
    },
    /// The baked shadow on a column's top face: the flat quad of its own cell, shaded from the
    /// chunk's square of the shadow atlas.
    ///
    /// Four vertices, because the shading is a texture lookup ([`crate::scene_material`]). It
    /// used to be a lattice of corners read off the map on the CPU, and at 36 texels a tile that
    /// was 221 vertices a column after thinning — 96 % of everything the frame drew.
    GroundShadow {
        /// The quad's four corners on screen, from the one towards the camera, clockwise.
        corners: [(f64, f64); 4],
        /// Where each of those corners reads the shadow atlas.
        map_uv: [(f32, f32); 4],
        /// How dark the shadow is drawn: the lighting phase's own opacity.
        opacity: f32,
    },
    /// What the water shows of one sprite, on one cell of water: the artwork again, cut to that
    /// cell and drawn in the water's own colour.
    ///
    /// Not baked either: a reflection follows whatever it mirrors, and the things that stand
    /// around water walk about. See [`crate::reflection_view`].
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
    ///
    /// It carries no artwork, so its faces sample [`WHITE_PATCH`] and wear their colour as
    /// vertex colour, exactly as a face shadow does: that is what keeps a cloud of dust in the
    /// same batch as the ground it rises from instead of costing a draw call per cube. See
    /// [`crate::dust_view`].
    Voxel {
        /// Where the voxel's faces are on screen, from [`iso::player::voxel_faces`] offset to
        /// the point it stands on.
        faces: VoxelFaces,
        /// The colour of the top, the left face and the right face, each already the voxel's
        /// own shade and the puff's opacity.
        colours: [Color; 3],
    },
    /// The baked shadow on one exposed vertical face of the ground.
    ///
    /// A face does not stand in the shadow map — the map is cast onto level ground — so its
    /// shading is worked out at its own corners when the chunk bakes and carried as vertex
    /// colour over a lattice. A face is one cell wide and one block tall, so that lattice is
    /// sixteen vertices, which is why it stayed as it was.
    FaceShadow {
        /// The quad's four corners on screen, from the one towards the camera, clockwise.
        corners: [(f64, f64); 4],
        shade: Rc<ShadeLattice>,
        /// How dark the shadow is drawn: the lighting phase's own opacity.
        opacity: f32,
    },
}

/// One sprite queued for this frame, with the key it sorts by.
///
/// Terrain, entities, their shadows and the player all go into the same list, so one depth sort
/// decides what covers what. Drawing the terrain in a pass of its own, as the first version did,
/// made every entity draw over ground that is in front of it: a tree at the foot of a cliff was
/// painted on top of the cliff.
pub struct SpriteDraw {
    pub key: DrawKey,
    pub kind: DrawKind,
}

impl SpriteDraw {
    /// A sprite drawn whole, which is everything standing on a single cell.
    pub fn whole(key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout) -> Self {
        Self::tinted(key, texture, frame, layout, WHITE)
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
            kind: DrawKind::Sprite {
                texture,
                frame,
                layout,
                band: None,
                tint,
            },
        }
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
            kind: DrawKind::Sprite {
                texture,
                frame,
                layout,
                band,
                tint: WHITE,
            },
        }
    }

    /// A sprite darkened by the shadows falling on it.
    pub fn shaded(
        key: DrawKey,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        shade: ShadeLattice,
    ) -> Self {
        Self {
            key,
            kind: DrawKind::Shaded {
                texture,
                frame,
                layout,
                shade,
                band: None,
            },
        }
    }

    /// One band of a sprite that spans several cells, darkened by the shadows falling on it.
    pub fn shaded_band(
        key: DrawKey,
        texture: usize,
        frame: SpriteFrame,
        layout: SpriteLayout,
        shade: ShadeLattice,
        band: SpriteBand,
    ) -> Self {
        Self {
            key,
            kind: DrawKind::Shaded {
                texture,
                frame,
                layout,
                shade,
                band: Some(band),
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
            kind: DrawKind::FaceShadow {
                corners,
                shade,
                opacity,
            },
        }
    }
}

/// Sorts the queued sprites far to near and draws them, with `material` bound throughout.
///
/// The material is bound once around the whole list and let go after it, because switching
/// pipelines breaks the batch exactly as switching textures does: binding it per shadow would
/// undo the batching the shadow atlas exists for. Without a material the ground shadows have no
/// way to read their map, so the scene is drawn without them — which is what the client does
/// when the shader will not load.
pub fn draw_sorted(
    atlas: &SpriteAtlas,
    material: Option<&crate::rendering::scene_material::SceneMaterial>,
    draws: &mut [SpriteDraw],
) {
    if let Some(material) = material {
        material.bind();
    }
    draw_queue(atlas, draws);
    if let Some(material) = material {
        material.release();
    }
}

fn draw_queue(atlas: &SpriteAtlas, draws: &mut [SpriteDraw]) {
    // A stable sort, so sprites that share a key keep the order they were queued in: that is
    // what stacks a column's own blocks bottom first.
    draws.sort_by(|a, b| compare_draw_keys(&a.key, &b.key));
    for draw in draws.iter() {
        match &draw.kind {
            DrawKind::Sprite {
                texture,
                frame,
                layout,
                band: Some(band),
                ..
            } => {
                atlas.draw_band(*texture, *frame, *layout, band, None);
            }
            DrawKind::Sprite {
                texture,
                frame,
                layout,
                band: None,
                tint,
            } => {
                atlas.draw(*texture, *frame, *layout, *tint);
            }
            DrawKind::Shaded {
                texture,
                frame,
                layout,
                shade,
                band: Some(band),
            } => {
                atlas.draw_band(*texture, *frame, *layout, band, Some(shade));
            }
            DrawKind::Shaded {
                texture,
                frame,
                layout,
                shade,
                band: None,
            } => {
                atlas.draw_shaded(*texture, *frame, *layout, shade);
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

/// Depth key of a cell's surface: the terrain itself, and what is painted onto it — a baked
/// shadow, the player's moving shadow, a reflection on the water. Not for what *stands* on a
/// cell, which keys by its centre with [`scene_key`].
///
/// A column's top is drawn as a whole diamond, and half of that diamond lies nearer the camera
/// than the cell's centre — the corner where four cells meet projects half a tile height below
/// it. Keyed by its centre, like everything that stands on it, a tile towards the camera
/// therefore sorted **after** a player standing anywhere in the near half of its own cell and
/// was painted over it: over the legs at the shared edge, over the whole figure at the shared
/// corner. Nothing was ever clipped; the next tile was simply drawn on top, and only near a
/// cell's edges, which is where it was seen.
///
/// So a tile sorts by the **far corner of its cell**, one whole cell further from the camera
/// than its centre. It is then drawn before anything standing anywhere on it, and before
/// anything standing on the cells towards it whose ground is level with it or lower, while a
/// cell that rises above still sorts after it on the elevation term — a step in front of the
/// player goes on hiding the player behind it. Terrain keeps its order among itself, because
/// every block of it moves by the same one cell.
///
/// Everything lying **on** that surface moves with it, or it is left half a cell in front of
/// the ground it belongs to and shows through the terrain drawn over that ground: that is what
/// the stray rectangles of shadow on the sand steps were.
pub fn ground_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {
    let key = scene_key(x, y, elevation, layer, tile_height);
    DrawKey {
        depth: key.depth - tile_height / 2.0,
        ..key
    }
}
