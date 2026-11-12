# Assets

Este dominio describe los datos que componen un atlas: manifiestos versionados, marcos, hojas de poses y su geometría medida. Es la fuente de verdad para identificar sprites y sus límites sin acoplarse a un formato de imagen ni a una biblioteca gráfica.

Los módulos deben mantener datos serializables, validables y estables entre versiones. Las rutas o identificadores incluidos aquí son contratos de contenido; los cambios incompatibles requieren una migración explícita del manifiesto.

No carga archivos, no administra cachés y no dibuja texturas. Esas responsabilidades pertenecen al cliente de presentación.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `ink.rs`

#### Funciones y métodos

- [`elevation_step`](ink.rs#L19) — Hasta dónde sube un paso de elevación en pantalla, para los dibujos trazados según esta plantilla.
  - Firma: `pub fn elevation_step(tile_width: f64) -> f64 {`

- [`rounded`](ink.rs#L34) — La caja redondeada a seis decimales de un ancho de casilla, para escribirla en el manifiesto.
  - Firma: `pub fn rounded(self) -> Self {`

- [`scaled`](ink.rs#L45) — El mismo dibujo escalado en torno al suelo sobre el que se apoya, de modo que permanezca en su sitio.
  - Firma: `pub fn scaled(self, by: f64) -> Self {`

- [`asset_ink`](ink.rs#L56) — Mide el dibujo en `svg`, o `None` si no se trata de un único asset trazado según la plantilla.
  - Firma: `pub fn asset_ink(svg: &str) -> Option<InkBox> {`

- [`data_tiles`](ink.rs#L99) — La huella y la altura declaradas del asset, `"3x1x5"`, si las tiene.
  - Firma: `pub fn data_tiles(svg: &str) -> Option<&str> {`

- [`attribute`](ink.rs#L144) — El valor de `name="..."` en `text`, coincidiendo con el nombre completo del atributo.
  - Firma: `pub(super) fn attribute<'a>(text: &'a str, name: &str) -> Option<&'a str> {`

#### Constantes

- [`SVG_TILE_WIDTH`](ink.rs#L4) — Ancho de una casilla en las unidades propias del SVG.
  - Declaración: `pub const SVG_TILE_WIDTH: f64 = 1024.0;`

- [`SVG_ANCHOR`](ink.rs#L7) — Posición en pantalla del centro del suelo de la casilla de ancla en las unidades propias del SVG.
  - Declaración: `pub const SVG_ANCHOR: (f64, f64) = (512.0, 256.0);`

- [`SVG_BLOCK_HEIGHT`](ink.rs#L10) — Altura del cuerpo de un bloque en las unidades propias del SVG: hasta dónde sube un paso de elevación.
  - Declaración: `pub const SVG_BLOCK_HEIGHT: f64 = 341.0;`

### `layout.rs`

#### Funciones y métodos

- [`ink_layout`](layout.rs#L18) — Coloca el dibujo de un asset de modo que aterrice donde fue trazado, en relación con `ground`: el
  - Firma: `pub fn ink_layout(ground: ScreenPoint, ink: InkBox, tile_width: f64) -> SpriteLayout {`

- [`corners`](layout.rs#L36) — Las esquinas de la banda en pantalla, en orden de dibujo.
  - Firma: `pub fn corners(&self) -> &[(f64, f64)] {`

- [`uvs`](layout.rs#L42) — Dónde cada esquina lee el dibujo completo, como fracciones `(along, down)` de las dimensiones de `layout`; una banda sesgada conserva estas fracciones sin sesgar.
  - Firma: `pub fn uvs(&self) -> &[(f64, f64)] {`

- [`footprint_band`](layout.rs#L48) — La banda de un sprite de varias casillas que se apoya en la casilla `index` de su huella.
  - Firma: `pub fn footprint_band( layout: SpriteLayout, centre: ScreenPoint, step: (f64, f64), index: i32, cells: i32, bleed: f64, ) -> Option<SpriteBand> {`

- [`sway_band`](layout.rs#L99) — La pieza de `layout` por encima (`top: true`), o por debajo, de la línea horizontal en `cut` (fracción de la altura desde el borde superior, limitada a `(0, 1)`; `None` si el corte no separa nada). El borde lejano de la pieza superior queda `shear` píxeles a la derecha de donde estaría; el borde sobre el corte no se mueve, de modo que la copa se inclina alrededor del corte y el tronco queda quieto.
  - Firma: `pub fn sway_band( layout: SpriteLayout, cut: f64, shear: f64, top: bool, ) -> Option<SpriteBand> {`

### `manifest.rs`

#### Funciones y métodos

- [`primary_frame`](manifest.rs#L93) — Devuelve el primer marco disponible (único o primero de varios).
  - Firma: `pub fn primary_frame(&self) -> Option<SpriteFrame> {`

- [`sheet_frame`](manifest.rs#L99) — El marco de la pose en la `column` de la fila de `facing`, para una entrada de hoja.
  - Firma: `pub fn sheet_frame(&self, facing: usize, column: usize) -> Option<SpriteFrame> {`

- [`texture_size`](manifest.rs#L112) — El tamaño de la textura de la que se recortan los marcos de esta entrada, que es el atlas salvo que la
  - Firma: `pub fn texture_size(&self, atlas: SpriteFrame) -> SpriteFrame {`

- [`frame_count`](manifest.rs#L117) — Número de marcos de animación.
  - Firma: `pub fn frame_count(&self) -> usize {`

- [`validate_manifest`](manifest.rs#L173) — Valida un manifiesto: versión de esquema, ids únicos, marcos dentro del atlas.
  - Firma: `pub fn validate_manifest(manifest: &AssetManifest) -> Result<(), ManifestError> {`

#### Constantes

- [`MANIFEST_SCHEMA_VERSION`](manifest.rs#L137) — Versión de esquema de manifiesto que este crate entiende.
  - Declaración: `pub const MANIFEST_SCHEMA_VERSION: u32 = 2;`

### `sheet.rs`

#### Funciones y métodos

- [`rows`](sheet.rs#L29) — Filas de la hoja: una por facing.
  - Firma: `pub fn rows(&self) -> usize {`

- [`cell_id`](sheet.rs#L34) — El id del grupo que contiene la pose en la `column` de la fila de `facing`, tal como el dibujo la nombra
  - Firma: `pub fn cell_id(&self, facing: usize, column: usize) -> Option<String> {`

- [`ink`](sheet.rs#L46) — Dónde pertenece el dibujo de cada casilla sobre el suelo en el que se apoya el jugador, en casillas
  - Firma: `pub fn ink(&self) -> InkBox {`

- [`parse_sheet`](sheet.rs#L57) — Lee la cuadrícula del SVG de una hoja, o `None` si no lo es (sin `data-frames`).
  - Firma: `pub fn parse_sheet(svg: &str) -> Option<SheetGrid<'_>> {`

#### Constantes

- [`SVG_CANVAS_TOP`](sheet.rs#L6) — Parte superior del lienzo de la plantilla de personaje en las unidades propias del SVG.
  - Declaración: `pub const SVG_CANVAS_TOP: f64 = -SVG_BLOCK_HEIGHT;`

### `terrain_sprites.rs`

#### Funciones y métodos

- [`terrain_sprite_source`](terrain_sprites.rs#L9) — Ruta de origen del asset de bloque que dibuja `material`. Las gradas responden con el bloque de camino liso: solo la cima de su columna se lee como escalones, y esa obra la da `stairs_sprite_source` cuando ya se conoce la dirección.
  - Firma: `pub fn terrain_sprite_source(material: TerrainMaterial) -> &'static str {`

- [`path_sprite_source`](terrain_sprites.rs#L61) — Ruta de origen del bloque de camino para la máscara de conexión `mask` (solo los cuatro bits bajos).
  - Firma: `pub fn path_sprite_source(mask: u8) -> &'static str {`

- [`stairs_sprite_source`](terrain_sprites.rs) — Ruta del bloque de gradas cuya subida va hacia `direction`, o `None` si no es una de las cuatro caras.
  - Firma: `pub fn stairs_sprite_source(direction: WorldCoord) -> Option<&'static str> {`

- [`terrain_reflection_source`](terrain_sprites.rs#L68) — Ruta de origen del asset de reflexión de `material`, dibujado como lo muestra el agua, o `None` para el propio agua.
  - Firma: `pub fn terrain_reflection_source(material: TerrainMaterial) -> Option<&'static str> {`

#### Constantes

- [`PATH_BLOCK_SOURCES`](terrain_sprites.rs#L22) — Las dieciséis rutas de origen de los bloques de camino, una por máscara de conexión: el índice es la máscara (bit `1` se une a +x, `2` a +y, `4` a −x, `8` a −y).
  - Declaración: `pub const PATH_BLOCK_SOURCES: [&str; 16] = [`

- [`STAIRS_BLOCK_SOURCES`](terrain_sprites.rs) — Ruta del bloque de gradas para cada dirección hacia la que sube la escalera, en el orden del contrato (+x, +y, −x, −y). Cada archivo está dibujado en su propia orientación, nunca espejado, así que las caras iluminadas y las sombreadas se quedan donde las pone el sol.
  - Declaración: `pub const STAIRS_BLOCK_SOURCES: [(WorldCoord, &str); 4] = [...];`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `ink.rs`

#### Funciones internas

- [`footprint`](ink.rs#L104) — Hasta dónde se extiende la huella desde su ancla y a lo largo de cuál de los ejes del *dibujo*, a partir de
  - Firma: `fn footprint(svg: &str) -> (i32, bool) {`

- [`visible_elements`](ink.rs#L122) — El texto de cada elemento que dibuja algo: fuera de esos contenedores, y que no sea uno de los
  - Firma: `fn visible_elements(svg: &str) -> impl Iterator<Item = &str> {`

- [`points`](ink.rs#L163) — Cada par `x,y` en la geometría de un path o polígono.
  - Firma: `fn points(geometry: &str) -> impl Iterator<Item = (f64, f64)> + '_ {`

#### Constantes internas

- [`ROW`](ink.rs#L13) — Cuánto baja por la pantalla una casilla a lo largo de cualquiera de los ejes, en anchos de casilla: media casilla
  - Declaración: `const ROW: f64 = 0.25;`

- [`HALF_TILE`](ink.rs#L16) — Cuánto se desplaza por la pantalla una casilla a lo largo de cualquiera de los ejes, en anchos de casilla.
  - Declaración: `const HALF_TILE: f64 = 0.5;`

- [`SKIPPED`](ink.rs#L119) — Contenedores cuyo contenido no describe nada que se dibuje: filtros y degradados, y los
  - Declaración: `const SKIPPED: [&str; 2] = ["defs", "metadata"];`

### `layout.rs`

#### Funciones internas

- [`clip`](layout.rs#L142) — Sutherland–Hodgman: la parte de un polígono convexo donde `inside` no es negativa.
  - Firma: `fn clip(band: SpriteBand, inside: impl Fn((f64, f64)) -> f64) -> Option<SpriteBand> {`

- [`push`](layout.rs#L171) — Añade el valor recibido a la colección o secuencia administrada.
  - Firma: `fn push(&mut self, corner: (f64, f64), uv: (f64, f64)) {`

### `manifest.rs`

#### Funciones internas

- [`fmt`](manifest.rs#L151) — Formato del error de manifiesto para `std::fmt::Display`.
  - Firma: `fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {`
