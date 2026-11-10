# Game

Este dominio de cliente posee el juego en marcha: el arranque (`state.rs`), la configuración del juego (`config.rs`), la mitad de reglas del fotograma — entrada, ticks fijos, streaming de chunks y guardado (`frame.rs`) — y la mitad de vista — la cola de sprites de cada fotograma (`scene.rs`). `main.rs` no compone nada de esto; solo crea la ventana y cede el control a `loops`.

El mundo nunca se toca desde el dibujo: `frame.rs` muta estado, `scene.rs` solo lee y rellena la cola de dibujo. Los adaptadores de locomoción y reflexión viven en `ground.rs`.

## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto al código porque no forman parte del contrato estable.

### `mod.rs`

#### Reexportaciones

- [`Game`](mod.rs#L9) — El juego compuesto: mundo, jugador, cámara, arte y guardado.
  - Firma: `pub(crate) use state::Game;`

### `config.rs`

#### Constantes

- [`PREVIEW_CENTRE`](config.rs#L11) — Centro de diagnóstico del mundo; el jugador nace cerca de él.
  - Declaración: `pub const PREVIEW_CENTRE: WorldCoord = WorldCoord { x: 16, y: 88 };`
- [`PREVIEW_TILE_WIDTH`](config.rs#L13) — Zoom de la escena: ancho de una casilla en píxeles de pantalla.
  - Declaración: `pub const PREVIEW_TILE_WIDTH: f64 = 280.0;`
- [`PREVIEW_TILE_HEIGHT`](config.rs#L15) — Alto de una casilla en píxeles.
  - Declaración: `pub const PREVIEW_TILE_HEIGHT: f64 = PREVIEW_TILE_WIDTH / 2.0;`
- [`PREVIEW_ELEVATION_STEP`](config.rs#L17) — Altura de un nivel de elevación en píxeles.
  - Declaración: `pub const PREVIEW_ELEVATION_STEP: f64 = PREVIEW_TILE_WIDTH * SVG_BLOCK_HEIGHT / SVG_TILE_WIDTH;`
- [`MOBILE_ZOOM`](config.rs#L20) — Fracción de la casilla de referencia que dibuja una plataforma de puntero grueso: la escena alejada un poco para ver más mundo en una pantalla táctil pequeña.
  - Declaración: `pub const MOBILE_ZOOM: f64 = 0.7;`
- [`MAX_FRAME_MS`](config.rs#L24) — Milisegundos de simulación que un fotograma puede avanzar, uno por tick: tras un bloqueo (GC, GPU, horneado) el juego se ralentiza en vez de saltar varios ticks de golpe.
  - Declaración: `pub(crate) const MAX_FRAME_MS: f64 = iso::simulation::STEP_MS;`

- [`BAND_BLEED`](config.rs#L58) — Cuánto alcanza cada banda de un sprite multi-casilla más allá de su corte.
  - Declaración: `pub const BAND_BLEED: f64 = 0.5;`
- [`ENTITY_LAYER`](config.rs#L61) — Capa de dibujo de las entidades.
  - Declaración: `pub const ENTITY_LAYER: i32 = 3;`
- [`PLAYER_BEHIND_LAYER`](config.rs#L63) — Capa del jugador en la mitad lejana de su casilla.
  - Declaración: `pub const PLAYER_BEHIND_LAYER: i32 = 2;`
- [`PLAYER_FRONT_LAYER`](config.rs#L65) — Capa del jugador en la mitad cercana de su casilla.
  - Declaración: `pub const PLAYER_FRONT_LAYER: i32 = 4;`
- [`PLAYER_SCALE`](config.rs#L67) — Tamaño del jugador como fracción del que tiene su arte.
  - Declaración: `pub const PLAYER_SCALE: f64 = 0.75;`
- [`PLAYER_SPRITE`](config.rs#L69) — Ruta del manifiesto de la figura quieta del jugador.
  - Declaración: `pub const PLAYER_SPRITE: &str = "/assets/player/block.svg";`
- [`PLAYER_WALK_SHEET`](config.rs#L71) — Hoja de poses al andar.
  - Declaración: `pub const PLAYER_WALK_SHEET: &str = "/assets/player-16/walk.svg";`
- [`PLAYER_IDLE_SHEET`](config.rs#L72) — Hoja de poses en reposo.
  - Declaración: `pub const PLAYER_IDLE_SHEET: &str = "/assets/player-16/idle.svg";`
- [`PLAYER_JUMP_SHEET`](config.rs#L73) — Hoja de poses de salto.
  - Declaración: `pub const PLAYER_JUMP_SHEET: &str = "/assets/player-16/jump.svg";`
- [`PLAYER_CLIMB_SHEET`](config.rs#L74) — Hoja de poses de escalada.
  - Declaración: `pub const PLAYER_CLIMB_SHEET: &str = "/assets/player-16/climb.svg";`
- [`CHUNK_CULL_MARGIN`](config.rs#L76) — Margen extra de visibilidad de chunks alrededor de la pantalla.
  - Declaración: `pub const CHUNK_CULL_MARGIN: f64 = 0.0;`
- [`CHUNK_RADII`](config.rs#L79) — Radios de carga/predescarga/conservación de este cliente (1 / 1 / 2).
  - Declaración: `pub const CHUNK_RADII: ChunkRadii = ChunkRadii { ... };`
- [`UNBOUNDED_CAMERA_LIMITS`](config.rs#L87) — Límites finitos para el seguimiento exponencial de un mundo sin fronteras: tan anchos que la pinza nunca se aplica; solo los exige `follow_camera`.
  - Declaración: `pub(crate) const UNBOUNDED_CAMERA_LIMITS: iso::camera::CameraLimits = iso::camera::CameraLimits { ... };`
- [`AUTOSAVE_SECONDS`](config.rs#L99) — Intervalo de respaldo del guardado periódico; el real es al salir.
  - Declaración: `pub const AUTOSAVE_SECONDS: f64 = 120.0;`
- [`WORLD_SEED`](config.rs#L102) — La semilla con la que genera el mundo; el valor por defecto del dominio (`iso::terrain::WORLD_SEED`) y los tests la comparten.
  - Declaración: `pub const WORLD_SEED: u64 = iso::terrain::WORLD_SEED;`
- [`PHASE_TRANSITION_SECONDS`](config.rs#L105) — Segundos que dura el cambio de fase de punta a punta: el crossfade del grado y el fade-in de sombras de cada chunk recién horneado.
  - Declaración: `pub const PHASE_TRANSITION_SECONDS: f32 = 0.6;`

#### Tipos

- [`SceneMetrics`](config.rs#L28) — Las métricas de la casilla de una escena, en píxeles de pantalla: casilla y nivel de elevación.
  - Firma: `pub struct SceneMetrics { pub tile_width: f64, pub tile_height: f64, pub elevation_step: f64 }`

#### Funciones y métodos

- [`SceneMetrics::REFERENCE`](config.rs#L32) — Las métricas de referencia que dibuja una plataforma de puntero fino (escritorio).
  - Declaración: `pub const REFERENCE: Self = Self { ... };`
- [`SceneMetrics::for_pointer`](config.rs#L40) — Las métricas para `coarse`: la referencia en escritorio, la escena alejada un poco (`MOBILE_ZOOM`) en plataformas táctiles.
  - Firma: `pub fn for_pointer(coarse: bool) -> Self {`

### `ground.rs`

#### Tipos

- [`ChunkGround`](ground.rs#L11) — Envuelve un `ChunkManager` para que satisfaga `PlayerGround` en la locomoción.
  - Firma: `pub(crate) struct ChunkGround<'a> { pub(crate) manager: &'a ChunkManager }`

#### Funciones y métodos

- [`water_cell`](ground.rs#L68) — El agua de la celda `(x, y)`, o `None`: lo que un reflejo pregunta al mundo.
  - Firma: `pub(crate) fn water_cell(manager: &ChunkManager, x: i32, y: i32) -> Option<WaterCell> {`

### `frame.rs`

#### Tipos

- [`FrameView`](frame.rs#L51) — Lo que la mitad de vista del fotograma necesita tras la actualización: posición de render, proyección, chunks cullados, `frame_ms` y el instante en que la simulación terminó.
  - Firma: `pub(crate) struct FrameView { ... }`

#### Funciones y métodos

- [`update`](frame.rs#L63) — Entrada, ticks fijos, reloj del mundo (avanza solo en el paso fijo), fase efectiva de sombras (override o `phase_at` del reloj), streaming de chunks y guardado de un fotograma. `None` si el jugador pidió salir (tras volcar el guardado si hacía falta).
  - Firma: `pub(crate) fn update(&mut self, frame_ms: f64) -> Option<FrameView> {`

### `scene.rs`

#### Funciones y métodos

- [`preview_projection`](scene.rs#L36) — La proyección de esta vista con su origen en `(origin_x, origin_y)`: las métricas de casilla son las de la escena, el origen sigue a la cámara.
  - Firma: `pub(crate) fn preview_projection(origin_x: f64, origin_y: f64, metrics: SceneMetrics) -> ProjectionConfig {`
- [`player_sheets`](scene.rs#L57) — Cuántas poses trae cada hoja del jugador en el atlas.
  - Firma: `pub(crate) fn player_sheets(atlas: &SpriteAtlas) -> crate::player::player_view::PlayerSheets {`
- [`player_layer`](scene.rs#L70) — Qué capa ocupa el jugador sobre la casilla que pisa.
  - Firma: `pub(crate) fn player_layer(position: GridPoint, column: WorldCoord) -> i32 {`
- [`player_feet`](scene.rs#L79) — Proyecta el punto donde los pies del jugador tocan la cima de su casilla.
  - Firma: `pub(crate) fn player_feet(position: GridPoint, elevation: f64, projection: ProjectionConfig) -> ScreenPoint {`
- [`scale_player_layout`](scene.rs#L99) — Escala el arte del jugador alrededor de sus pies sin deslizar su punto de contacto.
  - Firma: `pub(crate) fn scale_player_layout(layout: SpriteLayout, feet: ScreenPoint, scale: BodyScale) -> SpriteLayout {`
- [`frame_projection`](scene.rs#L161) — El origen de la proyección del fotograma a partir de la cámara, su nivel y las métricas de casilla de la escena.
  - Firma: `pub(crate) fn frame_projection(camera: Camera, level: f64, width: f32, height: f32, metrics: SceneMetrics) -> ProjectionConfig {`
- [`draw_clouds`](scene.rs#L173) — Dibuja las sombras de nubes sobre la escena terminada, bajo el HUD.
  - Firma: `pub(crate) fn draw_clouds(&mut self, frame_ms: f64, projection: &ProjectionConfig) {`
- [`collect_scene`](scene.rs#L186) — Los sprites del fotograma: terreno y sombras horneadas, entidades y reflejos, jugador y polvo. Reutiliza la cola de dibujo.
  - Firma: `pub(crate) fn collect_scene(&mut self, view: &FrameView) -> SceneStats {`

#### Tipos

- [`PlayerSprite`](scene.rs#L49) — El arte del jugador: su frame en el atlas y dónde pertenece sobre el suelo.
  - Firma: `pub(crate) struct PlayerSprite { pub(crate) frame: SpriteFrame, pub(crate) ink: InkBox, pub(crate) texture: usize }`
- [`SceneStats`](scene.rs#L115) — Lo que la pasada de escena midió: chunks dibujados y sprites en cola.
  - Firma: `pub(crate) struct SceneStats { pub(crate) chunks_drawn: usize, pub(crate) sprites: usize }`

### `state.rs`

#### Tipos

- [`Game`](state.rs#L53) — El juego compuesto: manager, archivo de guardado, jugador, cámara, stepper, reloj del mundo (`clock`), override de fase (`phase_override`), arte, sombras, polvo, cola de dibujo, servicios (audio, UI, perf), los controles táctiles (`touch`) y las métricas de casilla (`tile_metrics`).
  - Firma: `pub(crate) struct Game { ... }`

#### Funciones y métodos

- [`Game::new`](state.rs#L94) — Arranque: carga catálogo y manifiesto, restaura el guardado si existe, genera la zona de aparición y encuadra al jugador. Los fallos de assets degradan a avisos, nunca entran en pánico.
  - Firma: `pub(crate) async fn new() -> Self {`

## Detalles de implementación

### `ground.rs`

#### Funciones internas

- [`water_cell_of`](ground.rs#L55) — La regla pura: columna con agua → `WaterCell` con su propio nivel y elevación; cualquier otro material o ninguna columna → `None`.
  - Firma: `fn water_cell_of(column: Option<TerrainColumn>) -> Option<WaterCell> {`

### `frame.rs`

#### Funciones internas

- [`frame_ticks`](frame.rs#L27) — Ticks a simular este fotograma, saturando en `u32::MAX` en vez de envolver.
  - Firma: `fn frame_ticks(consumed: u64) -> u32 {`
- [`camera_after_follow`](frame.rs#L34) — La traslación de la cámara un fotograma después, siguiendo a `target` con la semivida del seguimiento: filtra las esquinas de velocidad de los ticks de 50 ms para que no lleguen a la pantalla; el zoom nunca cambia.
  - Firma: `fn camera_after_follow(camera: Camera, target: GridPoint, elapsed_ms: f64) -> Camera {`
- [`should_autosave`](frame.rs#L46) — El respaldo periódico: solo con cambios sin guardar, al salir o al superar `AUTOSAVE_SECONDS`.
  - Firma: `fn should_autosave(unsaved_changes: bool, quitting: bool, since_last_save_seconds: f64) -> bool {`

### `scene.rs`

#### Funciones internas

- [`screen_point`](scene.rs#L120) — Proyecta un `GridPoint` a `Vec2` de macroquad.
  - Firma: `fn screen_point(point: GridPoint, projection: ProjectionConfig) -> Vec2 {`
- [`draw_grid`](scene.rs#L125) — La rejilla de depuración que se dibuja cuando el terreno está oculto (T).
  - Firma: `fn draw_grid(projection: ProjectionConfig, centre: WorldCoord) {`
- [`collect_world`](scene.rs#L212) — Terreno y sombras horneadas de los chunks visibles, luego entidades y sus reflejos. Devuelve cuántos chunks se dibujaron.
  - Firma: `fn collect_world(&mut self, view: &FrameView) -> usize {`
- [`collect_player`](scene.rs#L367) — El sprite del jugador: clave de profundidad, pose, arte o figura quieta, su reflejo y la sombra que le cae encima. Devuelve cuánto se movió.
  - Firma: `fn collect_player(&mut self, view: &FrameView) -> f64 {`
- [`collect_dust`](scene.rs#L481) — El polvo levantado por el movimiento del jugador.
  - Firma: `fn collect_dust(&mut self, view: &FrameView, moved: f64) {`

### `state.rs`

#### Funciones internas

- [`client_path`](state.rs#L47) — De dónde se pide el manifiesto, según la plataforma (dos definiciones con `#[cfg]`): `./` en WASM; en nativo, la ruta tal cual si existe junto al CWD (desarrollo), y desde `Contents/Resources` del bundle cuando corre dentro de un `.app` (`crate::app`).
  - Firma: `fn client_path(path: &str) -> String {`
