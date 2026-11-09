# Lighting

Este dominio calcula luz, fases temporales, caras iluminables, recepción y proyección de sombras como datos puros. Sus resultados permiten obtener iluminación coherente sin depender de texturas, shaders o recursos de GPU.

Los algoritmos deben ser deterministas, verificables y expresar sus entradas espaciales de forma explícita. La configuración de calidad visual que dependa del backend no debe filtrarse a estas estructuras.

No crea render targets ni emite órdenes de dibujo. El cliente de presentación convierte los resultados en atlas, máscaras y materiales.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `bake.rs`

#### Funciones y métodos

- [`around`](bake.rs#L26) — The area a chunk of columns `[min_x, max_x] × [min_y, max_y]` bakes, with its margin.
  - Firma: `pub fn around(min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> Self {`

- [`columns`](bake.rs#L35) — Calcula o recupera «columns» según los parámetros de la firma.
  - Firma: `pub fn columns(&self) -> i32 {`

- [`square_of`](bake.rs#L40) — The texel square of column `(x, y)` within an area drawn at `pixels_per_tile`, as
  - Firma: `pub fn square_of(&self, x: i32, y: i32, pixels_per_tile: u32) -> Option<(u32, u32)> {`

- [`rows`](bake.rs#L50) — Calcula o recupera «rows» según los parámetros de la firma.
  - Firma: `pub fn rows(&self) -> i32 {`

- [`new`](bake.rs#L89) — An empty map over `area`.
  - Firma: `pub fn new(area: MapArea, pixels_per_tile: u32) -> Self {`

- [`clear`](bake.rs#L102) — Clears every texel, keeping the buffer: a chunk rebakes when a neighbour appears, and the
  - Firma: `pub fn clear(&mut self) {`

- [`move_to`](bake.rs#L107) — Points the map at another area of the world and clears it.
  - Firma: `pub fn move_to(&mut self, area: MapArea) {`

- [`square_of`](bake.rs#L121) — The texel square of one column, as `(x, y)` of its corner in texels. `None` outside the
  - Firma: `pub fn square_of(&self, x: i32, y: i32) -> Option<(u32, u32)> {`

- [`is_empty`](bake.rs#L126) — Whether any texel carries coverage, so the client can skip a chunk nothing shades.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`at`](bake.rs#L150) — Coverage in `[0, 1]` at `(u, v)`, both in `[0, 1]` over the artwork, `(0, 0)` being its
  - Firma: `pub fn at(&self, u: f64, v: f64) -> f64 {`

- [`at_texel`](bake.rs#L158) — Coverage at a place already in plane texels, which is how the bake walks it: the place
  - Firma: `pub fn at_texel(&self, x: f64, y: f64) -> f64 {`

- [`bake_ground_shadows`](bake.rs#L176) — Calcula o recupera «bake ground shadows» según los parámetros de la firma.
  - Firma: `pub fn bake_ground_shadows( map: &mut ShadowMap, casters: &[ShadowCaster], ground: Option<&HeightField>, light: &ShadowProjection, tile_width: f64, box_height: f64, level_at: ReceivingLevel<'_>, silhouette_of: SilhouetteOf<'_, '_>, ) {`

- [`new`](bake.rs#L219) — Reads the levels `map`'s area receives shadows on, which every later step needs.
  - Firma: `pub fn new(map: &ShadowMap, level_at: ReceivingLevel<'_>) -> Self {`

- [`is_done`](bake.rs#L228) — Evalúa si se cumple la condición «done» para el estado recibido.
  - Firma: `pub fn is_done(&self) -> bool {`

- [`step`](bake.rs#L235) — Calcula o recupera «step» según los parámetros de la firma.
  - Firma: `pub fn step( &mut self, map: &mut ShadowMap, casters: &[ShadowCaster], ground: Option<&HeightField>, light: &ShadowProjection, tile_width: f64, box_height: f64, silhouette_of: SilhouetteOf<'_, '_>, ) -> bool {`

- [`blur`](bake.rs#L704) — A separable box blur over the whole map: the penumbra.
  - Firma: `pub fn blur(map: &mut ShadowMap, radius: u32) {`

#### Constantes

- [`SHADOW_MAP_PIXELS_PER_TILE`](bake.rs#L7) — Texels of a shadow map per tile of world.
  - Declaración: `pub const SHADOW_MAP_PIXELS_PER_TILE: u32 = 36;`

- [`SHADOW_MAP_MARGIN`](bake.rs#L10) — Tiles a chunk's map reaches past the chunk on every side, so the blur of a shadow crossing a
  - Declaración: `pub const SHADOW_MAP_MARGIN: i32 = 1;`

- [`SHADOW_BLUR_TEXELS`](bake.rs#L13) — Radius of the box blur the bake finishes with, in texels: the penumbra.
  - Declaración: `pub const SHADOW_BLUR_TEXELS: u32 = 1;`

### `faces.rs`

#### Funciones y métodos

- [`point`](faces.rs#L27) — The world point `along` of the way across the face and `down` of the way down it.
  - Firma: `pub fn point(&self, along: f64, down: f64) -> (f64, f64, f64) {`

- [`terrain_faces`](faces.rs#L38) — Every exposed face of `columns`, towards the camera only, split at block boundaries.
  - Firma: `pub fn terrain_faces( columns: impl IntoIterator<Item = (i32, i32, f64, TerrainMaterial)>, level_at: impl Fn(i32, i32) -> Option<f64>, floor: f64, ) -> Vec<TerrainFace> {`

### `phases.rs`

#### Funciones y métodos

- [`opacity`](phases.rs#L14) — The opacity its shadows are drawn at, which is all the two numbers are ever used for
  - Firma: `pub fn opacity(&self) -> f64 {`

#### Constantes

- [`DAWN`](phases.rs#L20) — Sunrise: the sun low in the east, so shadows run long and almost straight along world `−x`.
  - Declaración: `pub const DAWN: PhaseLight = PhaseLight {`

- [`DAY`](phases.rs#L31) — Midday: light from the upper right, short shadows at full strength.
  - Declaración: `pub const DAY: PhaseLight = PhaseLight {`

- [`SUNSET`](phases.rs#L42) — Sunset: the sun low in the south, shadows as long as dawn's and turned a quarter.
  - Declaración: `pub const SUNSET: PhaseLight = PhaseLight {`

- [`NIGHT`](phases.rs#L53) — Night: a dim moon, shadows short and faint.
  - Declaración: `pub const NIGHT: PhaseLight = PhaseLight {`

### `received.rs`

#### Funciones y métodos

- [`columns`](received.rs#L20) — Calcula o recupera «columns» según los parámetros de la firma.
  - Firma: `pub fn columns(&self) -> u32 {`

- [`rows`](received.rs#L24) — Calcula o recupera «rows» según los parámetros de la firma.
  - Firma: `pub fn rows(&self) -> u32 {`

- [`at`](received.rs#L29) — How dark the corner `column` across and `row` down is, in `[0, 1]`.
  - Firma: `pub fn at(&self, column: u32, row: u32) -> f32 {`

- [`is_clear`](received.rs#L36) — Whether every corner is clear, so the client draws the sprite as one quad again.
  - Firma: `pub fn is_clear(&self) -> bool {`

- [`shade_grid`](received.rs#L54) — Calcula o recupera «shade grid» según los parámetros de la firma.
  - Firma: `pub fn shade_grid( receiver: &ShadowReceiver, casters: &[ShadowCaster], light: &ShadowProjection, opacity: f64, tile_width: f64, box_height: f64, silhouette_of: super::bake::SilhouetteOf<'_, '_>, ground: Option<&HeightField>, columns: u32, rows: u32, ) -> Option<ShadeGrid> {`

- [`shaded_at`](received.rs#L137) — How shaded one point of the world is, by the casters around it and by the ground.
  - Firma: `pub fn shaded_at( point: ShadowPoint, casters: &[ShadowCaster], light: &ShadowProjection, tile_width: f64, box_height: f64, silhouette_of: super::bake::SilhouetteOf<'_, '_>, ground: Option<&HeightField>, ) -> f64 {`

#### Constantes

- [`SHADE_COLUMNS`](received.rs#L8) — Corners across a receiver's artwork, and down it.
  - Declaración: `pub const SHADE_COLUMNS: u32 = 8;`

- [`SHADE_ROWS`](received.rs#L9) — Define cuántas filas contiene la tabla de tonos de sombra recibida.
  - Declaración: `pub const SHADE_ROWS: u32 = 16;`

### `shadow.rs`

#### Funciones y métodos

- [`apply`](shadow.rs#L16) — Where `point` lands.
  - Firma: `pub fn apply(&self, point: (f64, f64)) -> (f64, f64) {`

- [`inverse`](shadow.rs#L24) — The map back, or `None` when this one collapses the plane onto a line.
  - Firma: `pub fn inverse(&self) -> Option<Self> {`

- [`tiles_per_pixel_of_height`](shadow.rs#L63) — Tiles of world length per screen pixel of height.
  - Firma: `pub fn tiles_per_pixel_of_height(tile_width: f64) -> f64 {`

- [`tiles_per_pixel_across`](shadow.rs#L68) — Tiles of world length per screen pixel *across* the shadow, where the sprite keeps its own
  - Firma: `pub fn tiles_per_pixel_across(tile_width: f64) -> f64 {`

- [`block_height_in_tiles`](shadow.rs#L73) — Height of one block in tiles of world length (about half a tile).
  - Firma: `pub fn block_height_in_tiles(box_height: f64, tile_width: f64) -> f64 {`

- [`silhouette_matrix`](shadow.rs#L78) — Lays a sprite's silhouette on the ground as its shadow: screen pixels relative to the
  - Firma: `pub fn silhouette_matrix( light: &ShadowProjection, foot: (f64, f64), lift: f64, tile_width: f64, box_height: f64, ) -> Affine2D {`

- [`lift_reach`](shadow.rs#L100) — How far down the shadow a plane `lift` blocks below the caster's own ground moves it, in
  - Firma: `pub fn lift_reach( light: &ShadowProjection, lift: f64, tile_width: f64, box_height: f64, ) -> f64 {`

- [`cast_shadow_offset`](shadow.rs#L110) — Where the sun lays a caster's silhouette on another upright cut-out, in screen pixels.
  - Firma: `pub fn cast_shadow_offset( light: &ShadowProjection, caster_foot: (f64, f64), receiver_foot: (f64, f64), lift: f64, tile_width: f64, box_height: f64, ) -> Option<(f64, f64)> {`

- [`shadow_reach`](shadow.rs#L132) — Farthest ground distance (tiles) the shadow of something `height` screen pixels tall can
  - Firma: `pub fn shadow_reach(height: f64, lift: f64, tile_width: f64, box_height: f64) -> f64 {`

#### Constantes

- [`MAX_SHADOW_STRETCH`](shadow.rs#L60) — Cap on how far a unit of height reaches when the sun is low (`1 / tan(altitude)`).
  - Declaración: `pub const MAX_SHADOW_STRETCH: f64 = 4.0;`

### `terrain.rs`

#### Funciones y métodos

- [`coverage`](terrain.rs#L23) — How shaded a receiver `elevation` blocks up is, in `[0, 1]`.
  - Firma: `pub fn coverage(&self, elevation: f64) -> f64 {`

- [`new`](terrain.rs#L45) — Reads every column of `min_x..=max_x` by `min_y..=max_y`, grown by the ray's reach.
  - Firma: `pub fn new( min_x: i32, min_y: i32, max_x: i32, max_y: i32, level_at: impl Fn(i32, i32) -> Option<f64>, ) -> Self {`

- [`is_empty`](terrain.rs#L68) — Whether no column of the field has any ground, so every walk would come back clear.
  - Firma: `pub fn is_empty(&self) -> bool {`

- [`horizon`](terrain.rs#L80) — Walks back towards the sun from the cell under `(px, py)` and returns what it finds.
  - Firma: `pub fn horizon(&self, px: f64, py: f64, light: &ShadowProjection, box_height: f64, tile_width: f64) -> Horizon {`

- [`receiver_point`](terrain.rs#L150) — Where a pixel of an upright sprite is in the world, so the ground's horizon can be asked
  - Firma: `pub fn receiver_point( foot: ShadowPoint, screen_foot: (f64, f64), screen: (f64, f64), light: &ShadowProjection, tile_width: f64, box_height: f64, ) -> ShadowPoint {`

#### Constantes

- [`TERRAIN_RAY_REACH`](terrain.rs#L6) — How far back along the light the ground is searched, in tiles.
  - Declaración: `pub const TERRAIN_RAY_REACH: f64 = 12.0;`

- [`CLEAR`](terrain.rs#L20) — A horizon that shades nothing, for a point the walk never found ground for.
  - Declaración: `pub const CLEAR: Self = Self { elevation: f64::NEG_INFINITY, width: 0.1 };`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `bake.rs`

#### Funciones internas

- [`within`](bake.rs#L312) — The steps `0..=steps` of a walk starting at `from` and moving by `step` that stay in
  - Firma: `fn within(from: f64, step: f64, low: f64, high: f64, steps: u32) -> Option<(u32, u32)> {`

- [`meet`](bake.rs#L324) — The steps both runs hold, or `None` when they share none.
  - Firma: `fn meet(one: (u32, u32), other: (u32, u32)) -> Option<(u32, u32)> {`

- [`horizon_lattice_shape`](bake.rs#L333) — Lays the shadow the ground casts on itself over every texel.
  - Firma: `fn horizon_lattice_shape(map: &ShadowMap) -> (u32, u32, u32) {`

- [`horizon_rows`](bake.rs#L340) — Calcula o recupera «horizon rows» según los parámetros de la firma.
  - Firma: `fn horizon_rows( map: &ShadowMap, ground: &HeightField, light: &ShadowProjection, tile_width: f64, box_height: f64, from: u32, rows: u32, out: &mut Vec<Horizon>, ) -> u32 {`

- [`lay_terrain_rows`](bake.rs#L364) — Lays the ground's own shadow over `rows` rows of columns, starting at the row `from` of the
  - Firma: `fn lay_terrain_rows( map: &mut ShadowMap, lattice: &[Horizon], levels: &LevelCache, from: i32, rows: i32, ) -> i32 {`

- [`clear_columns_without_ground`](bake.rs#L473) — Blanks the square of every column the world has no ground for.
  - Firma: `fn clear_columns_without_ground(map: &mut ShadowMap, levels: &LevelCache) {`

- [`new`](bake.rs#L501) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `fn new(area: MapArea, level_at: ReceivingLevel<'_>) -> Self {`

- [`at`](bake.rs#L518) — Calcula o recupera «at» según los parámetros de la firma.
  - Firma: `fn at(&self, x: i32, y: i32) -> Option<f64> {`

- [`any`](bake.rs#L528) — Calcula o recupera «any» según los parámetros de la firma.
  - Firma: `fn any(&self) -> bool {`

- [`lay_caster`](bake.rs#L534) — Lays one caster's silhouette over every texel its shadow can reach.
  - Firma: `fn lay_caster( map: &mut ShadowMap, caster: &ShadowCaster, light: &ShadowProjection, tile_width: f64, box_height: f64, levels: &mut LevelCache, silhouette_of: SilhouetteOf<'_, '_>, ) {`

- [`shadow_box`](bake.rs#L644) — The box the shadow of `laid` covers once a lift has moved it `shift` tiles down the light.
  - Firma: `fn shadow_box(laid: &[(f64, f64); 4], shift: f64, light: &ShadowProjection) -> WorldBox {`

- [`union`](bake.rs#L659) — Calcula o recupera «union» según los parámetros de la firma.
  - Firma: `fn union(a: WorldBox, b: WorldBox) -> WorldBox {`

- [`columns_touched`](bake.rs#L664) — The columns of `area` that `box` overlaps, or `None` when it misses the area altogether.
  - Firma: `fn columns_touched(area: MapArea, world: WorldBox) -> Option<(i32, i32, i32, i32)> {`

- [`texels_of`](bake.rs#L676) — The texels of one column's square that `box` overlaps, clamped to the map.
  - Firma: `fn texels_of( map: &ShadowMap, column_x: i32, column_y: i32, world: WorldBox, ) -> Option<(u32, u32, u32, u32)> {`

- [`blur_across_within_levels`](bake.rs#L728) — The same blur, but never reading across a step in the ground.
  - Firma: `fn blur_across_within_levels(map: &mut ShadowMap, radius: u32, levels: &LevelCache) {`

- [`blur_down_within_levels`](bake.rs#L784) — The second pass of [`blur_within_levels`], down the map, run a row at a time.
  - Firma: `fn blur_down_within_levels(map: &mut ShadowMap, span: usize, levels: &LevelCache) {`

- [`mark_cuts`](bake.rs#L858) — Calcula o recupera «mark cuts» según los parámetros de la firma.
  - Firma: `fn mark_cuts(cuts: &mut [bool], per_tile: usize, flush: impl Fn(usize) -> bool) {`

- [`full_window_means`](bake.rs#L866) — Every quotient a full window of the blur can come to, worked out once.
  - Firma: `fn full_window_means(span: usize) -> Vec<u8> {`

- [`window_mean`](bake.rs#L872) — The mean of `line` over `at ± span`, with the ends clamped and `means` for a full window.
  - Firma: `fn window_mean(line: &[u8], at: usize, span: usize, means: &[u8]) -> u8 {`

- [`mean`](bake.rs#L884) — The mean of `line` over `at ± span`, with the ends clamped.
  - Firma: `fn mean(line: &[u8], at: usize, span: usize) -> u8 {`

#### Constantes internas

- [`HORIZON_ROWS_PER_STEP`](bake.rs#L201) — Lattice rows walked, and rows of columns shaded, in one piece of work.
  - Declaración: `const HORIZON_ROWS_PER_STEP: u32 = 8;`

- [`TERRAIN_ROWS_PER_STEP`](bake.rs#L202) — Define el parámetro interno «TERRAIN ROWS PER STEP» empleado por este módulo.
  - Declaración: `const TERRAIN_ROWS_PER_STEP: i32 = 4;`

- [`TERRAIN_SAMPLES_PER_TILE`](bake.rs#L330) — How often across a tile the ground's horizon is asked about.
  - Declaración: `const TERRAIN_SAMPLES_PER_TILE: u32 = 3;`

### `terrain.rs`

#### Funciones internas

- [`level`](terrain.rs#L72) — Calcula o recupera «level» según los parámetros de la firma.
  - Firma: `fn level(&self, x: i32, y: i32) -> f64 {`

- [`signum`](terrain.rs#L131) — Calcula o recupera «signum» según los parámetros de la firma.
  - Firma: `fn signum(value: f64) -> i32 {`

#### Constantes internas

- [`SURFACE_BIAS`](terrain.rs#L9) — How far under the horizon a surface has to be before it counts as shaded, in blocks.
  - Declaración: `const SURFACE_BIAS: f64 = 0.04;`
