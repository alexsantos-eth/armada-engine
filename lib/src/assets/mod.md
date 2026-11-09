# Assets

Este dominio de cliente gestiona el atlas de Macroquad, las hojas de sprites y las órdenes de dibujo que consumen los contratos de `iso::assets`. Traduce datos de contenido del núcleo a recursos y coordenadas que entiende el backend gráfico.

Debe conservar la separación entre manifestos del dominio y recursos cargados del cliente. Las conversiones de UV, medidas de textura y caché de atlas se concentran aquí para no duplicarse en vistas de terreno o entidades.

No redefine la semántica de los assets ni modifica sus manifiestos. Los cambios de contenido se realizan en `iso::assets`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `sprites.rs`

#### Funciones y métodos

- [`frame`](sprites.rs#L55) — The frame of pose `pose` in `facing`'s row, with both wrapped into the grid: an
  - Firma: `pub fn frame(&self, facing: usize, pose: usize) -> SpriteFrame {`

- [`columns`](sprites.rs#L61) — How many poses a row holds.
  - Firma: `pub fn columns(&self) -> usize {`

- [`poses`](sprites.rs#L66) — The names the artwork gives its columns, where it names them (a jump's phases); empty
  - Firma: `pub fn poses(&self) -> &[String] {`

- [`new`](sprites.rs#L73) — Builds the lookup over the textures the manifest names: the shared atlas, and then the
  - Firma: `pub fn new( atlas: Texture2D, extra: Vec<(String, Texture2D)>, manifest: &AssetManifest, ) -> Self {`

- [`has_white_patch`](sprites.rs#L140) — Whether the atlas carries [`WHITE_PATCH`]. Without it the shadows still draw, but each
  - Firma: `pub fn has_white_patch(&self) -> bool {`

- [`asset`](sprites.rs#L144) — Calcula o recupera «asset» según los parámetros de la firma.
  - Firma: `pub fn asset(&self, source: &str) -> Option<SpriteAsset> {`

- [`sheet`](sprites.rs#L149) — The sheet of poses at `source`, for the player's animations.
  - Firma: `pub fn sheet(&self, source: &str) -> Option<&SheetAsset> {`

- [`standing`](sprites.rs#L154) — The frame for something standing on `ground` and the rectangle to draw it into, or
  - Firma: `pub fn standing( &self, source: &str, ground: ScreenPoint, tile_width: f64, ) -> Option<(SpriteFrame, SpriteLayout)> {`

- [`draw`](sprites.rs#L170) — Draws one frame of `texture` into the rectangle `layout` describes, multiplied by `tint`.
  - Firma: `pub fn draw(&self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, tint: Color) {`

- [`draw_band`](sprites.rs#L186) — Draws the part of a frame that falls inside `band`, which is a piece of the same
  - Firma: `pub fn draw_band( &self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, band: &SpriteBand, shade: Option<&ShadeLattice>, ) {`

- [`draw_shaded`](sprites.rs#L234) — Draws one frame as a lattice of quads, each corner darkened by the shadows falling on it.
  - Firma: `pub fn draw_shaded( &self, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: &ShadeLattice, ) {`

- [`draw_face_shadow`](sprites.rs#L282) — Draws a shadow over the flat quad `corners`: a lattice of black, as opaque at each
  - Firma: `pub fn draw_face_shadow(&self, corners: &[(f64, f64); 4], shade: &ShadeLattice, opacity: f32) {`

- [`draw_voxel`](sprites.rs#L327) — Draws one voxel of dust: its three visible faces in flat colour, as one mesh.
  - Firma: `pub fn draw_voxel(&self, faces: &VoxelFaces, colours: &[Color; 3]) {`

- [`draw_ground_shadow`](sprites.rs#L359) — Draws the shadow baked on a column's top face: one quad, shaded by the shadow atlas.
  - Firma: `pub fn draw_ground_shadow( &self, corners: &[(f64, f64); 4], map_uv: &[(f32, f32); 4], opacity: f32, ) {`

- [`draw_reflection`](sprites.rs#L387) — Draws a sprite's artwork as the water shows it: the polygon `points` on a water top, each
  - Firma: `pub fn draw_reflection( &self, texture: usize, frame: SpriteFrame, points: &[(f64, f64)], uv: &[(f64, f64)], colour: Color, ) {`

- [`on_screen`](sprites.rs#L453) — Whether `layout` would land anywhere on screen.
  - Firma: `pub fn on_screen(layout: SpriteLayout) -> bool {`

- [`new`](sprites.rs#L473) — The lattice that draws `grid`: a corner shaded `v` keeps `1 − v` of its colour.
  - Firma: `pub fn new(grid: &ShadeGrid) -> Self {`

- [`from_coverage`](sprites.rs#L489) — A lattice straight from coverage values, row by row, for a surface that has no artwork
  - Firma: `pub fn from_coverage(columns: u32, rows: u32, coverage: Vec<f32>) -> Self {`

- [`whole`](sprites.rs#L589) — A sprite drawn whole, which is everything standing on a single cell.
  - Firma: `pub fn whole(key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout) -> Self {`

- [`tinted`](sprites.rs#L594) — A sprite drawn whole and multiplied by `tint`: a block of ground in a colour zone.
  - Firma: `pub fn tinted( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, tint: Color, ) -> Self {`

- [`band`](sprites.rs#L614) — One band of a sprite whose footprint covers several cells.
  - Firma: `pub fn band( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, band: Option<SpriteBand>, ) -> Self {`

- [`shaded`](sprites.rs#L634) — A sprite darkened by the shadows falling on it.
  - Firma: `pub fn shaded( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: ShadeLattice, ) -> Self {`

- [`shaded_band`](sprites.rs#L654) — One band of a sprite that spans several cells, darkened by the shadows falling on it.
  - Firma: `pub fn shaded_band( key: DrawKey, texture: usize, frame: SpriteFrame, layout: SpriteLayout, shade: ShadeLattice, band: SpriteBand, ) -> Self {`

- [`ground_shadow`](sprites.rs#L675) — The shadow baked on a column's top face, read from the shadow atlas.
  - Firma: `pub fn ground_shadow( key: DrawKey, corners: [(f64, f64); 4], map_uv: [(f32, f32); 4], opacity: f32, ) -> Self {`

- [`reflection`](sprites.rs#L692) — One water cell's share of what the water mirrors.
  - Firma: `pub fn reflection( key: DrawKey, texture: usize, frame: SpriteFrame, points: Vec<(f64, f64)>, uv: Vec<(f64, f64)>, colour: Color, ) -> Self {`

- [`voxel`](sprites.rs#L713) — One voxel of a puff of the player's dust.
  - Firma: `pub fn voxel(key: DrawKey, faces: VoxelFaces, colours: [Color; 3]) -> Self {`

- [`face_shadow`](sprites.rs#L721) — A shadow on one exposed vertical face of the ground.
  - Firma: `pub fn face_shadow( key: DrawKey, corners: [(f64, f64); 4], shade: Rc<ShadeLattice>, opacity: f32, ) -> Self {`

- [`draw_sorted`](sprites.rs#L739) — Sorts the queued sprites far to near and draws them, with `material` bound throughout.
  - Firma: `pub fn draw_sorted( atlas: &SpriteAtlas, material: Option<&crate::rendering::scene_material::SceneMaterial>, draws: &mut [SpriteDraw], ) {`

- [`scene_key`](sprites.rs#L824) — Depth key of something standing on the cell whose centre is `(x, y)`, at `elevation`.
  - Firma: `pub fn scene_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {`

- [`ground_key`](sprites.rs#L839) — Depth key of a cell's surface: the terrain itself, and what is painted onto it — a baked
  - Firma: `pub fn ground_key(x: f64, y: f64, elevation: f64, layer: i32, tile_height: f64) -> DrawKey {`

#### Constantes

- [`ATLAS_TEXTURE`](sprites.rs#L17) — The shared atlas, which is the texture of everything that is not a sheet of player poses.
  - Declaración: `pub const ATLAS_TEXTURE: usize = 0;`

- [`WHITE_PATCH`](sprites.rs#L20) — The asset that is nothing but opaque white, for drawing flat colour out of the shared atlas.
  - Declaración: `pub const WHITE_PATCH: &str = "/assets/shadow/white.svg";`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `sprites.rs`

#### Funciones internas

- [`texture`](sprites.rs#L165) — The texture a draw names, or the shared atlas if it names one that is not loaded.
  - Firma: `fn texture(&self, index: usize) -> &Texture2D {`

- [`draw_polygon`](sprites.rs#L399) — Draws `frame`'s artwork over the convex polygon `points`, each corner reading it at the
  - Firma: `fn draw_polygon( &self, texture: usize, frame: SpriteFrame, points: &[(f64, f64)], uv: &[(f64, f64)], colour: Color, ) {`

- [`source`](sprites.rs#L442) — The frame's pixels in the atlas, pulled in by half a texel on every side.
  - Firma: `fn source(&self, frame: SpriteFrame) -> Rect {`

- [`light_in`](sprites.rs#L502) — The light `along` across the lattice and `down` it, both in `[0, 1]`, read between the
  - Firma: `fn light_in(&self, along: f32, down: f32) -> f32 {`

- [`light_at`](sprites.rs#L517) — Calcula o recupera «light at» según los parámetros de la firma.
  - Firma: `fn light_at(&self, column: u32, row: u32) -> f32 {`

- [`draw_queue`](sprites.rs#L753) — Calcula o recupera «draw queue» según los parámetros de la firma.
  - Firma: `fn draw_queue(atlas: &SpriteAtlas, draws: &mut [SpriteDraw]) {`

#### Constantes internas

- [`INSET`](sprites.rs#L443) — Define el parámetro interno «INSET» empleado por este módulo.
  - Declaración: `const INSET: f32 = 0.5;`
