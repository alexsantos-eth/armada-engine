# Terrain

Este dominio modela columnas, materiales, ruido, generación y apariencia determinista del terreno. Contiene las reglas que convierten una ubicación del mundo en datos de suelo, elevación y aspecto lógico.

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

- [`at`](appearance.rs#L67) — El multiplicador de la columna `(x, y)`.
  - Firma: `pub fn at(&self, x: i32, y: i32) -> u32 {`

- [`zone_index`](appearance.rs#L73) — En cuál de las `count` partes iguales de `[0, 1]` cae el valor de campo `value`.
  - Firma: `pub fn zone_index(value: f64, count: usize) -> usize {`

- [`tint_channels`](appearance.rs#L79) — Los tres canales de un multiplicador `0xRRGGBB`, cada uno en `[0, 1]`.
  - Firma: `pub fn tint_channels(color: u32) -> (f32, f32, f32) {`

- [`new`](appearance.rs#L110) — `chances` es la proporción de todas las columnas que debe cubrir cada variante, en orden. `None` cuando
  - Firma: `pub fn new(seed: u64, label: &str, chances: &[f64]) -> Option<Self> {`

- [`pick`](appearance.rs#L143) — La variante que crece en la columna `(x, y)`, o `None` para la propia parte superior lisa del material.
  - Firma: `pub fn pick(&self, x: i32, y: i32) -> Option<usize> {`

#### Constantes

- [`VARIANT_PATCH_SCALE`](appearance.rs#L85) — Tamaño de un grupo de variantes, en columnas: donde las plantas crecen juntas.
  - Declaración: `pub const VARIANT_PATCH_SCALE: f64 = 6.0;`

- [`VARIANT_KIND_SCALE`](appearance.rs#L87) — Tamaño de una zona cuyos grupos son todos de un mismo tipo (un prado de flores amarillas, un rincón de hojas).
  - Declaración: `pub const VARIANT_KIND_SCALE: f64 = 24.0;`

- [`VARIANT_PATCH_FILL`](appearance.rs#L89) — Proporción de columnas dentro de un grupo que muestran una variante: un grupo es denso pero no sólido.
  - Declaración: `pub const VARIANT_PATCH_FILL: f64 = 0.7;`

### `columns.rs`

#### Funciones y métodos

- [`material_at`](columns.rs#L27) — Material en un nivel relleno; los bloques bajo una superficie seca sostienen su parte superior.
  - Firma: `pub fn material_at(self, level: i32) -> Option<TerrainMaterial> {`

- [`blocks_from`](columns.rs#L40) — Bloques desde el nivel elegido como suelo hasta la parte superior, inclusive, del más bajo al más alto.
  - Firma: `pub fn blocks_from(self, floor: i32) -> impl Iterator<Item = TerrainBlock> {`

### `generation.rs`

#### Funciones y métodos

- [`validate`](generation.rs#L38) — Valida los invariantes de «» y devuelve el resultado de esa comprobación.
  - Firma: `pub fn validate(self) -> Result<Self, InvalidTerrainConfig> {`

- [`new`](generation.rs#L63) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(config: TerrainConfig) -> Result<Self, InvalidTerrainConfig> {`

- [`height_at`](generation.rs#L70) — Altura en una columna absoluta del mundo, independiente del orden de recorrido de chunks.
  - Firma: `pub fn height_at(&self, coord: WorldCoord) -> i32 {`

- [`column_at`](generation.rs#L88) — Calcula o recupera «column at» según los parámetros de la firma.
  - Firma: `pub fn column_at(&self, coord: WorldCoord) -> TerrainColumn {`

- [`generate_chunk`](generation.rs#L122) — Columnas en orden x-major, incluidos los límites de chunk y las coordenadas con signo.
  - Firma: `pub fn generate_chunk(&self, chunk: ChunkCoord) -> Vec<TerrainColumn> {`

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

- [`sorted_samples`](appearance.rs#L155) — El campo sobre una cuadrícula fija, en orden ascendente: la muestra a partir de la cual se leen los umbrales.
  - Firma: `fn sorted_samples(field: &NoiseField) -> Vec<f64> {`

- [`quantile`](appearance.rs#L167) — El valor de `sorted` por debajo del cual queda `fraction` de él.
  - Firma: `fn quantile(sorted: &[f64], fraction: f64) -> f64 {`

#### Constantes internas

- [`CALIBRATION_SIDE`](appearance.rs#L91) — Lado, en muestras, de la cuadrícula sobre la que se miden los campos para convertir proporciones en umbrales.
  - Declaración: `const CALIBRATION_SIDE: i32 = 96;`

- [`CALIBRATION_STEP`](appearance.rs#L93) — Columnas entre dos muestras de calibración, de modo que la cuadrícula abarca muchos grupos y muchas zonas.
  - Declaración: `const CALIBRATION_STEP: i32 = 5;`

### `generation.rs`

#### Funciones internas

- [`default`](generation.rs#L22) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

### `noise.rs`

#### Funciones internas

- [`hash`](noise.rs#L3) — Calcula o recupera «hash» según los parámetros de la firma.
  - Firma: `fn hash(seed: u64, x: i64, y: i64) -> u64 {`

- [`lattice`](noise.rs#L12) — Calcula o recupera «lattice» según los parámetros de la firma.
  - Firma: `fn lattice(seed: u64, x: i64, y: i64) -> f64 {`

- [`smooth`](noise.rs#L21) — Calcula o recupera «smooth» según los parámetros de la firma.
  - Firma: `fn smooth(t: f64) -> f64 {`

- [`mix`](noise.rs#L24) — Calcula o recupera «mix» según los parámetros de la firma.
  - Firma: `fn mix(a: f64, b: f64, t: f64) -> f64 {`
