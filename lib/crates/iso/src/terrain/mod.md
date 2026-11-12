# Terrain

Este dominio modela columnas, materiales, ruido, generación, las máscaras de conexión de camino, las gradas que suben el camino de nivel y la apariencia determinista del terreno. Contiene las reglas que convierten una ubicación del mundo en datos de suelo, elevación y aspecto lógico.

La generación debe ser reproducible a partir de su semilla y parámetros. Las estructuras de terreno se mantienen libres de recursos visuales para que puedan usarse en persistencia, simulación y clientes distintos.

No genera mallas, no carga sprites ni emite draw calls. Esas vistas pertenecen al cliente de presentación.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `appearance.rs`

#### Funciones y métodos

- [`new`](appearance.rs#L15) — `scale` es aproximadamente el ancho de un borrón del campo, en columnas; `detail` es el peso de un
  - Firma: `pub fn new(seed: u64, label: &str, scale: f64, detail: f64) -> Self {`

- [`sample`](appearance.rs#L24) — El valor del campo en la columna `(x, y)`.
  - Firma: `pub fn sample(&self, x: i32, y: i32) -> f64 {`

- [`derive_seed`](appearance.rs#L36) — Un flujo propio para `label` en el mundo de `seed`: FNV-1a sobre la etiqueta, mezclado en la
  - Firma: `pub fn derive_seed(seed: u64, label: &str) -> u64 {`

- [`new`](appearance.rs#L56) — `colors` son multiplicadores `0xRRGGBB`, ordenados de oscuro a claro; una lista vacía no tiñe nada.
  - Firma: `pub fn new(seed: u64, label: &str, scale: f64, colors: &[u32]) -> Option<Self> {`

- [`zone_count`](appearance.rs#L72) — Cuántas zonas tiene la paleta: aquello de lo que una zona elegida es índice.
  - Firma: `pub fn zone_count(&self) -> usize {`

- [`color`](appearance.rs#L77) — El multiplicador de una zona, acotado a la paleta.
  - Firma: `pub fn color(&self, zone: usize) -> u32 {`

- [`at`](appearance.rs#L67) — El multiplicador de la columna `(x, y)`.
  - Firma: `pub fn at(&self, x: i32, y: i32) -> u32 {`

- [`zone_index`](appearance.rs#L83) — En cuál de las `count` partes iguales de `[0, 1]` cae el valor de campo `value`.
  - Firma: `pub fn zone_index(value: f64, count: usize) -> usize {`

- [`tint_channels`](appearance.rs#L89) — Los tres canales de un multiplicador `0xRRGGBB`, cada uno en `[0, 1]`.
  - Firma: `pub fn tint_channels(color: u32) -> (f32, f32, f32) {`

- [`new`](appearance.rs#L120) — `chances` es la proporción de todas las columnas que debe cubrir cada variante, en orden. `None` cuando
  - Firma: `pub fn new(seed: u64, label: &str, chances: &[f64]) -> Option<Self> {`

- [`pick`](appearance.rs#L153) — La variante que crece en la columna `(x, y)`, o `None` para la propia parte superior lisa del material.
  - Firma: `pub fn pick(&self, x: i32, y: i32) -> Option<usize> {`

#### Constantes

- [`VARIANT_PATCH_SCALE`](appearance.rs#L95) — Tamaño de un grupo de variantes, en columnas: donde las plantas crecen juntas.
  - Declaración: `pub const VARIANT_PATCH_SCALE: f64 = 6.0;`

- [`VARIANT_KIND_SCALE`](appearance.rs#L97) — Tamaño de una zona cuyos grupos son todos de un mismo tipo (un prado de flores amarillas, un rincón de hojas).
  - Declaración: `pub const VARIANT_KIND_SCALE: f64 = 24.0;`

- [`VARIANT_PATCH_FILL`](appearance.rs#L99) — Proporción de columnas dentro de un grupo que muestran una variante: un grupo es denso pero no sólido.
  - Declaración: `pub const VARIANT_PATCH_FILL: f64 = 0.7;`

### `columns.rs`

#### Funciones y métodos

- [`material_at`](columns.rs#L29) — Material en un nivel relleno; los bloques bajo una superficie seca sostienen su parte superior.
  - Firma: `pub fn material_at(self, level: i32) -> Option<TerrainMaterial> {`

- [`blocks_from`](columns.rs#L42) — Bloques desde el nivel elegido como suelo hasta la parte superior, inclusive, del más bajo al más alto.
  - Firma: `pub fn blocks_from(self, floor: i32) -> impl Iterator<Item = TerrainBlock> {`

### `connection_mask.rs`

#### Funciones y métodos

- [`connection_mask`](connection_mask.rs#L11) — Las caras de `coord` que unen camino: máscara de cuatro bits con el mismo orden que la lámina de bloques de camino (`1` +x, `2` +y, `4` −x, `8` −y); una grada une como cualquier otro bloque de camino, y un vecino ausente o sin camino no une.
  - Firma: `pub fn connection_mask( coord: WorldCoord, at: impl Fn(WorldCoord) -> Option<TerrainMaterial>, ) -> u8 {`

### `stairs.rs`

#### Funciones y métodos

- [`stairs_direction`](stairs.rs#L16) — La cara hacia la que sube la grada de `coord` cuando el camino que lleva encima queda un bloque entero por encima del camino de uno de sus lados: la dirección contraria a ese vecino más bajo. `None` si el camino sigue a nivel, cae más de un bloque o solo linda con suelo liso. Las caras se leen en el orden del contrato (+x, +y, −x, −y). La regla solo lee el terreno, así que el mundo materializa la grada y la vista la viste con la misma respuesta.
  - Firma: `pub fn stairs_direction( coord: WorldCoord, elevation: i32, at: impl Fn(WorldCoord) -> Option<(TerrainMaterial, i32)>, ) -> Option<WorldCoord> {`

- [`is_road`](stairs.rs#L33) — Si una superficie lleva el camino: sus bloques de camino y las gradas entre sus niveles.
  - Firma: `pub fn is_road(material: TerrainMaterial) -> bool {`

### `generation.rs`

#### Funciones y métodos

- [`validate`](generation.rs#L41) — Valida la configuración (ruidos finitos en rango, cotas coherentes); `InvalidTerrainConfig` si no.
  - Firma: `pub fn validate(self) -> Result<Self, InvalidTerrainConfig> {`

- [`new`](generation.rs#L66) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(config: TerrainConfig) -> Result<Self, InvalidTerrainConfig> {`

- [`flat_chunk`](generation.rs#L139) — Un chunk de columnas planas a un nivel y de un solo material: el suelo del que parte el editor, en el mismo orden x-mayor que produce el generador.
  - Firma: `pub fn flat_chunk( chunk: ChunkCoord, elevation: i32, surface: TerrainMaterial, ) -> Vec<TerrainColumn> {`

- [`height_at`](generation.rs#L73) — Altura en una columna absoluta del mundo, independiente del orden de recorrido de chunks.
  - Firma: `pub fn height_at(&self, coord: WorldCoord) -> i32 {`

- [`column_at`](generation.rs#L91) — Genera la columna de terreno en `coord` (ruido absoluto, determinista por semilla).
  - Firma: `pub fn column_at(&self, coord: WorldCoord) -> TerrainColumn {`

- [`generate_chunk`](generation.rs#L125) — Columnas en orden x-major, incluidos los límites de chunk y las coordenadas con signo.
  - Firma: `pub fn generate_chunk(&self, chunk: ChunkCoord) -> Vec<TerrainColumn> {`

#### Constantes

- [`WORLD_SEED`](generation.rs#L8) — La semilla con la que genera el mundo que arranca el juego: el valor por defecto del dominio y la configuración del cliente la comparten.
  - Declaración: `pub const WORLD_SEED: u64 = 764574;`

### `noise.rs`

#### Funciones y métodos

- [`lattice_at`](noise.rs#L17) — El valor de retícula de un punto entero, para cualquier cosa que quiera un número no relacionado por columna
  - Firma: `pub fn lattice_at(seed: u64, x: i64, y: i64) -> f64 {`

- [`value_noise`](noise.rs#L29) — Campo suave en `[0, 1]`; la identidad de un chunk nunca entra en el muestreo.
  - Firma: `pub fn value_noise(seed: u64, x: f64, y: f64, scale: f64) -> f64 {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `appearance.rs`

#### Funciones internas

- [`sorted_samples`](appearance.rs#L165) — El campo sobre una cuadrícula fija, en orden ascendente: la muestra a partir de la cual se leen los umbrales.
  - Firma: `fn sorted_samples(field: &NoiseField) -> Vec<f64> {`

- [`quantile`](appearance.rs#L177) — El valor de `sorted` por debajo del cual queda `fraction` de él.
  - Firma: `fn quantile(sorted: &[f64], fraction: f64) -> f64 {`

#### Constantes internas

- [`CALIBRATION_SIDE`](appearance.rs#L101) — Lado, en muestras, de la cuadrícula sobre la que se miden los campos para convertir proporciones en umbrales.
  - Declaración: `const CALIBRATION_SIDE: i32 = 96;`

- [`CALIBRATION_STEP`](appearance.rs#L103) — Columnas entre dos muestras de calibración, de modo que la cuadrícula abarca muchos grupos y muchas zonas.
  - Declaración: `const CALIBRATION_STEP: i32 = 5;`

### `generation.rs`

#### Funciones internas

- [`default`](generation.rs#L25) — Implementación de `Default`: el generador con `WORLD_SEED` y parámetros estándar.
  - Firma: `fn default() -> Self {`

### `noise.rs`

#### Funciones internas

- [`hash`](noise.rs#L3) — Hash de `(seed, x, y)` (FNV-1a mezclada): base del ruido determinista.
  - Firma: `fn hash(seed: u64, x: i64, y: i64) -> u64 {`

- [`lattice`](noise.rs#L12) — Valor de retícula (0..1) en `(x, y)` para `seed`.
  - Firma: `fn lattice(seed: u64, x: i64, y: i64) -> f64 {`

- [`smooth`](noise.rs#L21) — Curva de suavizado cuádrica del interpolante.
  - Firma: `fn smooth(t: f64) -> f64 {`

- [`mix`](noise.rs#L24) — Interpolación lineal entre `a` y `b` por `t`.
  - Firma: `fn mix(a: f64, b: f64, t: f64) -> f64 {`
