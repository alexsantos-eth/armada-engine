# Debris

Este dominio sabe de qué piezas está armada cada entidad y cómo salen despedidas cuando se recolecta. Toda entidad nace de las piezas del kit voxel (`artifacts/vox/clay/vox_prefabs.py`); el pipeline guarda cómo en un JSON por modelo y el juego lo usa para que, al caer lo recolectado, sus piezas exploten en vez de desaparecer sin más.

- **Las piezas** (`parts.rs`): `content/json/entity-parts.json` (de `vox_parts_pack.py`) trae, por sprite, las piezas en el orden en que se armó la entidad: el nombre en el kit, el vóxel donde está plantada (`at`, sobre su punto más bajo) y sus cajas alrededor de ese punto, ya giradas y planas (centro, medios tamaños y color). Solo están las entidades con regla de recolección. Los vóxeles son los del pipeline: 128 por casilla (`VOXELS_PER_TILE`) y 85 por bloque de alto (`VOXELS_PER_BLOCK`); el archivo trae su unidad y `parse_parts` lo rechaza si no coincide. El eje del modelo va al revés que el de la rejilla (su x corre abajo a la derecha): `model_to_grid` lo cambia.
- **La explosión** (`blast.rs`): `blast` lanza cada pieza desde el medio del volumen de la entidad hacia donde estaba, con un giro y una velocidad que salen de un flujo sembrado (`DustRandom`), más alto cuanto más alta estaba. `pose_at` es una función cerrada del tiempo desde la explosión, sin estado: un arco, un único rebote (`DEBRIS_BOUNCE`), reposo y, desde `DEBRIS_FADE_AT_MS`, se encoge hasta `DEBRIS_MIN_SCALE` y se desvanece; a los `DEBRIS_MS` ya no hay nada. La misma semilla rompe la entidad siempre igual. El suelo es la base de la entidad (a cada pieza le basta con eso: el relieve de alrededor no se consulta).
- **Las caras** (`faces.rs`): `box_faces` da a la vista las tres caras de una caja que no es un cubo, en el mismo marco que `iso::player::voxel_faces`.

La vista (`src/harvest/debris_view.rs`) pone las cajas en pantalla y lleva los relojes; nada de esto se guarda ni toca la simulación.

## Catálogo de API pública

### `parts.rs`

#### Funciones y métodos

- [`parse_parts`](parts.rs#L109) — Lee `content/json/entity-parts.json`.
  - Firma: `pub fn parse_parts(json: &str) -> Result<PartsCatalog, PartsError> {`
- [`parts_key`](parts.rs#L103) — La clave por la que se encuentra un sprite: su ruta sin el `/assets/` delante ni la extensión detrás.
  - Firma: `pub fn parts_key(sprite: &str) -> &str {`
- [`PartsCatalog::of_sprite`](parts.rs#L149) — Las piezas de la entidad que se dibuja con `sprite`, si tiene.
  - Firma: `pub fn of_sprite(&self, sprite: &str) -> Option<&EntityParts> {`
- [`model_to_grid`](parts.rs#L166) — Dónde cae en el suelo un punto del modelo, en columnas desde el centro del ancla; la x y la y del modelo se cambian y se invierten.
  - Firma: `pub fn model_to_grid(x: f64, y: f64) -> GridPoint {`

#### Constantes

- [`VOXELS_PER_TILE`](parts.rs#L11) — Vóxeles a lo ancho de una casilla.
  - Declaración: `pub const VOXELS_PER_TILE: f64 = 128.0;`
- [`VOXELS_PER_BLOCK`](parts.rs#L14) — Vóxeles en un bloque de alto.
  - Declaración: `pub const VOXELS_PER_BLOCK: f64 = 85.0;`

#### Tipos

- [`PartBox`](parts.rs#L19) — Una caja de una pieza, plana: centro y medios tamaños en vóxeles, y su color `0xRRGGBB`.
  - Declaración: `pub struct PartBox { pub centre: [f64; 3], pub half: [f64; 3], pub color: u32 }`
- [`Part`](parts.rs#L27) — Una pieza del kit puesta en una entidad: su nombre, dónde está plantada y sus cajas.
  - Declaración: `pub struct Part { pub piece: String, pub at: [f64; 3], pub boxes: Vec<PartBox> }`
- [`EntityParts`](parts.rs#L38) — Una entidad como las piezas de que se hizo, en el orden en que se armó.
  - Declaración: `pub struct EntityParts { pub tiles: [u32; 3], pub parts: Vec<Part> }`
- [`PartsCatalog`](parts.rs#L97) — Las piezas de cada entidad que puede estallar, buscadas por su sprite.
  - Declaración: `pub struct PartsCatalog { .. }`
- [`PartsError`](parts.rs#L46) — Por qué no se leyeron las piezas: JSON que no es, color que no son seis hex o unidades distintas a las del motor.
  - Declaración: `pub enum PartsError { Json(..), Color(String), Units }`

### `blast.rs`

#### Funciones y métodos

- [`blast`](blast.rs#L68) — Lanza cada pieza desde el medio de la entidad, repartidas por el flujo de `seed`.
  - Firma: `pub fn blast(parts: &EntityParts, seed: u64) -> Vec<Fragment> {`
- [`pose_at`](blast.rs#L115) — Cómo se ve un fragmento `ms` después de la explosión; `None` cuando ya no está.
  - Firma: `pub fn pose_at(fragment: &Fragment, ms: f64) -> Option<Pose> {`

#### Constantes

- [`DEBRIS_MS`](blast.rs#L10) — Milisegundos reales desde la explosión hasta que no queda ninguna pieza.
  - Declaración: `pub const DEBRIS_MS: f64 = 1900.0;`
- [`DEBRIS_FADE_AT_MS`](blast.rs#L13) — Milisegundos desde los que las piezas se encogen y se desvanecen.
  - Declaración: `pub const DEBRIS_FADE_AT_MS: f64 = 1300.0;`
- [`DEBRIS_MIN_SCALE`](blast.rs#L16) — Lo menos que se encoge una pieza, como parte de su tamaño.
  - Declaración: `pub const DEBRIS_MIN_SCALE: f64 = 0.55;`
- [`DEBRIS_GRAVITY`](blast.rs#L19) — Bloques por segundo al cuadrado con que caen.
  - Declaración: `pub const DEBRIS_GRAVITY: f64 = 22.0;`
- [`DEBRIS_BOUNCE`](blast.rs#L22) — Parte de la velocidad que conserva al tocar el suelo.
  - Declaración: `pub const DEBRIS_BOUNCE: f64 = 0.3;`
- [`DEBRIS_SLIDE`](blast.rs#L25) — Parte de la velocidad lateral que conserva en ese rebote.
  - Declaración: `pub const DEBRIS_SLIDE: f64 = 0.4;`
- [`DEBRIS_SPEED`](blast.rs#L28) — Columnas por segundo a las que salen, la más lenta y la más rápida.
  - Declaración: `pub const DEBRIS_SPEED: (f64, f64) = (0.8, 2.2);`
- [`DEBRIS_THROW`](blast.rs#L32) — Bloques por segundo con que suben, la más baja y la más alta.
  - Declaración: `pub const DEBRIS_THROW: (f64, f64) = (2.4, 4.4);`
- [`DEBRIS_THROW_PER_BLOCK`](blast.rs#L35) — Bloques por segundo que suma cada bloque de altura a que estaba la pieza.
  - Declaración: `pub const DEBRIS_THROW_PER_BLOCK: f64 = 0.35;`

#### Tipos

- [`Fragment`](blast.rs#L40) — Una pieza en vuelo: dónde estaba y cómo salió lanzada.
  - Declaración: `pub struct Fragment { pub part: usize, pub start: [f64; 3], pub velocity: [f64; 3] }`
- [`Pose`](blast.rs#L50) — Dónde está un fragmento y cómo se ve.
  - Declaración: `pub struct Pose { pub at: [f64; 3], pub scale: f64, pub alpha: f64 }`

### `faces.rs`

#### Funciones y métodos

- [`box_faces`](faces.rs#L8) — Las tres caras de una caja apoyada en el suelo, como puntos de pantalla relativos al medio de su base.
  - Firma: `pub fn box_faces( across: f64, deep: f64, height_blocks: f64, tile_width: f64, tile_height: f64, box_height: f64, ) -> VoxelFaces {`
