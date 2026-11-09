# Scene order

Este dominio calcula claves estables de profundidad, capas y presupuestos de streaming. Define el orden lógico con el que los elementos isométricos deben presentarse, independiente de cómo un backend concrete el dibujo.

Las claves deben ser comparables, reproducibles y suficientes para evitar ambigüedades entre elementos solapados. Los presupuestos expresan decisiones de datos y no ajustes específicos de rendimiento de GPU.

No ordena comandos de una biblioteca gráfica ni gestiona buffers. El renderer consume las claves ya calculadas.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `budgets.rs`

#### Constantes

- [`CHUNK_LOAD_RADIUS`](budgets.rs#L4) — Chunks needed around each focus chunk (`stream()`): the ring a shown chunk needs for its edges.
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

- [`select_player_frame`](frame_selection.rs#L35) — Chooses sheet and column with climb, jump, idle, then walk priority.
  - Firma: `pub fn select_player_frame(input: PlayerFrameInput) -> PlayerFrame {`

### `order.rs`

#### Funciones y métodos

- [`get_draw_depth`](order.rs#L20) — Depth of a projected block or one tile of a footprint.
  - Firma: `pub fn get_draw_depth( base_screen_y: f64, elevation: f64, x: f64, tile_height: f64, tile: i32, axis: LengthAxis, ) -> f64 {`

- [`compare_draw_keys`](order.rs#L38) — Ordering for stable sort. Inputs are finite projected depths from the scene.
  - Firma: `pub fn compare_draw_keys(a: &DrawKey, b: &DrawKey) -> Ordering {`

### `poses.rs`

#### Funciones y métodos

- [`jump_pose`](poses.rs#L24) — Calcula o recupera «jump pose» según los parámetros de la firma.
  - Firma: `pub fn jump_pose(phase: JumpPhase, poses: JumpPoses) -> Option<i32> {`

- [`climb_pose`](poses.rs#L36) — Equal-length sections of a climb, clamped to its first and last columns.
  - Firma: `pub fn climb_pose(progress: f64, frames: i32) -> i32 {`

- [`idle_pose`](poses.rs#L41) — Idle column after real elapsed milliseconds, looping once per period.
  - Firma: `pub fn idle_pose(ms: f64, frames: i32, period: f64) -> i32 {`

- [`walk_pose`](poses.rs#L47) — Walk column by distance, including backwards pedalling; zero is standing.
  - Firma: `pub fn walk_pose(distance: f64, frames: i32, stride: f64) -> i32 {`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `budgets.rs`

#### Constantes internas

- [`_`](budgets.rs#L28) — Define el parámetro interno « » empleado por este módulo.
  - Declaración: `const _: () = {`
