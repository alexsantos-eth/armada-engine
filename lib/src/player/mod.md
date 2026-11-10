# Player

Este dominio de cliente presenta al jugador y sus efectos visuales usando el estado y la física de `iso::player`. Convierte el estado de dominio en sprites, orientación, interpolación y efectos visibles de Macroquad.

Debe tratar el crate `iso` como autoridad para movimiento y colisiones. Las decisiones de presentación pueden cambiar aquí sin alterar la simulación ni serialización del jugador.

No implementa física, no modifica reglas de entrada ni persiste estado jugable. Es una adaptación visual del dominio de jugador.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `dust_view.rs`

#### Funciones y métodos

- [`new`](dust_view.rs#L101) — Construye una instancia nueva con los valores iniciales indicados por los parámetros.
  - Firma: `pub fn new() -> Self {`

- [`live`](dust_view.rs#L113) — Cuántos soplos siguen elevándose, para el HUD y las pruebas.
  - Firma: `pub fn live(&self) -> usize {`

- [`react`](dust_view.rs#L122) — Detecta lo que ha hecho el jugador desde el último frame y levanta el polvo correspondiente: un soplo
  - Firma: `pub fn react( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`advance`](dust_view.rs#L226) — Envejece cada soplo vivo en `elapsed_ms` de tiempo real, terminando los cuya vida ha acabado.
  - Firma: `pub fn advance(&mut self, elapsed_ms: f64) {`

- [`collect`](dust_view.rs#L235) — Encola cada cubo de polvo vivo en `draws`, cada uno a la profundidad que tomó cuando su soplo
  - Firma: `pub fn collect(&self, projection: ProjectionConfig, draws: &mut Vec<SpriteDraw>) {`

#### Constantes

- [`DUST_TOP`](dust_view.rs#L23) — Los colores de un voxel de polvo, casi blanco: su cara superior iluminada, su lado izquierdo y su lado derecho.
  - Declaración: `pub const DUST_TOP: u32 = 0xfbf9f4;`

- [`DUST_LEFT`](dust_view.rs#L24) — Selecciona el desplazamiento horizontal de polvo a la izquierda del jugador.
  - Declaración: `pub const DUST_LEFT: u32 = 0xe6e2d8;`

- [`DUST_RIGHT`](dust_view.rs#L25) — Selecciona el desplazamiento horizontal de polvo a la derecha del jugador.
  - Declaración: `pub const DUST_RIGHT: u32 = 0xcfcabd;`

- [`DUST_BEHIND_LAYER`](dust_view.rs#L28) — La capa en la que va el polvo dibujado detrás de lo que hay sobre su columna: la que luce la cima de una columna
  - Declaración: `pub const DUST_BEHIND_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;`

- [`DUST_FRONT_DEPTH`](dust_view.rs#L31) — Profundidad añadida a un cubo de polvo delante de los pies, para que se dibuje después de la columna sobre la que está
  - Declaración: `pub const DUST_FRONT_DEPTH: f64 = 0.00001;`

- [`RUN_DUST_EVERY`](dust_view.rs#L34) — Columnas que un jugador corriendo recorre entre dos soplos de polvo.
  - Declaración: `pub const RUN_DUST_EVERY: f64 = 0.7;`

- [`SKID_DUST_EVERY`](dust_view.rs#L37) — Columnas que un jugador derrapando desliza entre dos soplos: más a menudo que al correr, porque un derrape
  - Declaración: `pub const SKID_DUST_EVERY: f64 = 0.2;`

- [`RUN_PUFFS`](dust_view.rs#L40) — Soplos de polvo de carrera o derrape vivos a la vez, reutilizados por turno.
  - Declaración: `pub const RUN_PUFFS: usize = 6;`

### `body_motion.rs`

#### Tipos

- [`BodyScale`](body_motion.rs#L22) — Escala visual del cuerpo alrededor de los pies.
  - Firma: `pub struct BodyScale { pub x: f64, pub y: f64 }`
- [`BodyMoment`](body_motion.rs#L29) — Muestra de estado del jugador para una animación visual de un fotograma.
  - Firma: `pub struct BodyMoment { ... }`
- [`BodyMotion`](body_motion.rs#L43) — Memoria de los pulsos visuales de despegue y aterrizaje.
  - Firma: `pub struct BodyMotion { ... }`

#### Funciones y métodos

- [`advance`](body_motion.rs#L65) — Avanza pulsos visuales y devuelve la escala del cuerpo para el fotograma.
  - Firma: `pub fn advance(&mut self, moment: BodyMoment) -> BodyScale {`

#### Constantes

- [`LANDING_SQUASH_MS`](body_motion.rs#L8) — Milisegundos de compresión tras aterrizar.
  - Declaración: `pub const LANDING_SQUASH_MS: f64 = 180.0;`
- [`TAKEOFF_STRETCH_MS`](body_motion.rs#L10) — Milisegundos de estiramiento tras despegar.
  - Declaración: `pub const TAKEOFF_STRETCH_MS: f64 = 120.0;`

### `player_view.rs`

#### Funciones y métodos

- [`jump_poses`](player_view.rs#L54) — Las columnas de las cinco fases de salto en una hoja que nombra sus columnas (`data-poses`).
  - Firma: `pub fn jump_poses(poses: &[String], columns: usize) -> Option<[usize; 5]> {`

- [`advance`](player_view.rs#L99) — Tiene en cuenta un frame y responde con la pose a dibujar.
  - Firma: `pub fn advance(&mut self, moment: PlayerMoment, sheets: PlayerSheets) -> PlayerPose {`

- [`facing_name`](player_view.rs#L172) — El nombre de la orientación con la que se dibuja al jugador, para el HUD.
  - Firma: `pub fn facing_name(&self) -> &'static str {`

- [`walked`](player_view.rs#L177) — Distancia de la zancada visual actual, incluida la pedalada inversa del derrape.
  - Firma: `pub fn walked(&self) -> f64 {`

#### Constantes

- [`WALK_STRIDE`](player_view.rs#L8) — Columnas recorridas por ciclo de la hoja de caminar:
  - Declaración: `pub const WALK_STRIDE: f64 = 1.4;`

- [`IDLE_PERIOD_MS`](player_view.rs#L11) — Milisegundos reales que dura un ciclo de la hoja de reposo: dos compases del baile del mono.
  - Declaración: `pub const IDLE_PERIOD_MS: f64 = 900.0;`

- [`IDLE_DELAY_MS`](player_view.rs#L14) — Milisegundos que el jugador permanece quieto antes de que empiece su ciclo de reposo, de modo que al pararse para un
  - Declaración: `pub const IDLE_DELAY_MS: f64 = 300.0;`

- [`AIR_POSE`](player_view.rs#L17) — La pose de caminar usada en el aire cuando no hay hoja de salto: las piernas más separadas, un brinco.
  - Declaración: `pub const AIR_POSE: i32 = 3;`

- [`SKID_PEDAL`](player_view.rs#L20) — A qué velocidad pedalean los pies mientras el jugador derrapa: el doble del paso al caminar, y hacia atrás cuando
  - Declaración: `pub const SKID_PEDAL: f64 = 2.0;`

- [`START_FACING`](player_view.rs#L23) — La orientación con la que empieza el jugador, antes de haber caminado a ningún sitio: hacia la cámara, que
  - Declaración: `pub const START_FACING: usize = 12;`

- [`TURN_MS_PER_FACING`](player_view.rs#L26) — Milisegundos reales que la figura pasa en cada orientación por la que transita mientras gira.
  - Declaración: `pub const TURN_MS_PER_FACING: f64 = 35.0;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `dust_view.rs`

#### Funciones internas

- [`default`](dust_view.rs#L95) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`kick`](dust_view.rs#L162) — El rastro que un jugador corriendo o derrapando levanta tras sus pies, un soplo cada tramo de
  - Firma: `fn kick( &mut self, player: &PlayerState, at: DustGround, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`raise`](dust_view.rs#L201) — Calcula o recupera «raise» según los parámetros de la firma.
  - Firma: `fn raise( &mut self, index: usize, shape: DustShape, feet: GridPoint, level: f64, kick: GridPoint, origin: GridPoint, tile_height: f64, top_at: &impl Fn(i32, i32) -> Option<f64>, ) {`

- [`voxel_key`](dust_view.rs#L279) — Dónde se ordena un cubo de polvo en la escena: la columna sobre la que está a mitad de su vida, y
  - Firma: `fn voxel_key( voxel: DustVoxel, feet: GridPoint, level: f64, tile_height: f64, top_at: &impl Fn(i32, i32) -> Option<f64>, ) -> DrawKey {`

- [`offset`](dust_view.rs#L310) — Las caras del voxel movidas al punto sobre el que se apoya.
  - Firma: `fn offset(faces: VoxelFaces, x: f64, y: f64) -> VoxelFaces {`

- [`colours`](dust_view.rs#L320) — Los colores de las tres caras para un cubo de `shade` en `alpha`: cada cara con su propio casi blanco
  - Firma: `fn colours(shade: u32, alpha: f64) -> [Color; 3] {`

#### Constantes internas

- [`TAKEOFF_PUFF`](dust_view.rs#L43) — El soplo que levanta un despegue, también en el aire, así que un doble salto levanta otro soplo.
  - Declaración: `const TAKEOFF_PUFF: usize = 0;`

- [`LANDING_PUFF`](dust_view.rs#L46) — El soplo que levanta un aterrizaje, sobre el suelo en el que aterrizó.
  - Declaración: `const LANDING_PUFF: usize = 1;`

- [`PUFFS`](dust_view.rs#L49) — El conjunto completo: un despegue, un aterrizaje y el rastro de carrera.
  - Declaración: `const PUFFS: usize = 2 + RUN_PUFFS;`

- [`ZERO`](dust_view.rs#L276) — Sin kick ni desplazamiento respecto a los pies.
  - Declaración: `const ZERO: GridPoint = GridPoint { x: 0.0, y: 0.0 };`

### `player_view.rs`

#### Funciones internas

- [`default`](player_view.rs#L87) — Calcula o recupera «default» según los parámetros de la firma.
  - Firma: `fn default() -> Self {`

- [`turn_towards`](player_view.rs#L150) — Avanza la orientación hacia `target` por el camino más corto, una orientación por
  - Firma: `fn turn_towards(&mut self, target: usize, elapsed_ms: f64) {`

- [`pose`](player_view.rs#L181) — Calcula o recupera «pose» según los parámetros de la firma.
  - Firma: `fn pose(&self, frame: PlayerFrame) -> PlayerPose {`

- [`phase_column`](player_view.rs#L191) — Cuál de las cinco columnas de salto usa una fase; `Ground` nunca llega aquí y toma la
  - Firma: `fn phase_column(phase: PlayerJumpPhase) -> usize {`

#### Constantes internas

- [`PHASES`](player_view.rs#L55) — Define el parámetro interno «PHASES» empleado por este módulo.
  - Declaración: `const PHASES: [&str; 5] = ["takeoff", "rise", "apex", "fall", "landing"];`
