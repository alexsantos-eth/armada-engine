# Player

Este dominio de cliente presenta al jugador y sus efectos visuales usando el estado y la física de `iso::player`. Convierte el estado de dominio en sprites, orientación, interpolación y efectos visibles de Macroquad.

Debe tratar el crate `iso` como autoridad para movimiento y colisiones. Las decisiones de presentación pueden cambiar aquí sin alterar la simulación ni serialización del jugador.

No implementa física, no modifica reglas de entrada ni persiste estado jugable. Es una adaptación visual del dominio de jugador.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `dust_view.rs`

#### Funciones y métodos

- [`new`](dust_view.rs#L92) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`live`](dust_view.rs#L104) — How many puffs are still rising, for the heads-up display and the tests.
  - Firma: `pub fn live(&self) -> usize {`

- [`react`](dust_view.rs#L113) — Notices what the player has done since the last frame and raises the dust for it: a puff
  - Firma: `pub fn react( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`advance`](dust_view.rs#L221) — Ages every live puff by `elapsed_ms` of real time, ending the ones whose life is over.
  - Firma: `pub fn advance(&mut self, elapsed_ms: f64) {`

- [`collect`](dust_view.rs#L230) — Queues every live cube of dust into `draws`, each at the depth it took when its puff
  - Firma: `pub fn collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>) {`

#### Constantes

- [`DUST_TOP`](dust_view.rs#L14) — The colours of a voxel of dust, nearly white: its lit top, its left side and its right side.
  - Declaración: `pub const DUST_TOP: u32 = 0xfbf9f4;`

- [`DUST_LEFT`](dust_view.rs#L15) — Selecciona el desplazamiento horizontal de polvo a la izquierda del jugador.
  - Declaración: `pub const DUST_LEFT: u32 = 0xe6e2d8;`

- [`DUST_RIGHT`](dust_view.rs#L16) — Selecciona el desplazamiento horizontal de polvo a la derecha del jugador.
  - Declaración: `pub const DUST_RIGHT: u32 = 0xcfcabd;`

- [`DUST_BEHIND_LAYER`](dust_view.rs#L19) — The layer dust drawn behind what stands on its column goes in: the one a column's top wears
  - Declaración: `pub const DUST_BEHIND_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;`

- [`DUST_FRONT_DEPTH`](dust_view.rs#L22) — Depth added to a cube of dust in front of the feet, so it draws after the column it is over
  - Declaración: `pub const DUST_FRONT_DEPTH: f64 = 0.00001;`

- [`RUN_DUST_EVERY`](dust_view.rs#L25) — Columns a running player covers between two puffs of dust.
  - Declaración: `pub const RUN_DUST_EVERY: f64 = 0.7;`

- [`SKID_DUST_EVERY`](dust_view.rs#L28) — Columns a skidding player slides between two puffs: more often than running, because a skid
  - Declaración: `pub const SKID_DUST_EVERY: f64 = 0.2;`

- [`RUN_PUFFS`](dust_view.rs#L31) — Puffs of running or skidding dust alive at once, reused in turn.
  - Declaración: `pub const RUN_PUFFS: usize = 6;`

### `player_view.rs`

#### Funciones y métodos

- [`jump_poses`](player_view.rs#L54) — The columns of the five jump phases in a sheet that names its columns (`data-poses`).
  - Firma: `pub fn jump_poses(poses: &[String], columns: usize) -> Option<[usize; 5]> {`

- [`advance`](player_view.rs#L99) — Takes one frame into account and answers with the pose to draw.
  - Firma: `pub fn advance(&mut self, moment: PlayerMoment, sheets: PlayerSheets) -> PlayerPose {`

- [`facing_name`](player_view.rs#L172) — The name of the facing the player is drawn with, for the heads-up display.
  - Firma: `pub fn facing_name(&self) -> &'static str {`

#### Constantes

- [`WALK_STRIDE`](player_view.rs#L8) — Columns walked per cycle of the walk sheet:
  - Declaración: `pub const WALK_STRIDE: f64 = 1.4;`

- [`IDLE_PERIOD_MS`](player_view.rs#L11) — Real milliseconds one cycle of the idle sheet lasts: two beats of the monkey's dance.
  - Declaración: `pub const IDLE_PERIOD_MS: f64 = 900.0;`

- [`IDLE_DELAY_MS`](player_view.rs#L14) — Milliseconds the player stands still before its idle cycle starts, so that stopping for an
  - Declaración: `pub const IDLE_DELAY_MS: f64 = 300.0;`

- [`AIR_POSE`](player_view.rs#L17) — The walk pose used in the air when there is no jump sheet: the legs furthest apart, a leap.
  - Declaración: `pub const AIR_POSE: i32 = 3;`

- [`SKID_PEDAL`](player_view.rs#L20) — How fast the feet pedal while the player skids: twice walking pace, and backwards when it
  - Declaración: `pub const SKID_PEDAL: f64 = 2.0;`

- [`START_FACING`](player_view.rs#L23) — The facing the player starts with, before it has walked anywhere: towards the camera, which
  - Declaración: `pub const START_FACING: usize = 12;`

- [`TURN_MS_PER_FACING`](player_view.rs#L26) — Real milliseconds the figure spends on each facing it passes through while it turns.
  - Declaración: `pub const TURN_MS_PER_FACING: f64 = 35.0;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `dust_view.rs`

#### Funciones internas

- [`default`](dust_view.rs#L86) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`kick`](dust_view.rs#L150) — The trail a running or skidding player kicks up behind its feet, a puff every stretch of
  - Firma: `fn kick( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`raise`](dust_view.rs#L193) — Calcula o recupera «raise» según los parámetros de la firma.
  - Firma: `fn raise( &mut self, index: usize, shape: DustShape, feet: GridPoint, level: f64, kick: GridPoint, origin: GridPoint, tile_height: f64, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`voxel_key`](dust_view.rs#L274) — Where a cube of dust sorts in the scene: the column it is over halfway through its life, and
  - Firma: `fn voxel_key( voxel: DustVoxel, feet: GridPoint, level: f64, tile_height: f64, top_at: &impl Fn(i32, i32) -> Option<f64>, ) -> DrawKey {`

- [`offset`](dust_view.rs#L305) — The voxel's faces moved to the point it stands on.
  - Firma: `fn offset(faces: VoxelFaces, x: f64, y: f64) -> VoxelFaces {`

- [`colours`](dust_view.rs#L315) — The three faces' colours for a cube of `shade` at `alpha`: each face's own near-white
  - Firma: `fn colours(shade: u32, alpha: f64) -> [Color; 3] {`

#### Constantes internas

- [`TAKEOFF_PUFF`](dust_view.rs#L34) — The puff a take-off raises, in the air too, so a double jump puffs again.
  - Declaración: `const TAKEOFF_PUFF: usize = 0;`

- [`LANDING_PUFF`](dust_view.rs#L37) — The puff a landing raises, on the ground it landed on.
  - Declaración: `const LANDING_PUFF: usize = 1;`

- [`PUFFS`](dust_view.rs#L40) — The whole pool: a take-off, a landing and the running trail.
  - Declaración: `const PUFFS: usize = 2 + RUN_PUFFS;`

- [`ZERO`](dust_view.rs#L271) — No kick and no offset from the feet.
  - Declaración: `const ZERO: GridPoint = GridPoint { x: 0.0, y: 0.0 };`

### `player_view.rs`

#### Funciones internas

- [`default`](player_view.rs#L87) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`turn_towards`](player_view.rs#L150) — Steps the facing towards `target` by the shorter way round, one facing per
  - Firma: `fn turn_towards(&mut self, target: usize, elapsed_ms: f64) {`

- [`pose`](player_view.rs#L176) — Calcula o recupera «pose» según los parámetros de la firma.
  - Firma: `fn pose(&self, frame: PlayerFrame) -> PlayerPose {`

- [`phase_column`](player_view.rs#L186) — Which of the five jump columns a phase uses; `Ground` never reaches here and takes the
  - Firma: `fn phase_column(phase: PlayerJumpPhase) -> usize {`

#### Constantes internas

- [`PHASES`](player_view.rs#L55) — Define el parámetro interno «PHASES» empleado por este módulo.
  - Declaración: `const PHASES: [&str; 5] = ["takeoff", "rise", "apex", "fall", "landing"];`
