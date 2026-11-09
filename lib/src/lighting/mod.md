# Lighting

Este dominio de cliente implementa en Macroquad las sombras de nubes, siluetas, atlas y vistas derivados de `iso::lighting`. Materializa los cálculos puros de iluminación como recursos, máscaras y operaciones de presentación.

Debe adaptar el dominio sin introducir reglas alternativas de luz o de fase. La gestión de texturas, cámaras auxiliares y materiales visuales permanece encapsulada en este límite de infraestructura.

No es la fuente de verdad para geometría, exposición ni orden de sombras; esas decisiones pertenecen al crate `iso`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `cloud_shadows.rs`

#### Funciones y métodos

- [`new`](cloud_shadows.rs#L26) — The pattern at rest, drawn from `texture`.
  - Firma: `pub fn new(texture: Texture2D) -> Self {`

- [`advance`](cloud_shadows.rs#L35) — Moves the clouds on by `elapsed_ms` of real time.
  - Firma: `pub fn advance(&mut self, elapsed_ms: f64) {`

- [`draw`](cloud_shadows.rs#L43) — Draws the pattern over the view, as many copies as it takes to cover it.
  - Firma: `pub fn draw(&self, origin: (f64, f64), tile: (f64, f64), screen: (f64, f64)) {`

- [`cloud_copies`](cloud_shadows.rs#L69) — Where each copy of the pattern goes to cover a `screen`-sized view, given one copy's top left
  - Firma: `pub fn cloud_copies(anchor: (f64, f64), period: (f64, f64), screen: (f64, f64)) -> Vec<(f64, f64)> {`

#### Constantes

- [`CLOUD_SHADOW_SOURCE`](cloud_shadows.rs#L6) — The path the pattern is loaded from, relative to the client root.
  - Declaración: `pub const CLOUD_SHADOW_SOURCE: &str = "content/cloud-shadow.png";`

- [`CLOUD_PERIOD_TILES`](cloud_shadows.rs#L9) — How many tiles the pattern repeats over, along both screen axes.
  - Declaración: `pub const CLOUD_PERIOD_TILES: f64 = 12.0;`

- [`CLOUD_SHADOW_ALPHA`](cloud_shadows.rs#L12) — Opacity of the whole pattern: one flat shade, so overlapping clouds never add up.
  - Declaración: `pub const CLOUD_SHADOW_ALPHA: f32 = 0.18;`

- [`CLOUD_DRIFT`](cloud_shadows.rs#L15) — How fast the clouds drift, as a fraction of a tile per real second: `x` across the screen,
  - Declaración: `pub const CLOUD_DRIFT: (f64, f64) = (2.0 / 40.0, 0.5 / 20.0);`

### `shadow_view.rs`

#### Funciones y métodos

- [`new`](shadow_view.rs#L102) — An empty scene lit by `light`, sampling `masks`.
  - Firma: `pub fn new( light: PhaseLight, masks: SilhouetteMasks, atlas: ShadowAtlas, tile_width: f64, box_height: f64, ) -> Self {`

- [`update`](shadow_view.rs#L125) — Spends up to [`BAKE_BUDGET_MS`] bringing the bake up to date for `shown`, and forgets
  - Firma: `pub fn update(&mut self, manager: &ChunkManager, shown: &[ChunkCoord]) {`

- [`collect_faces`](shadow_view.rs#L493) — Queues the shadow on every exposed vertical face of `coord`'s ground.
  - Firma: `pub fn collect_faces( &self, coord: ChunkCoord, projection: ProjectionConfig, out: &mut Vec<SpriteDraw>, ) {`

- [`shade_of`](shadow_view.rs#L539) — The shadows falling on the entity standing at `cell`, if any were baked.
  - Firma: `pub fn shade_of(&self, coord: ChunkCoord, cell: (i32, i32)) -> Option<&ShadeGrid> {`

- [`shade_moving`](shadow_view.rs#L544) — The shadows falling on something standing where the player is, sampled now.
  - Firma: `pub fn shade_moving( &self, manager: &ChunkManager, receiver: &ShadowReceiver, ) -> Option<ShadeGrid> {`

- [`collect_ground`](shadow_view.rs#L576) — Queues the ground shadow of every shaded column of `chunk`, to be sorted and drawn with
  - Firma: `pub fn collect_ground( &self, coord: ChunkCoord, columns: &[TerrainColumn], projection: ProjectionConfig, out: &mut Vec<SpriteDraw>, ) {`

- [`extent_of_ink`](shadow_view.rs#L653) — Where a measured drawing is drawn around the ground point it stands on, in screen pixels.
  - Firma: `pub fn extent_of_ink(ink: InkBox, tile_width: f64) -> SpriteExtent {`

- [`receiver_of`](shadow_view.rs#L664) — The receiver a sprite drawn into `layout` standing on `foot` at `elevation` makes.
  - Firma: `pub fn receiver_of( layout: SpriteLayout, feet: ScreenPoint, foot: (f64, f64), elevation: f64, ) -> ShadowReceiver {`

- [`lattice_of`](shadow_view.rs#L683) — A lattice ready to draw a sprite with, or `None` when nothing shades it after all.
  - Firma: `pub fn lattice_of(grid: &ShadeGrid) -> Option<ShadeLattice> {`

#### Constantes

- [`BAKE_BUDGET_MS`](shadow_view.rs#L24) — How long a frame may spend baking shadows.
  - Declaración: `pub const BAKE_BUDGET_MS: f64 = 3.0;`

- [`GROUND_SHADOW_LAYER`](shadow_view.rs#L30) — Ground shadows draw over the terrain of their own column and under anything standing on it.
  - Declaración: `pub const GROUND_SHADOW_LAYER: i32 = 1;`

- [`FACE_FLOOR`](shadow_view.rs#L36) — How far down a column's exposed side a shadow is worked out, in blocks.
  - Declaración: `pub const FACE_FLOOR: f64 = 10.0;`

- [`ENTITY_SHADE_COLUMNS`](shadow_view.rs#L39) — Corners across an entity's artwork, and down it, for the shadows it receives.
  - Declaración: `pub const ENTITY_SHADE_COLUMNS: u32 = 6;`

- [`ENTITY_SHADE_ROWS`](shadow_view.rs#L40) — Define cuántas filas contiene la banda de sombreado aplicada a entidades.
  - Declaración: `pub const ENTITY_SHADE_ROWS: u32 = 10;`

### `shadow_view_atlas.rs`

#### Funciones y métodos

- [`new`](shadow_view_atlas.rs#L35) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`slot_of`](shadow_view_atlas.rs#L43) — The slot `coord` is in, without counting it as a use.
  - Firma: `pub fn slot_of(&self, coord: ChunkCoord) -> Option<usize> {`

- [`touch`](shadow_view_atlas.rs#L50) — The slot `coord` is in, counting the ask as the most recent use of it.
  - Firma: `pub fn touch(&mut self, coord: ChunkCoord) -> Option<usize> {`

- [`claim`](shadow_view_atlas.rs#L58) — Gives `coord` a slot: the one it already has, else a free one, else the one whose chunk
  - Firma: `pub fn claim(&mut self, coord: ChunkCoord) -> (usize, Option<ChunkCoord>) {`

- [`release`](shadow_view_atlas.rs#L80) — Frees whatever slot `coord` holds, because the stream has dropped it.
  - Firma: `pub fn release(&mut self, coord: ChunkCoord) {`

- [`slot_origin`](shadow_view_atlas.rs#L88) — Where a slot starts in the atlas, in texels.
  - Firma: `pub fn slot_origin(slot: usize) -> (u32, u32) {`

- [`square_in_slot`](shadow_view_atlas.rs#L97) — The texel square of column `(x, y)` inside the slot its own chunk holds.
  - Firma: `pub fn square_in_slot(coord: ChunkCoord, x: i32, y: i32) -> Option<(u32, u32)> {`

- [`atlas_uv`](shadow_view_atlas.rs#L108) — The texture coordinate of a point of a chunk's map, in `[0, 1]` across the whole atlas.
  - Firma: `pub fn atlas_uv(slot: usize, texel: (f64, f64)) -> (f32, f32) {`

- [`new`](shadow_view_atlas.rs#L125) — An empty atlas.
  - Firma: `pub fn new() -> Self {`

- [`texture`](shadow_view_atlas.rs#L153) — The texture, to hand the scene's material.
  - Firma: `pub fn texture(&self) -> &Texture2D {`

- [`put`](shadow_view_atlas.rs#L158) — Puts `map` in `coord`'s slot and returns the chunk turned out of that slot, if any.
  - Firma: `pub fn put(&mut self, coord: ChunkCoord, map: &ShadowMap) -> Option<ChunkCoord> {`

- [`release`](shadow_view_atlas.rs#L179) — Frees `coord`'s slot.
  - Firma: `pub fn release(&mut self, coord: ChunkCoord) {`

- [`touch`](shadow_view_atlas.rs#L184) — Whether `coord`'s map is in the atlas, counting the ask as a use.
  - Firma: `pub fn touch(&mut self, coord: ChunkCoord) -> Option<usize> {`

- [`slot_of`](shadow_view_atlas.rs#L189) — Which slot `coord`'s map is in, for the texture coordinates of its columns.
  - Firma: `pub fn slot_of(&self, coord: ChunkCoord) -> Option<usize> {`

- [`holds`](shadow_view_atlas.rs#L194) — Whether `coord`'s map is in the atlas.
  - Firma: `pub fn holds(&self, coord: ChunkCoord) -> bool {`

#### Constantes

- [`SLOT_TEXELS`](shadow_view_atlas.rs#L8) — A slot's side in texels: a chunk's columns plus the margin its map is baked with.
  - Declaración: `pub const SLOT_TEXELS: u32 = (CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) as u32 * SHADOW_MAP_PIXELS_PER_TILE;`

- [`SLOTS_ACROSS`](shadow_view_atlas.rs#L12) — Slots across the atlas, and down it.
  - Declaración: `pub const SLOTS_ACROSS: u32 = 3;`

- [`SLOT_COUNT`](shadow_view_atlas.rs#L15) — How many chunks the atlas holds at once.
  - Declaración: `pub const SLOT_COUNT: usize = (SLOTS_ACROSS * SLOTS_ACROSS) as usize;`

- [`ATLAS_TEXELS`](shadow_view_atlas.rs#L18) — The atlas's side in texels.
  - Declaración: `pub const ATLAS_TEXELS: u32 = SLOT_TEXELS * SLOTS_ACROSS;`

### `shadow_view_masks.rs`

#### Funciones y métodos

- [`load`](shadow_view_masks.rs#L26) — Loads the atlas image at `path` and reduces it to coverage, one silhouette per manifest
  - Firma: `pub async fn load(path: &str, manifest: &AssetManifest) -> Option<Self> {`

- [`from_image`](shadow_view_masks.rs#L32) — Reduces `image` to coverage and indexes the manifest's own frames against it.
  - Firma: `pub fn from_image(image: &Image, manifest: &AssetManifest) -> Self {`

- [`ink_of`](shadow_view_masks.rs#L80) — Where the artwork at `source` belongs around the ground it stands on, or `None` when the
  - Firma: `pub fn ink_of(&self, source: &str) -> Option<InkBox> {`

- [`index_of`](shadow_view_masks.rs#L85) — The silhouette of the asset at `source`, or `None` if the atlas has none.
  - Firma: `pub fn index_of(&self, source: &str) -> Option<u32> {`

- [`silhouette_of`](shadow_view_masks.rs#L90) — The silhouette of `index` as a window on the one plane every mask lives in, or `None`
  - Firma: `pub fn silhouette_of(&self, index: u32) -> Option<Silhouette<'_>> {`

#### Constantes

- [`MASK_SCALE`](shadow_view_masks.rs#L9) — How many atlas texels go into one texel of a mask, on each axis.
  - Declaración: `pub const MASK_SCALE: u32 = 4;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `shadow_view.rs`

#### Funciones internas

- [`next_to_bake`](shadow_view.rs#L191) — The chunk most worth baking next: one that has no shadows at all before one that has
  - Firma: `fn next_to_bake(&self, manager: &ChunkManager, shown: &[ChunkCoord]) -> Option<ChunkCoord> {`

- [`advance`](shadow_view.rs#L210) — Does one piece of the job in hand, and says whether that was the last of it.
  - Firma: `fn advance(&mut self, manager: &ChunkManager) -> bool {`

- [`start`](shadow_view.rs#L265) — Opens a bake of `coord`, up to the point where there is a map to lay into.
  - Firma: `fn start(&mut self, manager: &ChunkManager, coord: ChunkCoord) {`

- [`ground_field`](shadow_view.rs#L303) — Calcula o recupera «ground field» según los parámetros de la firma.
  - Firma: `fn ground_field( manager: &ChunkManager, min_x: i32, min_y: i32, max_x: i32, max_y: i32, ) -> HeightField {`

- [`ground_cover`](shadow_view.rs#L316) — Reads back which of `count` columns from `from` carry any coverage at all, appends the
  - Firma: `fn ground_cover( &self, manager: &ChunkManager, coord: ChunkCoord, from: usize, count: usize, out: &mut Vec<bool>, ) -> usize {`

- [`casters_of`](shadow_view.rs#L357) — The chunk's entities as casters, in the drawing's own measurements.
  - Firma: `fn casters_of(&self, manager: &ChunkManager, coord: ChunkCoord) -> Vec<ShadowCaster> {`

- [`caster_of`](shadow_view.rs#L368) — One entity as a caster, or `None` when the atlas has no measured artwork for it.
  - Firma: `fn caster_of(&self, entity: &Entity) -> Option<ShadowCaster> {`

- [`extent_of`](shadow_view.rs#L379) — Where an entity's artwork is drawn around the ground point it stands on.
  - Firma: `fn extent_of(&self, entity: &Entity) -> Option<SpriteExtent> {`

- [`shade_entities`](shadow_view.rs#L385) — The lattices of the chunk's own entities, for the ones something shades.
  - Firma: `fn shade_entities( &self, manager: &ChunkManager, coord: ChunkCoord, casters: &[ShadowCaster], ground: &HeightField, ) -> HashMap<(i32, i32), ShadeGrid> {`

- [`shade_faces`](shadow_view.rs#L430) — The shadow on each exposed vertical face of the chunk's ground.
  - Firma: `fn shade_faces( &self, manager: &ChunkManager, coord: ChunkCoord, casters: &[ShadowCaster], ground: &HeightField, ) -> Vec<(TerrainFace, Rc<ShadeLattice>)> {`

- [`around`](shadow_view.rs#L688) — The nine chunks around `coord`, itself included, in a fixed order.
  - Firma: `fn around(coord: ChunkCoord) -> [ChunkCoord; 9] {`

- [`neighbours_loaded`](shadow_view.rs#L704) — Which of the nine chunks around `coord` the stream has, as one bit each: what a bake was made
  - Firma: `fn neighbours_loaded(manager: &ChunkManager, coord: ChunkCoord) -> u16 {`

#### Constantes internas

- [`GROUND_SHADE_COLUMNS`](shadow_view.rs#L27) — Columns whose lattice is read off the map in one piece of work.
  - Declaración: `const GROUND_SHADE_COLUMNS: usize = 128;`

- [`FACE_SHADE_STEPS`](shadow_view.rs#L33) — Quads across an exposed vertical face of ground, and down it, for the shadow on it.
  - Declaración: `const FACE_SHADE_STEPS: u32 = 3;`

### `shadow_view_atlas.rs`

#### Funciones internas

- [`default`](shadow_view_atlas.rs#L29) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`
