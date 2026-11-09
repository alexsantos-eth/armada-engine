# Terrain

Este dominio modela columnas, materiales, ruido, generación y apariencia determinista del terreno. Contiene las reglas que convierten una ubicación del mundo en datos de suelo, elevación y aspecto lógico.

La generación debe ser reproducible a partir de su semilla y parámetros. Las estructuras de terreno se mantienen libres de recursos visuales para que puedan usarse en persistencia, simulación y clientes distintos.

No genera mallas, no carga sprites ni emite draw calls. Esas vistas pertenecen al cliente de presentación.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `appearance.rs`

#### Funciones y métodos

- [`new`](appearance.rs#L15) — `scale` is about the width of a blob of the field, in columns; `detail` is the weight of a
  - Firma: `pub fn new(seed: u64, label: &str, scale: f64, detail: f64) -> Self {`

- [`sample`](appearance.rs#L24) — The field's value at column `(x, y)`.
  - Firma: `pub fn sample(&self, x: i32, y: i32) -> f64 {`

- [`derive_seed`](appearance.rs#L36) — A stream of its own for `label` in the world of `seed`: FNV-1a over the label, mixed into the
  - Firma: `pub fn derive_seed(seed: u64, label: &str) -> u64 {`

- [`new`](appearance.rs#L56) — `colors` are `0xRRGGBB` multipliers, ordered dark to light; an empty list tints nothing.
  - Firma: `pub fn new(seed: u64, label: &str, scale: f64, colors: &[u32]) -> Option<Self> {`

- [`at`](appearance.rs#L67) — The multiplier of column `(x, y)`.
  - Firma: `pub fn at(&self, x: i32, y: i32) -> u32 {`

- [`zone_index`](appearance.rs#L73) — Which of `count` equal shares of `[0, 1]` the field value `value` falls in.
  - Firma: `pub fn zone_index(value: f64, count: usize) -> usize {`

- [`tint_channels`](appearance.rs#L79) — The three channels of a `0xRRGGBB` multiplier, each in `[0, 1]`.
  - Firma: `pub fn tint_channels(color: u32) -> (f32, f32, f32) {`

- [`new`](appearance.rs#L110) — `chances` is the share of all columns each variant should cover, in order. `None` when
  - Firma: `pub fn new(seed: u64, label: &str, chances: &[f64]) -> Option<Self> {`

- [`pick`](appearance.rs#L143) — The variant column `(x, y)` grows, or `None` for the material's own plain top.
  - Firma: `pub fn pick(&self, x: i32, y: i32) -> Option<usize> {`

#### Constantes

- [`VARIANT_PATCH_SCALE`](appearance.rs#L85) — Size of a clump of variants, in columns: where the plants grow together.
  - Declaración: `pub const VARIANT_PATCH_SCALE: f64 = 6.0;`

- [`VARIANT_KIND_SCALE`](appearance.rs#L87) — Size of a zone whose clumps are all of one kind (a meadow of yellow flowers, a corner of leaves).
  - Declaración: `pub const VARIANT_KIND_SCALE: f64 = 24.0;`

- [`VARIANT_PATCH_FILL`](appearance.rs#L89) — Share of the columns inside a clump that show a variant: a clump is dense but not solid.
  - Declaración: `pub const VARIANT_PATCH_FILL: f64 = 0.7;`

### `columns.rs`

#### Funciones y métodos

- [`material_at`](columns.rs#L27) — Material at a filled level; blocks below a dry surface support its top.
  - Firma: `pub fn material_at(self, level: i32) -> Option<TerrainMaterial> {`

- [`blocks_from`](columns.rs#L40) — Blocks from the chosen floor through the top, inclusive, bottom first.
  - Firma: `pub fn blocks_from(self, floor: i32) -> impl Iterator<Item = TerrainBlock> {`

### `generation.rs`

#### Funciones y métodos

- [`validate`](generation.rs#L38) — Valida los invariantes de «» y devuelve el resultado de esa comprobación.
  - Firma: `pub fn validate(self) -> Result<Self, InvalidTerrainConfig> {`

- [`new`](generation.rs#L63) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new(config: TerrainConfig) -> Result<Self, InvalidTerrainConfig> {`

- [`height_at`](generation.rs#L70) — Height at an absolute world column, independent of chunk traversal order.
  - Firma: `pub fn height_at(&self, coord: WorldCoord) -> i32 {`

- [`column_at`](generation.rs#L88) — Calcula o recupera «column at» según los parámetros de la firma.
  - Firma: `pub fn column_at(&self, coord: WorldCoord) -> TerrainColumn {`

- [`generate_chunk`](generation.rs#L122) — Columns in x-major order, including chunk boundaries and signed coordinates.
  - Firma: `pub fn generate_chunk(&self, chunk: ChunkCoord) -> Vec<TerrainColumn> {`

### `noise.rs`

#### Funciones y métodos

- [`lattice_at`](noise.rs#L17) — The lattice value of one integer point, for anything that wants an unrelated number per column
  - Firma: `pub fn lattice_at(seed: u64, x: i64, y: i64) -> f64 {`

- [`value_noise`](noise.rs#L29) — Smooth field in `[0, 1]`; a chunk's identity never enters the sampling.
  - Firma: `pub fn value_noise(seed: u64, x: f64, y: f64, scale: f64) -> f64 {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `appearance.rs`

#### Funciones internas

- [`sorted_samples`](appearance.rs#L155) — The field over a fixed grid, ascending: the sample the thresholds are read off.
  - Firma: `fn sorted_samples(field: &NoiseField) -> Vec<f64> {`

- [`quantile`](appearance.rs#L167) — The value of `sorted` below which `fraction` of it lies.
  - Firma: `fn quantile(sorted: &[f64], fraction: f64) -> f64 {`

#### Constantes internas

- [`CALIBRATION_SIDE`](appearance.rs#L91) — Side, in samples, of the grid the fields are measured on to turn chances into thresholds.
  - Declaración: `const CALIBRATION_SIDE: i32 = 96;`

- [`CALIBRATION_STEP`](appearance.rs#L93) — Columns between two calibration samples, so the grid spans many clumps and many zones.
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
