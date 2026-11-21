# Scene order

Este dominio calcula claves estables de profundidad, capas y presupuestos de streaming. Define el orden lógico con el que los elementos isométricos deben presentarse, independiente de cómo un backend concrete el dibujo.

También decide la oclusión del jugador (`occlusion.rs`): qué sprites lo tapan —se dibujan después y su arte, medido con una `CoverMask`, cae sobre su caja— y cuánto se aclara cada uno mientras dura (`OcclusionFades`, 200 ms de ida y de vuelta). Son reglas puras sobre rectángulos de pantalla y claves; el cliente pone los rectángulos y dibuja el resultado.

Las claves deben ser comparables, reproducibles y suficientes para evitar ambigüedades entre elementos solapados. Los presupuestos expresan decisiones de datos y no ajustes específicos de rendimiento de GPU.

No ordena comandos de una biblioteca gráfica ni gestiona buffers. El renderer consume las claves ya calculadas.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `budgets.rs`

#### Constantes

- [`CHUNK_LOAD_RADIUS`](budgets.rs#L4) — Chunks necesarios alrededor de cada chunk en foco (`stream()`): el anillo que un chunk mostrado necesita para sus bordes.
  - Declaración: `pub const CHUNK_LOAD_RADIUS: i32 = 1;`

- [`CHUNK_PREFETCH_RADIUS`](budgets.rs#L10) — Define el radio de chunks que debe solicitarse de forma anticipada alrededor del área de interés.
  - Declaración: `pub const CHUNK_PREFETCH_RADIUS: i32 = 2;`

- [`CHUNK_KEEP_RADIUS`](budgets.rs#L17) — Define el radio de chunks que debe conservarse alrededor del área de interés.
  - Declaración: `pub const CHUNK_KEEP_RADIUS: i32 = 3;`

- [`CHUNKS_LOADED_PER_FRAME`](budgets.rs#L20) — Limita cuántos chunks pueden cargarse en un fotograma.
  - Declaración: `pub const CHUNKS_LOADED_PER_FRAME: i32 = 1;`

- [`CHUNKS_SHOWN_PER_FRAME`](budgets.rs#L23) — Limita cuántos chunks pueden hacerse visibles en un fotograma.
  - Declaración: `pub const CHUNKS_SHOWN_PER_FRAME: i32 = 1;`

- [`CHUNKS_HIDDEN_PER_FRAME`](budgets.rs#L26) — Limita cuántos chunks ocultos pueden procesarse en un fotograma.
  - Declaración: `pub const CHUNKS_HIDDEN_PER_FRAME: i32 = 1;`

### `frame_selection.rs`

#### Funciones y métodos

- [`select_player_frame`](frame_selection.rs#L80) — Elige la hoja y la columna con prioridad de nadar, trepar, el mortal, saltar, recolectar, idle y caminar. Recolectando, [`GatherInput`](frame_selection.rs) da la hoja del golpe (`PlayerSheet::Gather`) en la columna de la parte del golpe hecha (`swing`, de 0 a 1). En el agua manda [`SwimInput`](frame_selection.rs): la hoja de nado, con la columna de flotar, la del crol o la de bucear. En el aire, [`FlipInput`](frame_selection.rs) manda sobre las poses de salto: la hoja del mortal, en la columna que marca la parte del giro hecha.
  - Firma: `pub fn select_player_frame(input: PlayerFrameInput) -> PlayerFrame {`

### `occlusion.rs`

#### Tipos

- [`Occludee`](occlusion.rs#L26) — Lo que debe seguir a la vista: su caja en pantalla (`area`) y la clave con la que se dibuja (`key`).
  - Declaración: `pub struct Occludee {`

- [`CoverMask`](occlusion.rs#L74) — Dónde es sólido el arte de un sprite, en una rejilla gruesa sobre su frame: lo que su rectángulo no dice de las esquinas de una copa o la pendiente de un tejado.
  - Declaración: `pub struct CoverMask {`

- [`OcclusionFades`](occlusion.rs#L165) — El fundido de cada sprite que tapa al jugador o que aún está volviendo de taparlo.
  - Declaración: `pub struct OcclusionFades {`

#### Funciones y métodos

- [`hidden_by`](occlusion.rs#L34) — Si un sprite dibujado con `key` que cubre la parte `share` del sujeto lo tapa: se dibuja después y cubre al menos `OCCLUSION_MIN_COVER`.
  - Firma: `pub fn hidden_by(&self, key: DrawKey, share: f64) -> bool {`

- [`cover_share`](occlusion.rs#L40) — Parte del área de `subject` sobre la que cae el rectángulo `over`, en `[0, 1]`.
  - Firma: `pub fn cover_share(subject: SpriteLayout, over: SpriteLayout) -> f64 {`

- [`bounding_layout`](occlusion.rs#L54) — La caja recta que encierra `points` (las esquinas de una banda); `None` sin puntos.
  - Firma: `pub fn bounding_layout(points: &[(f64, f64)]) -> Option<SpriteLayout> {`

- [`from_alpha`](occlusion.rs#L83) — Lee la máscara de un frame de `width` × `height` píxeles con alfa `alpha_at(x, y)`: una celda es sólida si la mayoría de los nueve píxeles que sondea pasan de medio alfa.
  - Firma: `pub fn from_alpha(width: u32, height: u32, alpha_at: impl Fn(u32, u32) -> u8) -> Self {`

- [`solid_at`](occlusion.rs#L112) — Si el arte es sólido a `along` de su ancho y `down` de su alto, ambos en `[0, 1)`.
  - Firma: `pub fn solid_at(&self, along: f64, down: f64) -> bool {`

- [`share_over`](occlusion.rs#L123) — Parte de `subject` que cubre el arte dibujado en `sprite`, contando solo lo que cae dentro de `within` (la banda de una casilla); sondea `OCCLUDEE_PROBES` puntos.
  - Firma: `pub fn share_over( &self, subject: SpriteLayout, sprite: SpriteLayout, within: SpriteLayout, ) -> f64 {`

- [`begin`](occlusion.rs#L173) — Abre un fotograma `elapsed_ms` después del anterior: olvida lo que no se dibujó en él y lo que ya volvió del todo.
  - Firma: `pub fn begin(&mut self, elapsed_ms: f64) {`

- [`opacity`](occlusion.rs#L188) — Opacidad con la que se dibuja el sprite `id` este fotograma; lo acerca a `OCCLUDER_OPACITY` mientras `covering` y lo devuelve a `1.0` cuando no. Una llamada por sprite y fotograma.
  - Firma: `pub fn opacity(&mut self, id: &str, covering: bool) -> f64 {`

- [`is_idle`](occlusion.rs#L210) — Si no hay nada aclarado ni volviendo.
  - Firma: `pub fn is_idle(&self) -> bool {`

#### Constantes

- [`OCCLUSION_FADE_MS`](occlusion.rs#L10) — Lo que tarda un sprite en apartarse, y en volver.
  - Declaración: `pub const OCCLUSION_FADE_MS: f64 = 200.0;`

- [`OCCLUDER_OPACITY`](occlusion.rs#L13) — Cuánto conserva de sí un sprite mientras el jugador está detrás.
  - Declaración: `pub const OCCLUDER_OPACITY: f64 = 0.4;`

- [`OCCLUSION_MIN_COVER`](occlusion.rs#L16) — Parte de la caja del jugador que un sprite debe cubrir para contar como que lo tapa.
  - Declaración: `pub const OCCLUSION_MIN_COVER: f64 = 0.2;`

- [`COVER_MASK_CELLS`](occlusion.rs#L19) — Celdas por lado de una `CoverMask`, como máximo.
  - Declaración: `pub const COVER_MASK_CELLS: u32 = 24;`

- [`OCCLUDEE_PROBES`](occlusion.rs#L22) — La rejilla de puntos, a lo ancho y a lo alto, en la que se sondea la caja del jugador.
  - Declaración: `pub const OCCLUDEE_PROBES: (u32, u32) = (6, 10);`

### `order.rs`

#### Funciones y métodos

- [`get_draw_depth`](order.rs#L20) — Profundidad de un bloque proyectado o de una loseta de una huella.
  - Firma: `pub fn get_draw_depth( base_screen_y: f64, elevation: f64, x: f64, tile_height: f64, tile: i32, axis: LengthAxis, ) -> f64 {`

- [`compare_draw_keys`](order.rs#L38) — Orden para sort estable. Las entradas son profundidades proyectadas finitas de la escena.
  - Firma: `pub fn compare_draw_keys(a: &DrawKey, b: &DrawKey) -> Ordering {`

### `poses.rs`

#### Funciones y métodos

- [`jump_pose`](poses.rs#L24) — Pose de salto para `phase` según la tabla `poses` (o `None` si no hay).
  - Firma: `pub fn jump_pose(phase: JumpPhase, poses: JumpPoses) -> Option<i32> {`

- [`climb_pose`](poses.rs#L36) — Secciones de igual longitud de un ascenso, limitadas a sus columnas primera y última.
  - Firma: `pub fn climb_pose(progress: f64, frames: i32) -> i32 {`

- [`idle_pose`](poses.rs#L41) — Columna de reposo tras milisegundos reales transcurridos, en bucle una vez por periodo.
  - Firma: `pub fn idle_pose(ms: f64, frames: i32, period: f64) -> i32 {`

- [`walk_pose`](poses.rs#L47) — Columna de caminar por distancia, incluido el pedaleo hacia atrás; cero es estar de pie.
  - Firma: `pub fn walk_pose(distance: f64, frames: i32, stride: f64) -> i32 {`

- [`swim_pose`](poses.rs) — Columna de nado por distancia nadada: un ciclo del crol cada `stride` columnas, repartido entre las columnas que hay desde flotar (la primera) hasta bucear (la última).
  - Firma: `pub fn swim_pose(distance: f64, columns: i32, stride: f64) -> i32 {`

- [`swim_dive_pose`](poses.rs) — La columna con la que se dibuja a quien está bajo la superficie: la última de la hoja.
  - Firma: `pub fn swim_dive_pose(columns: i32) -> i32 {`

- [`flip_pose`](poses.rs) — Columna del mortal por la parte del giro hecha, de `0.0` a `1.0`: las columnas de la hoja son los pasos iguales de una vuelta entera.
  - Firma: `pub fn flip_pose(turned: f64, columns: i32) -> i32 {`

#### Constantes

- [`SWIM_FLOAT_POSE`](poses.rs) — La columna de la hoja de nado en la que la figura se mantiene a flote: la primera.
  - Declaración: `pub const SWIM_FLOAT_POSE: i32 = 0;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `budgets.rs`

#### Constantes internas

- [`_`](budgets.rs#L28) — Asserts de compilación de los presupuestos: carga > 0 y carga ≤ prefetch ≤ keep.
  - Declaración: `const _: () = {`
