# Camera

Este dominio modela la cámara como estado de juego: foco, desplazamiento, proyección a pantalla y selección de chunks visibles. Permite decidir qué región observar sin depender de una ventana, un dispositivo de entrada o una API de gráficos.

Los cálculos deben ser deterministas y operar con los tipos espaciales del crate. La visibilidad describe una consulta de mundo, no una orden de renderizado.

No crea cámaras de una biblioteca externa, no dibuja ni aplica transformaciones de GPU. El cliente adapta estos resultados a su backend visual.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `focus.rs`

#### Funciones y métodos

- [`new`](focus.rs#L43) — Un foco ya asentado sobre la cara superior sobre la que se alza `at`, para que la sesión no comience con un barrido.
  - Firma: `pub fn new(at: &PlayerRenderPosition) -> Self {`

- [`level`](focus.rs#L55) — El nivel que muestra ahora, en bloques por encima de la elevación cero: lo que la última
  - Firma: `pub fn level(&self) -> f64 {`

- [`aim_level`](focus.rs#L60) — El nivel hacia el que se dirige, antes de cualquier persecución: la cara superior bajo el jugador, su altura de pies mientras
  - Firma: `pub fn aim_level(&self) -> f64 {`

- [`rising`](focus.rs#L65) — Si aún está ascendiendo hacia una cara superior más alta, para que la cámara tenga adónde ir incluso en un
  - Firma: `pub fn rising(&self) -> bool {`

- [`advance`](focus.rs#L70) — El nivel que mostrar para el jugador en `at`, `elapsed_ms` milisegundos reales después de la última
  - Firma: `pub fn advance( &mut self, at: &PlayerRenderPosition, motion: PlayerMotionType, elapsed_ms: f64, smooth_ms: f64, ) -> f64 {`

- [`ground`](focus.rs#L139) — [`Self::advance`] como el punto de suelo en el que la cámara se centra: el
  - Firma: `pub fn ground( &mut self, at: &PlayerRenderPosition, motion: PlayerMotionType, elapsed_ms: f64, projection: ProjectionConfig, ) -> GridPoint {`

#### Constantes

- [`CAMERA_RISE_MS_PER_BLOCK`](focus.rs#L8) — Milisegundos reales que tarda la cámara en ascender un bloque hacia una cara superior más alta a la que el jugador no trepó
  - Declaración: `pub const CAMERA_RISE_MS_PER_BLOCK: f64 = PLAYER_CLIMB_MS;`

- [`CAMERA_LEVEL_SMOOTH_MS`](focus.rs#L11) — Cuánto tarda el nivel que muestra una cámara en asentarse en el nivel al que apunta, en
  - Declaración: `pub const CAMERA_LEVEL_SMOOTH_MS: f64 = 65.0;`

### `geometry.rs`

#### Funciones y métodos

- [`screen_to_ground`](geometry.rs#L67) — Proyecta `point` de pantalla al plano del suelo a través de la cámara.
  - Firma: `pub fn screen_to_ground( camera: Camera, viewport: ScreenSize, point: ScreenPoint, projection: ProjectionConfig, ) -> GridPoint {`

- [`camera_transform`](geometry.rs#L83) — Transformación mundo→pantalla completa (proyección × cámara) para `viewport`.
  - Firma: `pub fn camera_transform( camera: Camera, viewport: ScreenSize, projection: ProjectionConfig, ) -> CameraTransform {`

- [`ground_point_below`](geometry.rs#L103) — Punto de suelo mostrado a la misma altura de pantalla que un punto elevado por encima de la elevación cero.
  - Firma: `pub fn ground_point_below( point: GridPoint, elevation: f64, projection: ProjectionConfig, ) -> GridPoint {`

- [`follow_camera`](geometry.rs#L119) — Sigue a `target` con la semivida `CAMERA_FOLLOW_HALF_LIFE_MS` (`elapsed_ms`), sin snaps.
  - Firma: `pub fn follow_camera( camera: Camera, target: GridPoint, elapsed_ms: f64, limits: CameraLimits, half_life_ms: f64, ) -> Camera {`

#### Constantes

- [`CAMERA_FOLLOW_HALF_LIFE_MS`](geometry.rs#L7) — Define la semivida, en milisegundos, usada al suavizar el seguimiento de la cámara.
  - Declaración: `pub const CAMERA_FOLLOW_HALF_LIFE_MS: f64 = 90.0;`

### `visibility.rs`

#### Funciones y métodos

- [`cull_rect`](visibility.rs#L18) — Rectángulo útil de dibujo: el viewport ampliado `margin` (fracción) por cada lado.
  - Firma: `pub fn cull_rect(viewport: ScreenSize, margin: f64) -> ScreenRect {`

- [`needs_cull`](visibility.rs#L29) — Si hay que recomputar el recorte: primer encuadre, cambio de zoom o cámara desplazada más allá del margen.
  - Firma: `pub fn needs_cull( previous: Option<Camera>, camera: Camera, viewport: ScreenSize, projection: ProjectionConfig, margin: f64, ) -> bool {`

- [`visible_chunks`](visibility.rs#L61) — Chunks que intersectan la vista, incluidos terreno/entidades elevados y agua baja.
  - Firma: `pub fn visible_chunks( camera: Camera, viewport: ScreenSize, projection: ProjectionConfig, margin: f64, ) -> Vec<ChunkCoord> {`

#### Constantes


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `focus.rs`

#### Constantes internas

- [`LEVEL_SNAP`](focus.rs#L14) — Bloques por debajo de los cuales el nivel que muestra la cámara se asienta en el nivel al que apunta, una vez que apenas
  - Declaración: `const LEVEL_SNAP: f64 = 0.002;`

- [`LEVEL_SNAP_SPEED`](focus.rs#L17) — Bloques por segundo por debajo de los cuales el muelle cuenta como detenido, para el asentamiento anterior.
  - Declaración: `const LEVEL_SNAP_SPEED: f64 = 0.05;`

### `geometry.rs`

#### Funciones internas

- [`clamp_camera`](geometry.rs#L45) — Recorta `camera` a los límites (posición y zoom).
  - Firma: `fn clamp_camera(camera: Camera, limits: CameraLimits) -> Camera {`

- [`offset_on_ground`](geometry.rs#L53) — Desplaza un punto del suelo a partir de un delta de pantalla bajo `camera`.
  - Firma: `fn offset_on_ground(camera: Camera, delta: ScreenPoint, projection: ProjectionConfig) -> GridPoint {`

#### Constantes internas

- [`FOLLOW_SNAP_DISTANCE`](geometry.rs#L8) — Distancia de imán para enganchar la cámara al objetivo durante el seguimiento.
  - Declaración: `const FOLLOW_SNAP_DISTANCE: f64 = 1e-3;`

### `visibility.rs`

#### Constantes internas

- [`CHUNK_VIEW_RISE`](visibility.rs#L7) — Ascenso de la ventana visible de chunks respecto al foco de cámara.
  - Declaración: `const CHUNK_VIEW_RISE: f64 = 10.0;`

- [`CHUNK_VIEW_DROP`](visibility.rs#L8) — Descenso de la ventana visible de chunks respecto al foco de cámara.
  - Declaración: `const CHUNK_VIEW_DROP: f64 = 4.0;`
