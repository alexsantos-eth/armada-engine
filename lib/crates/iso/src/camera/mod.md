# Camera

Este dominio modela la cámara como estado de juego: foco, desplazamiento, proyección a pantalla y selección de chunks visibles. Permite decidir qué región observar sin depender de una ventana, un dispositivo de entrada o una API de gráficos.

Los cálculos deben ser deterministas y operar con los tipos espaciales del crate. La visibilidad describe una consulta de mundo, no una orden de renderizado.

No crea cámaras de una biblioteca externa, no dibuja ni aplica transformaciones de GPU. El cliente adapta estos resultados a su backend visual.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `focus.rs`

#### Funciones y métodos

- [`new`](focus.rs#L45) — A focus already settled on the top `at` stands on, so a session does not open with a swoop.
  - Firma: `pub fn new(at: &PlayerRenderPosition) -> Self {`

- [`level`](focus.rs#L57) — The level it shows now, in blocks above elevation zero: what the last
  - Firma: `pub fn level(&self) -> f64 {`

- [`aim_level`](focus.rs#L62) — The level it is heading for, before any chase: the top under the player, its feet while they
  - Firma: `pub fn aim_level(&self) -> f64 {`

- [`rising`](focus.rs#L67) — Whether it is still rising onto a higher top, so the camera has somewhere to go even on a
  - Firma: `pub fn rising(&self) -> bool {`

- [`advance`](focus.rs#L72) — The level to show for the player at `at`, `elapsed_ms` real milliseconds after the last
  - Firma: `pub fn advance( &mut self, at: &PlayerRenderPosition, motion: PlayerMotionType, elapsed_ms: f64, smooth_ms: f64, ) -> f64 {`

- [`ground`](focus.rs#L142) — [`Self::advance`] as the ground point the TypeScript client's camera centres on: the
  - Firma: `pub fn ground( &mut self, at: &PlayerRenderPosition, motion: PlayerMotionType, elapsed_ms: f64, projection: ProjectionConfig, ) -> GridPoint {`

#### Constantes

- [`CAMERA_RISE_MS_PER_BLOCK`](focus.rs#L10) — Real milliseconds the camera takes to rise one block onto a higher top the player did not climb
  - Declaración: `pub const CAMERA_RISE_MS_PER_BLOCK: f64 = PLAYER_CLIMB_MS;`

- [`CAMERA_LEVEL_SMOOTH_MS`](focus.rs#L13) — How long the level a camera shows takes to settle on the level it aims at, in real
  - Declaración: `pub const CAMERA_LEVEL_SMOOTH_MS: f64 = 65.0;`

### `geometry.rs`

#### Funciones y métodos

- [`validate`](geometry.rs#L49) — Valida los invariantes de «» y devuelve el resultado de esa comprobación.
  - Firma: `pub fn validate(self) -> Result<Self, InvalidCameraLimits> {`

- [`clamp_camera`](geometry.rs#L73) — Calcula o recupera «clamp camera» según los parámetros de la firma.
  - Firma: `pub fn clamp_camera(camera: Camera, limits: CameraLimits) -> Camera {`

- [`create_camera`](geometry.rs#L81) — Crea el recurso o estado «camera» a partir de los parámetros recibidos.
  - Firma: `pub fn create_camera( limits: CameraLimits, start: Option<Camera>, ) -> Result<Camera, InvalidCameraLimits> {`

- [`pan_camera`](geometry.rs#L109) — Calcula o recupera «pan camera» según los parámetros de la firma.
  - Firma: `pub fn pan_camera( camera: Camera, delta: ScreenPoint, limits: CameraLimits, projection: ProjectionConfig, ) -> Camera {`

- [`screen_to_ground`](geometry.rs#L133) — Calcula o recupera «screen to ground» según los parámetros de la firma.
  - Firma: `pub fn screen_to_ground( camera: Camera, viewport: ScreenSize, point: ScreenPoint, projection: ProjectionConfig, ) -> GridPoint {`

- [`zoom_camera_at`](geometry.rs#L149) — Calcula o recupera «zoom camera at» según los parámetros de la firma.
  - Firma: `pub fn zoom_camera_at( camera: Camera, factor: f64, anchor: ScreenPoint, viewport: ScreenSize, limits: CameraLimits, projection: ProjectionConfig, ) -> Camera {`

- [`camera_transform`](geometry.rs#L184) — Calcula o recupera «camera transform» según los parámetros de la firma.
  - Firma: `pub fn camera_transform( camera: Camera, viewport: ScreenSize, projection: ProjectionConfig, ) -> CameraTransform {`

- [`ground_point_below`](geometry.rs#L204) — Ground point shown at the same screen height as a point raised above elevation zero.
  - Firma: `pub fn ground_point_below( point: GridPoint, elevation: f64, projection: ProjectionConfig, ) -> GridPoint {`

- [`follow_camera`](geometry.rs#L220) — Calcula o recupera «follow camera» según los parámetros de la firma.
  - Firma: `pub fn follow_camera( camera: Camera, target: GridPoint, elapsed_ms: f64, limits: CameraLimits, half_life_ms: f64, ) -> Camera {`

#### Constantes

- [`CAMERA_FOLLOW_HALF_LIFE_MS`](geometry.rs#L7) — Define la semivida, en milisegundos, usada al suavizar el seguimiento de la cámara.
  - Declaración: `pub const CAMERA_FOLLOW_HALF_LIFE_MS: f64 = 90.0;`

### `visibility.rs`

#### Funciones y métodos

- [`cull_rect`](visibility.rs#L20) — Calcula o recupera «cull rect» según los parámetros de la firma.
  - Firma: `pub fn cull_rect(viewport: ScreenSize, margin: f64) -> ScreenRect {`

- [`needs_cull`](visibility.rs#L31) — Calcula o recupera «needs cull» según los parámetros de la firma.
  - Firma: `pub fn needs_cull( previous: Option<Camera>, camera: Camera, viewport: ScreenSize, projection: ProjectionConfig, margin: f64, ) -> bool {`

- [`visible_chunks`](visibility.rs#L63) — Chunks intersecting the view, including raised terrain/entities and low water.
  - Firma: `pub fn visible_chunks( camera: Camera, viewport: ScreenSize, projection: ProjectionConfig, margin: f64, ) -> Vec<ChunkCoord> {`

#### Constantes

- [`CAMERA_CULL_MARGIN`](visibility.rs#L7) — Define el margen adicional de culling de la cámara para evitar cambios visibles en el borde.
  - Declaración: `pub const CAMERA_CULL_MARGIN: f64 = 0.1;`

- [`CHUNK_VIEW_MARGIN`](visibility.rs#L8) — Define el margen de chunks añadido alrededor de la región visible.
  - Declaración: `pub const CHUNK_VIEW_MARGIN: f64 = 0.1;`

- [`CHUNK_VIEW_RISE`](visibility.rs#L9) — Define el ascenso de la ventana visible de chunks respecto al foco de cámara.
  - Declaración: `pub const CHUNK_VIEW_RISE: f64 = 10.0;`

- [`CHUNK_VIEW_DROP`](visibility.rs#L10) — Define el descenso de la ventana visible de chunks respecto al foco de cámara.
  - Declaración: `pub const CHUNK_VIEW_DROP: f64 = 4.0;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `focus.rs`

#### Constantes internas

- [`LEVEL_SNAP`](focus.rs#L16) — Blocks under which the level a camera shows settles on the level it aims at, once it is barely
  - Declaración: `const LEVEL_SNAP: f64 = 0.002;`

- [`LEVEL_SNAP_SPEED`](focus.rs#L19) — Blocks a second under which the spring counts as stopped, for the settle above.
  - Declaración: `const LEVEL_SNAP_SPEED: f64 = 0.05;`

### `geometry.rs`

#### Funciones internas

- [`offset_on_ground`](geometry.rs#L95) — Calcula o recupera «offset on ground» según los parámetros de la firma.
  - Firma: `fn offset_on_ground(camera: Camera, delta: ScreenPoint, projection: ProjectionConfig) -> GridPoint {`

#### Constantes internas

- [`FOLLOW_SNAP_DISTANCE`](geometry.rs#L8) — Define el parámetro interno «FOLLOW SNAP DISTANCE» empleado por este módulo.
  - Declaración: `const FOLLOW_SNAP_DISTANCE: f64 = 1e-3;`
