# Lighting

Este dominio de cliente implementa en Macroquad las sombras de nubes, siluetas, atlas y vistas derivados de `iso::lighting`. Materializa los cálculos puros de iluminación como recursos, máscaras y operaciones de presentación.

Debe adaptar el dominio sin introducir reglas alternativas de luz o de fase. La gestión de texturas, cámaras auxiliares y materiales visuales permanece encapsulada en este límite de infraestructura.

No es la fuente de verdad para geometría, exposición ni orden de sombras; esas decisiones pertenecen al crate `iso`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `cloud_shadows.rs`

#### Funciones y métodos

- [`new`](cloud_shadows.rs#L26) — El patrón en reposo, dibujado desde `texture`.
  - Firma: `pub fn new(texture: Texture2D) -> Self {`

- [`advance`](cloud_shadows.rs#L35) — Hace avanzar las nubes `elapsed_ms` de tiempo real.
  - Firma: `pub fn advance(&mut self, elapsed_ms: f64) {`

- [`draw`](cloud_shadows.rs#L43) — Dibuja el patrón sobre la vista, con tantas copias como hagan falta para cubrirla.
  - Firma: `pub fn draw(&self, origin: (f64, f64), tile: (f64, f64), screen: (f64, f64)) {`

- [`cloud_copies`](cloud_shadows.rs#L69) — Dónde va cada copia del patrón para cubrir una vista de tamaño `screen`, dada la esquina superior izquierda
  - Firma: `pub fn cloud_copies(anchor: (f64, f64), period: (f64, f64), screen: (f64, f64)) -> Vec<(f64, f64)> {`

#### Constantes

- [`CLOUD_SHADOW_SOURCE`](cloud_shadows.rs#L6) — La ruta desde la que se carga el patrón, relativa a la raíz del cliente.
  - Declaración: `pub const CLOUD_SHADOW_SOURCE: &str = "content/cloud-shadow.png";`

- [`CLOUD_PERIOD_TILES`](cloud_shadows.rs#L9) — Cuántas casillas abarca la repetición del patrón, a lo largo de ambos ejes de pantalla.
  - Declaración: `pub const CLOUD_PERIOD_TILES: f64 = 12.0;`

- [`CLOUD_SHADOW_ALPHA`](cloud_shadows.rs#L12) — Opacidad del patrón completo: un tono plano, para que las nubes solapadas nunca se acumulen.
  - Declaración: `pub const CLOUD_SHADOW_ALPHA: f32 = 0.18;`

- [`CLOUD_DRIFT`](cloud_shadows.rs#L15) — A qué velocidad derivan las nubes, en fracción de casilla por segundo real: `x` a lo largo de la pantalla,
  - Declaración: `pub const CLOUD_DRIFT: (f64, f64) = (2.0 / 40.0, 0.5 / 20.0);`

### `shadow_view.rs`

#### Funciones y métodos

- [`new`](shadow_view.rs#L103) — Una escena vacía iluminada por la fase `phase`, que muestrea `masks`.
  - Firma: `pub fn new( phase: BakePhase, masks: SilhouetteMasks, atlas: ShadowAtlas, tile_width: f64, box_height: f64, ) -> Self {`

- [`phase`](shadow_view.rs#L127) — La fase con la que se hornean las sombras actuales.
  - Firma: `pub fn phase(&self) -> BakePhase {`

- [`set_phase`](shadow_view.rs#L132) — Cambia de fase e invalida los mapas derivados para rehornear los chunks visibles.
  - Firma: `pub fn set_phase(&mut self, phase: BakePhase) {`

- [`update`](shadow_view.rs#L148) — Dedica hasta [`BAKE_BUDGET_MS`] a poner al día el horneado para `shown`, y olvida
  - Firma: `pub fn update(&mut self, manager: &ChunkManager, shown: &[ChunkCoord]) {`

- [`collect_faces`](shadow_view.rs#L515) — Encola la sombra en cada cara vertical expuesta del terreno de `coord`.
  - Firma: `pub fn collect_faces( &self, coord: ChunkCoord, projection: ProjectionConfig, out: &mut Vec<SpriteDraw>, ) {`

- [`shade_of`](shadow_view.rs#L561) — Las sombras que caen sobre la entidad situada en `cell`, si se horneó alguna.
  - Firma: `pub fn shade_of(&self, coord: ChunkCoord, cell: (i32, i32)) -> Option<&ShadeGrid> {`

- [`shade_moving`](shadow_view.rs#L566) — Las sombras que caen sobre algo situado donde está el jugador, muestreadas ahora.
  - Firma: `pub fn shade_moving( &self, manager: &ChunkManager, receiver: &ShadowReceiver, ) -> Option<ShadeGrid> {`

- [`collect_ground`](shadow_view.rs#L602) — Encola la sombra de terreno de cada columna sombreada de `chunk`, para ordenarla y dibujarla con
  - Firma: `pub fn collect_ground( &self, coord: ChunkCoord, columns: &[TerrainColumn], projection: ProjectionConfig, out: &mut Vec<SpriteDraw>, ) {`

- [`extent_of_ink`](shadow_view.rs#L679) — Dónde se dibuja un dibujo medido alrededor del punto de terreno sobre el que se apoya, en píxeles de pantalla.
  - Firma: `pub fn extent_of_ink(ink: InkBox, tile_width: f64) -> SpriteExtent {`

- [`receiver_of`](shadow_view.rs#L690) — El receiver que forma un sprite dibujado en `layout` y situado en `foot` a elevación `elevation`.
  - Firma: `pub fn receiver_of( layout: SpriteLayout, feet: ScreenPoint, foot: (f64, f64), elevation: f64, ) -> ShadowReceiver {`

- [`lattice_of`](shadow_view.rs#L709) — Una retícula lista para dibujar un sprite, o `None` cuando al final nada lo sombrea.
  - Firma: `pub fn lattice_of(grid: &ShadeGrid) -> Option<ShadeLattice> {`

#### Constantes

- [`BAKE_BUDGET_MS`](shadow_view.rs#L24) — Cuánto tiempo puede dedicar un fotograma a hornear sombras.
  - Declaración: `pub const BAKE_BUDGET_MS: f64 = 3.0;`

- [`GROUND_SHADOW_LAYER`](shadow_view.rs#L30) — Las sombras de terreno se dibujan sobre el terreno de su propia columna y bajo cualquier cosa situada sobre él.
  - Declaración: `pub const GROUND_SHADOW_LAYER: i32 = 1;`

- [`FACE_FLOOR`](shadow_view.rs#L36) — Hasta qué profundidad de la cara expuesta de una columna se calcula la sombra, en bloques.
  - Declaración: `pub const FACE_FLOOR: f64 = 10.0;`

- [`ENTITY_SHADE_COLUMNS`](shadow_view.rs#L39) — Esquinas a lo ancho del dibujo de una entidad, y hacia abajo, para las sombras que recibe.
  - Declaración: `pub const ENTITY_SHADE_COLUMNS: u32 = 6;`

- [`ENTITY_SHADE_ROWS`](shadow_view.rs#L40) — Define cuántas filas contiene la banda de sombreado aplicada a entidades.
  - Declaración: `pub const ENTITY_SHADE_ROWS: u32 = 10;`

### `shadow_view_atlas.rs`

#### Funciones y métodos

- [`new`](shadow_view_atlas.rs#L35) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`slot_of`](shadow_view_atlas.rs#L43) — El slot en el que está `coord`, sin contarlo como un uso.
  - Firma: `pub fn slot_of(&self, coord: ChunkCoord) -> Option<usize> {`

- [`touch`](shadow_view_atlas.rs#L50) — El slot en el que está `coord`, contando la petición como el uso más reciente.
  - Firma: `pub fn touch(&mut self, coord: ChunkCoord) -> Option<usize> {`

- [`claim`](shadow_view_atlas.rs#L58) — Asigna a `coord` un slot: el que ya tiene, o uno libre, o aquel cuyo chunk
  - Firma: `pub fn claim(&mut self, coord: ChunkCoord) -> (usize, Option<ChunkCoord>) {`

- [`release`](shadow_view_atlas.rs#L80) — Libera el slot que `coord` tenga, porque el stream lo ha descartado.
  - Firma: `pub fn release(&mut self, coord: ChunkCoord) {`

- [`slot_origin`](shadow_view_atlas.rs#L88) — Dónde empieza un slot en el atlas, en texels.
  - Firma: `pub fn slot_origin(slot: usize) -> (u32, u32) {`

- [`square_in_slot`](shadow_view_atlas.rs#L97) — El cuadrado de texels de la columna `(x, y)` dentro del slot que aloja su propio chunk.
  - Firma: `pub fn square_in_slot(coord: ChunkCoord, x: i32, y: i32) -> Option<(u32, u32)> {`

- [`atlas_uv`](shadow_view_atlas.rs#L108) — La coordenada de textura de un punto del mapa de un chunk, en `[0, 1]` a lo largo del atlas completo.
  - Firma: `pub fn atlas_uv(slot: usize, texel: (f64, f64)) -> (f32, f32) {`

- [`new`](shadow_view_atlas.rs#L125) — Un atlas vacío.
  - Firma: `pub fn new() -> Self {`

- [`texture`](shadow_view_atlas.rs#L153) — La textura, para entregársela al material de la escena.
  - Firma: `pub fn texture(&self) -> &Texture2D {`

- [`put`](shadow_view_atlas.rs#L158) — Coloca `map` en el slot de `coord` y devuelve el chunk desalojado de ese slot, si lo hay.
  - Firma: `pub fn put(&mut self, coord: ChunkCoord, map: &ShadowMap) -> Option<ChunkCoord> {`

- [`release`](shadow_view_atlas.rs#L179) — Libera el slot de `coord`.
  - Firma: `pub fn release(&mut self, coord: ChunkCoord) {`

- [`touch`](shadow_view_atlas.rs#L184) — Si el mapa de `coord` está en el atlas, contando la petición como un uso.
  - Firma: `pub fn touch(&mut self, coord: ChunkCoord) -> Option<usize> {`

- [`slot_of`](shadow_view_atlas.rs#L189) — En qué slot está el mapa de `coord`, para las coordenadas de textura de sus columnas.
  - Firma: `pub fn slot_of(&self, coord: ChunkCoord) -> Option<usize> {`

- [`holds`](shadow_view_atlas.rs#L194) — Si el mapa de `coord` está en el atlas.
  - Firma: `pub fn holds(&self, coord: ChunkCoord) -> bool {`

#### Constantes

- [`SLOT_TEXELS`](shadow_view_atlas.rs#L8) — El lado de un slot en texels: las columnas de un chunk más el margen con el que se hornea su mapa.
  - Declaración: `pub const SLOT_TEXELS: u32 = (CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) as u32 * SHADOW_MAP_PIXELS_PER_TILE;`

- [`SLOTS_ACROSS`](shadow_view_atlas.rs#L12) — Slots a lo ancho del atlas, y a lo alto.
  - Declaración: `pub const SLOTS_ACROSS: u32 = 3;`

- [`SLOT_COUNT`](shadow_view_atlas.rs#L15) — Cuántos chunks retiene el atlas a la vez.
  - Declaración: `pub const SLOT_COUNT: usize = (SLOTS_ACROSS * SLOTS_ACROSS) as usize;`

- [`ATLAS_TEXELS`](shadow_view_atlas.rs#L18) — El lado del atlas en texels.
  - Declaración: `pub const ATLAS_TEXELS: u32 = SLOT_TEXELS * SLOTS_ACROSS;`

### `shadow_view_masks.rs`

#### Funciones y métodos

- [`load`](shadow_view_masks.rs#L26) — Carga la imagen del atlas en `path` y la reduce a cobertura, una silueta por manifiesto
  - Firma: `pub async fn load(path: &str, manifest: &AssetManifest) -> Option<Self> {`

- [`from_image`](shadow_view_masks.rs#L32) — Reduce `image` a cobertura e indexa los frames propios del manifiesto contra ella.
  - Firma: `pub fn from_image(image: &Image, manifest: &AssetManifest) -> Self {`

- [`ink_of`](shadow_view_masks.rs#L80) — Dónde reside el dibujo de `source` alrededor del terreno sobre el que se apoya, o `None` cuando el
  - Firma: `pub fn ink_of(&self, source: &str) -> Option<InkBox> {`

- [`index_of`](shadow_view_masks.rs#L85) — La silueta del asset en `source`, o `None` si el atlas no tiene ninguna.
  - Firma: `pub fn index_of(&self, source: &str) -> Option<u32> {`

- [`silhouette_of`](shadow_view_masks.rs#L90) — La silueta de `index` como ventana sobre el único plano en el que vive cada máscara, o `None`
  - Firma: `pub fn silhouette_of(&self, index: u32) -> Option<Silhouette<'_>> {`

#### Constantes

- [`MASK_SCALE`](shadow_view_masks.rs#L9) — Cuántos texels del atlas caben en un texel de una máscara, en cada eje.
  - Declaración: `pub const MASK_SCALE: u32 = 4;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `shadow_view.rs`

#### Funciones internas

- [`next_to_bake`](shadow_view.rs#L214) — El chunk que más conviene hornear después: uno que no tiene ninguna sombra antes que uno que ya tiene
  - Firma: `fn next_to_bake(&self, manager: &ChunkManager, shown: &[ChunkCoord]) -> Option<ChunkCoord> {`

- [`advance`](shadow_view.rs#L233) — Hace una parte del trabajo en curso e indica si esa fue la última.
  - Firma: `fn advance(&mut self, manager: &ChunkManager) -> bool {`

- [`start`](shadow_view.rs#L290) — Abre un horneado de `coord`, hasta el punto en que hay un mapa sobre el que volcarlo.
  - Firma: `fn start(&mut self, manager: &ChunkManager, coord: ChunkCoord) {`

- [`ground_field`](shadow_view.rs#L327) — Calcula o recupera «ground field» según los parámetros de la firma.
  - Firma: `fn ground_field( manager: &ChunkManager, min_x: i32, min_y: i32, max_x: i32, max_y: i32, ) -> HeightField {`

- [`ground_cover`](shadow_view.rs#L340) — Lee cuáles de las `count` columnas desde `from` tienen algo de cobertura, añade la
  - Firma: `fn ground_cover( &self, manager: &ChunkManager, coord: ChunkCoord, from: usize, count: usize, out: &mut Vec<bool>, ) -> usize {`

- [`casters_of`](shadow_view.rs#L381) — Las entidades del chunk como casters, en las propias medidas del dibujo.
  - Firma: `fn casters_of(&self, manager: &ChunkManager, coord: ChunkCoord) -> Vec<ShadowCaster> {`

- [`caster_of`](shadow_view.rs#L392) — Una entidad como caster, o `None` cuando el atlas no tiene un dibujo medido para ella.
  - Firma: `fn caster_of(&self, entity: &Entity) -> Option<ShadowCaster> {`

- [`extent_of`](shadow_view.rs#L403) — Dónde se dibuja el dibujo de una entidad alrededor del punto de terreno sobre el que se apoya.
  - Firma: `fn extent_of(&self, entity: &Entity) -> Option<SpriteExtent> {`

- [`shade_entities`](shadow_view.rs#L409) — Las retículas de las entidades propias del chunk, para aquellas a las que algo sombrea.
  - Firma: `fn shade_entities( &self, manager: &ChunkManager, coord: ChunkCoord, casters: &[ShadowCaster], ground: &HeightField, ) -> HashMap<(i32, i32), ShadeGrid> {`

- [`shade_faces`](shadow_view.rs#L458) — La sombra en cada cara vertical expuesta del terreno del chunk.
  - Firma: `fn shade_faces( &self, manager: &ChunkManager, coord: ChunkCoord, casters: &[ShadowCaster], ground: &HeightField, ) -> Vec<(TerrainFace, Rc<ShadeLattice>)> {`

- [`around`](shadow_view.rs#L714) — Los nueve chunks alrededor de `coord`, incluido él mismo, en un orden fijo.
  - Firma: `fn around(coord: ChunkCoord) -> [ChunkCoord; 9] {`

- [`neighbours_loaded`](shadow_view.rs#L730) — Cuáles de los nueve chunks alrededor de `coord` tiene el stream, en un bit cada uno: el horneado que se hizo
  - Firma: `fn neighbours_loaded(manager: &ChunkManager, coord: ChunkCoord) -> u16 {`

#### Constantes internas

- [`GROUND_SHADE_COLUMNS`](shadow_view.rs#L27) — Columnas cuya retícula se lee del mapa en una sola pieza de trabajo.
  - Declaración: `const GROUND_SHADE_COLUMNS: usize = 128;`

- [`FACE_SHADE_STEPS`](shadow_view.rs#L33) — Quads a lo ancho de una cara vertical de terreno expuesta, y a lo alto, para la sombra que la cubre.
  - Declaración: `const FACE_SHADE_STEPS: u32 = 3;`

### `shadow_view_atlas.rs`

#### Funciones internas

- [`default`](shadow_view_atlas.rs#L29) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`
