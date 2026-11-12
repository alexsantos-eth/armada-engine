# Player

Este dominio contiene el estado del jugador, movimiento, física y efectos de juego compartidos por los clientes. Mantiene las reglas que transforman entradas de simulación en cambios de posición y estado.

La física debe ser independiente de la frecuencia de renderizado y trabajar con datos del mundo, no con objetos del backend. Los efectos de dominio expresan eventos o estado jugable, no partículas ni sonidos concretos.

No dibuja al jugador, no reproduce audio y no lee dispositivos directamente. Esas adaptaciones se implementan fuera del crate de dominio.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `dust.rs`

#### Funciones y métodos

- [`get_dust`](dust.rs#L74) — Un soplo de polvo `ms` milisegundos reales después de que se alzó: cuánto ha recorrido su vida de `duration`
  - Firma: `pub fn get_dust(ms: f64, duration: f64, alpha: f64) -> Option<DustLook> {`

- [`mix_color`](dust.rs#L99) — El color a `share` (`0` → `1`) del camino de `from` a `to`, canal a canal, redondeado
  - Firma: `pub fn mix_color(colors: (u32, u32), share: f64) -> u32 {`

- [`new`](dust.rs#L119) — El flujo de `seed`, que es el número de soplos alzados hasta ahora.
  - Firma: `pub fn new(seed: u64) -> Self {`

- [`roll`](dust.rs#L126) — El siguiente número del flujo, en `[0, 1)`. SplitMix64, como las funciones hash de `terrain::noise`.
  - Firma: `pub fn roll(&mut self) -> f64 {`

- [`get_dust_voxels`](dust.rs#L137) — Los voxeles de un soplo de polvo de `shape`, dispersados por el flujo de `seed`: repartidos alrededor de la
  - Firma: `pub fn get_dust_voxels( shape: DustShape, seed: u64, kick: GridPoint, origin: GridPoint, ) -> Vec<DustVoxel> {`

- [`get_dust_voxel_at`](dust.rs#L182) — Donde `voxel` está a `progress` del camino a lo largo de la vida de su soplo (`0` → `1`): en columnas desde
  - Firma: `pub fn get_dust_voxel_at(voxel: DustVoxel, progress: f64) -> DustVoxelState {`

- [`get_dust_column`](dust.rs#L203) — La columna con la que se dibuja un voxel de polvo en `point` (en el suelo, en columnas), para pies en
  - Firma: `pub fn get_dust_column( point: GridPoint, feet: GridPoint, level: f64, top_at: impl Fn(i32, i32) -> Option<f64>, ) -> DustColumn {`

- [`voxel_faces`](dust.rs#L240) — Un voxel pequeño apoyado en el suelo, `size` casillas de ancho, con su base centrada en un punto: sus
  - Firma: `pub fn voxel_faces(size: f64, tile_width: f64, tile_height: f64, box_height: f64) -> VoxelFaces {`

#### Constantes

- [`DUST_MS`](dust.rs#L7) — Milisegundos reales que dura un soplo de polvo, en un despegue o un aterrizaje.
  - Declaración: `pub const DUST_MS: f64 = 360.0;`

- [`DUST_ALPHA`](dust.rs#L10) — Opacidad de un soplo de polvo mientras se eleva, atenuándose hasta `0` a lo largo de [`DUST_MS`].
  - Declaración: `pub const DUST_ALPHA: f64 = 0.85;`

- [`DUST_MIN_IMPACT`](dust.rs#L13) — Los aterrizajes más suaves que esto, en bloques por tick (un pequeño escalón descendente), no levantan polvo.
  - Declaración: `pub const DUST_MIN_IMPACT: f64 = 0.1;`

- [`DUST_COLORS`](dust.rs#L36) — Tonos de polvo: de blanco a un gris claro.
  - Declaración: `pub const DUST_COLORS: (u32, u32) = (0xffffff, 0xdbdbdb);`

- [`BURST_DUST`](dust.rs#L39) — El soplo de un despegue o un aterrizaje: un anillo de voxeles que estalla desde los pies.
  - Declaración: `pub const BURST_DUST: DustShape = DustShape {`

- [`KICK_DUST`](dust.rs#L53) — El soplo pequeño que un jugador corriendo o derrapando levanta detrás de sus pies.
  - Declaración: `pub const KICK_DUST: DustShape = DustShape {`

### `motion.rs`

#### Funciones y métodos

- [`transition_player_motion`](motion.rs#L84) — Aplica un evento a `state` y devuelve el estado de movimiento resultante.
  - Firma: `pub fn transition_player_motion( state: PlayerMotionType, event: PlayerMotionEvent, ) -> PlayerMotionType {`

### `physics.rs`

#### Funciones y métodos

- [`get_jump_height`](physics.rs#L103) — Altura de los pies sobre suelo llano `tick` ticks después de un salto.
  - Firma: `pub fn get_jump_height(tick: f64) -> f64 {`

- [`get_climb_rise`](physics.rs#L115) — Fracción de su ascenso que los pies de una escalada han subido en `progress` (0–1).
  - Firma: `pub fn get_climb_rise(progress: f64) -> f64 {`

- [`get_climb_advance`](physics.rs#L120) — Fracción del camino de `from` a `to` que una escalada ha recorrido en `progress` (0–1).
  - Firma: `pub fn get_climb_advance(progress: f64) -> f64 {`

- [`get_climb_shares`](physics.rs) — Fracción de su subida y fracción de su avance que una escalada ha recorrido en `progress` (0–1). Sobre un reborde el jugador se iza primero y pasa después; una grada avanza a ritmo constante y sube de peldaño en peldaño (`get_stairs_rise`), que es lo que parece tomar los escalones.
  - Firma: `pub fn get_climb_shares(stairs: bool, progress: f64) -> (f64, f64) {`

- [`get_stairs_rise`](physics.rs) — Fracción de su subida que una grada ha recorrido en `progress` (0–1): de peldaño en peldaño, subiendo el pie a cada escalón y descansando en él, en vez de deslizarse por una rampa. Las subidas negativas, las bajadas, toman sus peldaños igual.
  - Firma: `pub fn get_stairs_rise(progress: f64) -> f64 {`

- [`get_stairs_hop`](physics.rs) — Bloques que el cuerpo del jugador está por encima del peldaño que tiene bajo los pies en `progress` (0–1) de una grada: un saltito hacia cada escalón, nada al aterrizar en uno.
  - Firma: `pub fn get_stairs_hop(progress: f64) -> f64 {`

- [`blocked_side`](physics.rs#L145) — Calcula o recupera «blocked side» según los parámetros de la firma.
  - Firma: `pub fn blocked_side(&self, _x: f64, _y: f64) -> f64 {`

- [`get_player_column`](physics.rs#L246) — Columna a la que pertenece el punto de suelo `point`.
  - Firma: `pub fn get_player_column(point: GridPoint) -> WorldCoord {`

- [`can_stand_on`](physics.rs#L254) — Si el jugador puede mantenerse en pie en el centro de la columna `(x, y)` viniendo de `from_elevation`.
  - Firma: `pub fn can_stand_on<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`find_player_spawn`](physics.rs#L406) — Localiza «player spawn» que satisface las condiciones de la consulta.
  - Firma: `pub fn find_player_spawn<G: PlayerGround>(ground: &G, centre: GridPoint) -> PlayerPosition {`

- [`create_player`](physics.rs#L486) — Crea el recurso o estado «player» a partir de los parámetros recibidos.
  - Firma: `pub fn create_player<G: PlayerGround>(ground: &G, at: GridPoint) -> PlayerState {`

- [`get_walk_direction`](physics.rs#L518) — Obtiene «walk direction» sin modificar el estado consultado.
  - Firma: `pub fn get_walk_direction(directions: &ScreenDirections) -> GridPoint {`

- [`get_player_facing`](physics.rs#L542) — Obtiene «player facing» sin modificar el estado consultado.
  - Firma: `pub fn get_player_facing(walk: GridPoint) -> Option<usize> {`

- [`set_player_walk`](physics.rs#L553) — Actualiza «player walk» con el valor indicado.
  - Firma: `pub fn set_player_walk(player: &mut PlayerState, directions: ScreenDirections) {`

- [`set_player_jetpack`](physics.rs#L557) — Actualiza «player jetpack» con el valor indicado.
  - Firma: `pub fn set_player_jetpack(player: &mut PlayerState, jetpack: bool) {`

- [`set_player_run`](physics.rs#L561) — Actualiza «player run» con el valor indicado.
  - Firma: `pub fn set_player_run(player: &mut PlayerState, running: bool) {`

- [`is_player_running`](physics.rs#L565) — Evalúa si se cumple la condición «player running» para el estado recibido.
  - Firma: `pub fn is_player_running(player: &PlayerState) -> bool {`

- [`is_player_skidding`](physics.rs#L569) — Evalúa si se cumple la condición «player skidding» para el estado recibido.
  - Firma: `pub fn is_player_skidding(player: &PlayerState) -> bool {`

- [`jump_player`](physics.rs#L573) — Calcula o recupera «jump player» según los parámetros de la firma.
  - Firma: `pub fn jump_player(player: &mut PlayerState) {`

- [`set_player_jump_held`](physics.rs#L579) — Actualiza «player jump held» con el valor indicado.
  - Firma: `pub fn set_player_jump_held(player: &mut PlayerState, held: bool) {`

- [`cancel_player_jump`](physics.rs#L583) — Calcula o recupera «cancel player jump» según los parámetros de la firma.
  - Firma: `pub fn cancel_player_jump(player: &mut PlayerState) {`

- [`step_player`](physics.rs#L1045) — Calcula o recupera «step player» según los parámetros de la firma.
  - Firma: `pub fn step_player<G: PlayerGround>(player: &mut PlayerState, ground: &mut G, ticks: u32) {`

- [`get_player_jump_phase`](physics.rs#L1210) — Obtiene «player jump phase» sin modificar el estado consultado.
  - Firma: `pub fn get_player_jump_phase(player: &PlayerState) -> PlayerJumpPhase {`

- [`get_player_climb_progress`](physics.rs#L1242) — Cuánto lleva recorrido el jugador de una escalada sobre un reborde, para las poses de trepar. Una grada se sube andando, así que no informa nada y la vista sigue caminando.
  - Firma: `pub fn get_player_climb_progress(player: &PlayerState, alpha: f64) -> Option<f64> {`

- [`get_player_render_position`](physics.rs#L1253) — Posición de render del jugador: interpolación cúbica Hermite entre la posición al inicio del tick (`previous`, con sus velocidades) y la posición actual, con tangentes iguales a la velocidad horizontal y vertical de cada límite de tick; es C1 en cada límite y reproduce exactamente arcos de aceleración constante (un salto).
  - Firma: `pub fn get_player_render_position(player: &PlayerState, alpha: f64) -> PlayerRenderPosition {`

- [`get_player_cells`](physics.rs#L1288) — Obtiene «player cells» sin modificar el estado consultado.
  - Firma: `pub fn get_player_cells(point: GridPoint) -> crate::grid::WorldRect {`

- [`can_stand_on_public`](physics.rs#L1305) — Calcula o recupera «can stand on public» según los parámetros de la firma.
  - Firma: `pub fn can_stand_on_public<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`fits_player_at`](physics.rs#L1314) — Calcula o recupera «fits player at» según los parámetros de la firma.
  - Firma: `pub fn fits_player_at<G: PlayerGround>(ground: &G, point: GridPoint) -> bool {`

#### Constantes

- [`PLAYER_SPEED`](physics.rs#L10) — Velocidad de caminata del jugador, en columnas por segundo de simulación.
  - Declaración: `pub const PLAYER_SPEED: f64 = 3.0;`

- [`PLAYER_STEP`](physics.rs#L12) — Columnas horizontales máximas que un jugador caminando avanza en un tick.
  - Declaración: `pub const PLAYER_STEP: f64 = PLAYER_SPEED / TICKS_PER_SECOND as f64;`

- [`PLAYER_RUN_SPEED`](physics.rs#L14) — Velocidad de carrera del jugador, en columnas por segundo de simulación.
  - Declaración: `pub const PLAYER_RUN_SPEED: f64 = 5.0;`

- [`PLAYER_RUN_STEP`](physics.rs#L16) — Columnas horizontales máximas que un jugador corriendo avanza en un tick.
  - Declaración: `pub const PLAYER_RUN_STEP: f64 = PLAYER_RUN_SPEED / TICKS_PER_SECOND as f64;`

- [`PLAYER_GROUND_ACCEL`](physics.rs#L18) — Cambio de velocidad horizontal por tick al arrancar o redirigir en tierra.
  - Declaración: `pub const PLAYER_GROUND_ACCEL: f64 = 0.05;`

- [`PLAYER_GROUND_BRAKE`](physics.rs#L20) — Velocidad horizontal retirada por tick al soltar el movimiento en tierra.
  - Declaración: `pub const PLAYER_GROUND_BRAKE: f64 = 0.03;`

- [`PLAYER_AIR_ACCEL`](physics.rs#L22) — Cambio de velocidad horizontal por tick al virar en el aire.
  - Declaración: `pub const PLAYER_AIR_ACCEL: f64 = 0.04;`

- [`PLAYER_AIR_BRAKE`](physics.rs#L24) — Velocidad horizontal retirada por tick al soltar el movimiento en el aire.
  - Declaración: `pub const PLAYER_AIR_BRAKE: f64 = 0.025;`

- [`PLAYER_CORNER_NUDGE`](physics.rs#L26) — Desplazamiento lateral máximo usado para salvar una esquina pequeña.
  - Declaración: `pub const PLAYER_CORNER_NUDGE: f64 = 0.04;`

- [`PLAYER_RADIUS`](physics.rs#L28) — Mitad del lado del cuadrado que ocupan los pies del jugador en el suelo.
  - Declaración: `pub const PLAYER_RADIUS: f64 = 0.2;`

- [`PLAYER_BODY_HEIGHT`](physics.rs#L30) — Extensión vertical del cuerpo de colisión del jugador por encima de sus pies, en bloques.
  - Declaración: `pub const PLAYER_BODY_HEIGHT: f64 = 0.6;`

- [`PLAYER_RESCUE_DROP`](physics.rs#L32) — Distancia por debajo de la última superficie estable a la que se rescata una caída.
  - Declaración: `pub const PLAYER_RESCUE_DROP: f64 = 2.0;`

- [`PLAYER_MAX_CLIMB`](physics.rs#L34) — Máximo de bloques que el jugador escala hacia arriba o hacia abajo de una columna a la siguiente.
  - Declaración: `pub const PLAYER_MAX_CLIMB: f64 = 1.0;`

- [`PLAYER_JUMP_HEIGHT`](physics.rs#L36) — Bloques que suben los pies del jugador en el punto más alto de un salto.
  - Declaración: `pub const PLAYER_JUMP_HEIGHT: f64 = 0.85;`

- [`PLAYER_JUMP_TICKS`](physics.rs#L38) — Ticks que dura un salto en suelo llano, desde el despegue hasta el aterrizaje.
  - Declaración: `pub const PLAYER_JUMP_TICKS: i32 = 10;`

- [`PLAYER_JUMP_BUFFER_TICKS`](physics.rs#L40) — Ticks durante los que una pulsación de salto puede esperar al aterrizaje.
  - Declaración: `pub const PLAYER_JUMP_BUFFER_TICKS: i32 = 2;`

- [`PLAYER_COYOTE_TICKS`](physics.rs#L42) — Ticks durante los que el salto sigue siendo posible tras abandonar un borde.
  - Declaración: `pub const PLAYER_COYOTE_TICKS: i32 = 2;`

- [`PLAYER_AIR_JUMPS`](physics.rs#L44) — Saltos que el jugador puede dar en el aire antes de aterrizar.
  - Declaración: `pub const PLAYER_AIR_JUMPS: i32 = 1;`

- [`PLAYER_JUMP_SPEED`](physics.rs#L46) — Bloques por tick que suben los pies en el despegue.
  - Declaración: `pub const PLAYER_JUMP_SPEED: f64 = (4.0 * PLAYER_JUMP_HEIGHT) / PLAYER_JUMP_TICKS as f64;`

- [`PLAYER_JUMP_CUT_SPEED`](physics.rs#L48) — Velocidad ascendente que se conserva al soltar la tecla de salto.
  - Declaración: `pub const PLAYER_JUMP_CUT_SPEED: f64 = PLAYER_JUMP_SPEED * 0.6;`

- [`PLAYER_MAX_FALL_SPEED`](physics.rs#L50) — Velocidad descendente máxima en bloques por tick de simulación.
  - Declaración: `pub const PLAYER_MAX_FALL_SPEED: f64 = 0.6;`

- [`PLAYER_GRAVITY`](physics.rs#L52) — Bloques por tick que la velocidad ascendente de sus pies cae en cada tick en el aire.
  - Declaración: `pub const PLAYER_GRAVITY: f64 = (8.0 * PLAYER_JUMP_HEIGHT) / ((PLAYER_JUMP_TICKS as f64) * (PLAYER_JUMP_TICKS as f64));`

- [`PLAYER_STEP_HEIGHT`](physics.rs#L55) — Bloques que una superficie puede quedar por encima de los pies del jugador y aun así pisarse en un tick.
  - Declaración: `pub const PLAYER_STEP_HEIGHT: f64 = 0.25;`

- [`PLAYER_CLIMB_TICKS`](physics.rs#L57) — Ticks que dura una escalada de un bloque.
  - Declaración: `pub const PLAYER_CLIMB_TICKS: i32 = 12;`

- [`PLAYER_CLIMB_MS`](physics.rs#L59) — Milisegundos reales que dura una escalada de un bloque.
  - Declaración: `pub const PLAYER_CLIMB_MS: f64 = (PLAYER_CLIMB_TICKS as f64 * 1000.0) / TICKS_PER_SECOND as f64;`

- [`PLAYER_CLIMB_RISE_SHARE`](physics.rs#L61) — Fracción de una escalada que los pies emplean en subir hasta la cima.
  - Declaración: `pub const PLAYER_CLIMB_RISE_SHARE: f64 = 0.7;`

- [`PLAYER_CLIMB_REACH`](physics.rs#L63) — Columnas más allá de donde alcanza la superficie más alta que el jugador pisa durante una escalada.
  - Declaración: `pub const PLAYER_CLIMB_REACH: f64 = 0.25;`

- [`PLAYER_STAIRS_TICKS`](physics.rs) — Ticks que dura una grada de un bloque: se sube andando, no izándose.
  - Declaración: `pub const PLAYER_STAIRS_TICKS: i32 = 16;`

- [`PLAYER_STAIRS_REACH`](physics.rs) — Columnas del bloque de gradas que el jugador ha cruzado al llegar arriba, medidas desde el borde por el que entró: cruza casi el bloque entero.
  - Declaración: `pub const PLAYER_STAIRS_REACH: f64 = 0.95;`

- [`PLAYER_STAIRS_DESCENT_SHARE`](physics.rs) — Parte de la cara superior de una grada que el jugador cruza desde su borde de arriba antes de empezar a bajar los escalones: el último tramo de cima llana en el que se queda de pie.
  - Declaración: `pub const PLAYER_STAIRS_DESCENT_SHARE: f64 = 0.2;`

- [`PLAYER_STAIRS_STEPS`](physics.rs) — Peldaños en los que se toma una grada, uno por escalón de la obra.
  - Declaración: `pub const PLAYER_STAIRS_STEPS: i32 = 4;`

- [`PLAYER_STAIRS_LIFT_SHARE`](physics.rs) — Parte del tiempo de un peldaño que el jugador pasa subiéndose a él; el resto se queda de pie encima.
  - Declaración: `pub const PLAYER_STAIRS_LIFT_SHARE: f64 = 0.6;`

- [`PLAYER_STAIRS_HOP`](physics.rs) — Bloques que el cuerpo del jugador se despega del peldaño al dar el saltito hacia el siguiente.
  - Declaración: `pub const PLAYER_STAIRS_HOP: f64 = 0.08;`

- [`PLAYER_FLY_SPEED`](physics.rs#L65) — Bloques por tick que suben como máximo los pies de un jugador volando.
  - Declaración: `pub const PLAYER_FLY_SPEED: f64 = 0.15;`

- [`PLAYER_FLY_THRUST`](physics.rs#L67) — Bloques por tick que el jetpack acelera los pies de un jugador volando en cada tick.
  - Declaración: `pub const PLAYER_FLY_THRUST: f64 = 0.04;`

- [`PLAYER_FLY_MAX_HEIGHT`](physics.rs#L69) — Altura máxima que alcanzan los pies de un jugador volando sobre el último suelo en el que estuvo.
  - Declaración: `pub const PLAYER_FLY_MAX_HEIGHT: f64 = 10.0;`

- [`PLAYER_LANDING_TICKS`](physics.rs#L71) — Ticks durante los que el jugador muestra su pose de aterrizaje tras aterrizar.
  - Declaración: `pub const PLAYER_LANDING_TICKS: i32 = 3;`

- [`PLAYER_TAKEOFF_TICKS`](physics.rs#L73) — Ticks tras un despegue durante los que muestra su pose de despegue.
  - Declaración: `pub const PLAYER_TAKEOFF_TICKS: i32 = 2;`

- [`PLAYER_APEX_SPEED`](physics.rs#L75) — Velocidad vertical por debajo de la cual un salto está en su punto más alto.
  - Declaración: `pub const PLAYER_APEX_SPEED: f64 = PLAYER_GRAVITY;`

- [`PLAYER_PART_ID`](physics.rs#L77) — Clave de la parte del jugador.
  - Declaración: `pub const PLAYER_PART_ID: &str = "player";`

- [`PLAYER_FACINGS`](physics.rs#L79) — Las orientaciones en las que se dibuja al jugador: los dieciséis puntos cardinales, en sentido antihorario sobre
  - Declaración: `pub const PLAYER_FACINGS: [&str; 16] = [ "east", "east-north-east", "north-east", "north-north-east", "north", "north-north-west", "north-west", "west-north-west", "west", "west-south-west", "south-west", "south-south-west", "south", "south-south-east", "south-east", "east-south-east", ];`

- [`PLAYER_SPAWN_RADIUS`](physics.rs#L98) — Columnas alrededor del centro en las que se busca el spawn de un jugador nuevo.
  - Declaración: `pub const PLAYER_SPAWN_RADIUS: i32 = 32;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `dust.rs`

#### Funciones internas

- [`remaining`](dust.rs#L16) — Cuánto de un efecto que dura `duration` queda `ms` después de que empezó: `1` → `0`, `0` después.
  - Firma: `fn remaining(ms: f64, duration: f64) -> f64 {`

- [`between`](dust.rs#L168) — `share` del camino del extremo bajo al alto de un rango.
  - Firma: `fn between(range: (f64, f64), share: f64) -> f64 {`

### `motion.rs`

#### Funciones internas

- [`next_state`](motion.rs#L74) — Busca el siguiente estado para `event` en `transitions`, o `None` cuando el evento no está manejado.
  - Firma: `fn next_state( transitions: &[(PlayerMotionEvent, PlayerMotionType)], event: PlayerMotionEvent, ) -> Option<PlayerMotionType> {`

#### Constantes internas

- [`GROUND`](motion.rs#L38) — Transiciones desde cada estado de suelo: en reposo, caminando, corriendo y derrapando.
  - Declaración: `const GROUND: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Walk, PlayerMotionType::Walking), (PlayerMotionEvent::Run, PlayerMotionType::Running), (PlayerMotionEvent::Skid, PlayerMotionType::Skidding), (PlayerMotionEvent::Stop, PlayerMotionType::Idle), (PlayerMotionEvent::Jump, PlayerMotionType::Jumping), (PlayerMotionEvent::Fall, PlayerMotionType::Falling), (PlayerMotionEvent::Climb, PlayerMotionType::Climbing), ];`

- [`AIR`](motion.rs#L49) — Transiciones desde el aire: saltando, cayendo o volando.
  - Declaración: `const AIR: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Fall, PlayerMotionType::Falling), (PlayerMotionEvent::Fly, PlayerMotionType::Flying), (PlayerMotionEvent::LandIdle, PlayerMotionType::Idle), (PlayerMotionEvent::LandWalking, PlayerMotionType::Walking), (PlayerMotionEvent::LandRunning, PlayerMotionType::Running), (PlayerMotionEvent::LandSkidding, PlayerMotionType::Skidding), (PlayerMotionEvent::Climb, PlayerMotionType::Climbing), ];`

- [`AIR_JUMP`](motion.rs#L60) — Una pulsación de salto en pleno aire mantiene al jugador saltando o volando.
  - Declaración: `const AIR_JUMP: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Jump, PlayerMotionType::Jumping), ];`

- [`CLIMBING`](motion.rs#L64) — Transiciones desde la escalada.
  - Declaración: `const CLIMBING: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::ClimbTick, PlayerMotionType::Climbing), (PlayerMotionEvent::ClimbDoneIdle, PlayerMotionType::Idle), (PlayerMotionEvent::ClimbDoneWalking, PlayerMotionType::Walking), ];`

### `physics.rs`

#### Funciones internas

- [`harmonic`](physics.rs#L109) — Calcula o recupera «harmonic» según los parámetros de la firma.
  - Firma: `fn harmonic(t: f64) -> f64 {`

- [`column_at`](physics.rs#L237) — Calcula o recupera «column at» según los parámetros de la firma.
  - Firma: `fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn>;`

- [`occupancy_at`](physics.rs#L238) — Calcula o recupera «occupancy at» según los parámetros de la firma.
  - Firma: `fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle>;`

- [`chunk_has`](physics.rs#L239) — Calcula o recupera «chunk has» según los parámetros de la firma.
  - Firma: `fn chunk_has(&self, _coord: ChunkCoord) -> bool {`

- [`load_around`](physics.rs#L242) — Calcula o recupera «load around» según los parámetros de la firma.
  - Firma: `fn load_around(&mut self, _point: GridPoint) {} } /// Column the ground point `point` belongs to. pub fn get_player_column(point: GridPoint) -> WorldCoord {`

- [`is_steppable`](physics.rs#L276) — Evalúa si se cumple la condición «steppable» para el estado recibido.
  - Firma: `fn is_steppable<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`clears_standing_body`](physics.rs#L287) — Calcula o recupera «clears standing body» según los parámetros de la firma.
  - Firma: `fn clears_standing_body(occ: &PlayerObstacle, column: &TerrainColumn) -> bool {`

- [`support_at`](physics.rs#L293) — Calcula o recupera «support at» según los parámetros de la firma.
  - Firma: `fn support_at<G: PlayerGround>(ground: &G, point: GridPoint) -> Option<TerrainColumn> {`

- [`fits_in_air`](physics.rs#L312) — Calcula o recupera «fits in air» según los parámetros de la firma.
  - Firma: `fn fits_in_air<G: PlayerGround>(ground: &G, point: GridPoint, feet: f64) -> bool {`

- [`can_leave_edge`](physics.rs#L316) — Calcula o recupera «can leave edge» según los parámetros de la firma.
  - Firma: `fn can_leave_edge<G: PlayerGround>(ground: &G, point: GridPoint, feet: f64) -> bool {`

- [`block_reason_at`](physics.rs#L336) — Calcula o recupera «block reason at» según los parámetros de la firma.
  - Firma: `fn block_reason_at<G: PlayerGround>( ground: &G, point: GridPoint, elevation: f64, feet: f64, airborne: bool, ) -> Option<PlayerBlockReason> {`

- [`fits_at`](physics.rs#L394) — Calcula o recupera «fits at» según los parámetros de la firma.
  - Firma: `fn fits_at<G: PlayerGround>(ground: &G, point: GridPoint, from_elevation: f64) -> bool {`

- [`elevation_at`](physics.rs#L398) — Calcula o recupera «elevation at» según los parámetros de la firma.
  - Firma: `fn elevation_at<G: PlayerGround>(ground: &G, point: GridPoint) -> f64 {`

- [`approach_velocity`](physics.rs#L590) — Calcula o recupera «approach velocity» según los parámetros de la firma.
  - Firma: `fn approach_velocity(current: GridPoint, desired: GridPoint, rate: f64) -> GridPoint {`

- [`is_faster_than_walk`](physics.rs#L603) — Evalúa si se cumple la condición «faster than walk» para el estado recibido.
  - Firma: `fn is_faster_than_walk(player: &PlayerState) -> bool {`

- [`is_sliding`](physics.rs#L608) — Evalúa si se cumple la condición «sliding» para el estado recibido.
  - Firma: `fn is_sliding(player: &PlayerState) -> bool {`

- [`get_gait`](physics.rs#L617) — Obtiene «gait» sin modificar el estado consultado.
  - Firma: `fn get_gait(player: &PlayerState, moved: bool) -> &'static str {`

- [`get_motion_event`](physics.rs#L630) — Obtiene «motion event» sin modificar el estado consultado.
  - Firma: `fn get_motion_event(player: &PlayerState, flying: bool) -> PlayerMotionEvent {`

- [`update_motion`](physics.rs#L679) — Calcula o recupera «update motion» según los parámetros de la firma.
  - Firma: `fn update_motion(player: &mut PlayerState, flying: bool) {`

- [`take_off`](physics.rs#L685) — Calcula o recupera «take off» según los parámetros de la firma.
  - Firma: `fn take_off(player: &mut PlayerState, air: bool) {`

- [`reject_jump`](physics.rs#L700) — Calcula o recupera «reject jump» según los parámetros de la firma.
  - Firma: `fn reject_jump(player: &mut PlayerState, reason: PlayerBlockReason) {`

- [`land`](physics.rs#L705) — Calcula o recupera «land» según los parámetros de la firma.
  - Firma: `fn land(player: &mut PlayerState) {`

- [`accelerate_player`](physics.rs#L712) — Calcula o recupera «accelerate player» según los parámetros de la firma.
  - Firma: `fn accelerate_player(player: &mut PlayerState) {`

- [`step_once`](physics.rs#L745) — Calcula o recupera «step once» según los parámetros de la firma.
  - Firma: `fn step_once<G: PlayerGround>( player: &mut PlayerState, ground: &G, diagnose: bool, ) -> Option<PlayerBlockReason> {`

- [`step_air`](physics.rs#L904) — Calcula o recupera «step air» según los parámetros de la firma.
  - Firma: `fn step_air<G: PlayerGround>( player: &mut PlayerState, ground: &G, flying: bool, ) -> Option<&'static str> {`

- [`ceiling_at`](physics.rs#L997) — Calcula o recupera «ceiling at» según los parámetros de la firma.
  - Firma: `fn ceiling_at<G: PlayerGround>( ground: &G, point: GridPoint, head: f64, next_head: f64, ) -> Option<f64> {`

- [`is_flying`](physics.rs#L1034) — Evalúa si se cumple la condición «flying» para el estado recibido.
  - Firma: `fn is_flying(player: &PlayerState) -> bool {`

#### Constantes internas

- [`LANDING`](physics.rs#L100) — Define el parámetro interno «LANDING» empleado por este módulo.
  - Declaración: `const LANDING: f64 = 1e-9;`
