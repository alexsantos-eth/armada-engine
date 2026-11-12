# Player

Este dominio contiene el estado del jugador, movimiento, física y efectos de juego compartidos por los clientes. Mantiene las reglas que transforman entradas de simulación en cambios de posición y estado.

La física debe ser independiente de la frecuencia de renderizado y trabajar con datos del mundo, no con objetos del backend. Los efectos de dominio expresan eventos o estado jugable, no partículas ni sonidos concretos.

No dibuja al jugador, no reproduce audio y no lee dispositivos directamente. Esas adaptaciones se implementan fuera del crate de dominio.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `dust.rs`

#### Funciones y métodos

- [`get_dust`](dust.rs#L198) — Un soplo de polvo `ms` milisegundos reales después de que se alzó: cuánto ha recorrido su vida de `duration`
  - Firma: `pub fn get_dust(ms: f64, duration: f64, alpha: f64) -> Option<DustLook> {`

- [`mix_color`](dust.rs#L223) — El color a `share` (`0` → `1`) del camino de `from` a `to`, canal a canal, redondeado
  - Firma: `pub fn mix_color(colors: (u32, u32), share: f64) -> u32 {`

- [`new`](dust.rs#L243) — El flujo de `seed`, que es el número de soplos alzados hasta ahora.
  - Firma: `pub fn new(seed: u64) -> Self {`

- [`roll`](dust.rs#L250) — El siguiente número del flujo, en `[0, 1)`. SplitMix64, como las funciones hash de `terrain::noise`.
  - Firma: `pub fn roll(&mut self) -> f64 {`

- [`get_dust_voxels`](dust.rs#L261) — Los voxeles de un soplo de polvo de `shape`, dispersados por el flujo de `seed`: repartidos alrededor de la
  - Firma: `pub fn get_dust_voxels( shape: DustShape, seed: u64, kick: GridPoint, origin: GridPoint, ) -> Vec<DustVoxel> {`

- [`get_dust_voxel_at`](dust.rs#L306) — Donde `voxel` está a `progress` del camino a lo largo de la vida de su soplo (`0` → `1`): en columnas desde
  - Firma: `pub fn get_dust_voxel_at(voxel: DustVoxel, progress: f64) -> DustVoxelState {`

- [`get_dust_column`](dust.rs#L327) — La columna con la que se dibuja un voxel de polvo en `point` (en el suelo, en columnas), para pies en
  - Firma: `pub fn get_dust_column( point: GridPoint, feet: GridPoint, level: f64, top_at: impl Fn(i32, i32) -> Option<f64>, ) -> DustColumn {`

- [`voxel_faces`](dust.rs#L364) — Un voxel pequeño apoyado en el suelo, `size` casillas de ancho, con su base centrada en un punto: sus
  - Firma: `pub fn voxel_faces(size: f64, tile_width: f64, tile_height: f64, box_height: f64) -> VoxelFaces {`

- [`jet_nozzle`](dust.rs#L163) — Dónde están las toberas del jetpack, en columnas desde los pies, a la espalda de una figura dibujada en `facing` de `facings` direcciones de pantalla.
  - Firma: `pub fn jet_nozzle(facing: usize, facings: usize) -> GridPoint {`

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

- [`RIPPLE_DUST`](dust.rs) — El anillo que deja un cuerpo donde rompió la superficie, y el que abre quien flota quieto: agua plana que se abre y se apaga sin subir nunca.
- [`SPLASH_DUST`](dust.rs) / [`splash_of`](dust.rs) — La corona de agua de un chapuzón, escalada por la velocidad con la que el cuerpo entró.
- [`WAKE_DUST`](dust.rs) — Una cresta de la V que arrastra quien nada: corre hacia fuera y hacia atrás por su brazo, se queda en la superficie y se apaga despacio.

- [`JET_FIRE`](dust.rs#L123) / [`JET_FIRE_COLORS`](dust.rs#L119) — La llama que un jetpack escupe por sus toberas mientras se vuela: voxeles pequeños, amarillos a naranjas, que salen hacia abajo y se apagan en 200 ms.
  - Declaración: `pub const JET_FIRE: DustShape = DustShape {`

- [`JET_SMOKE`](dust.rs#L141) / [`JET_SMOKE_COLORS`](dust.rs#L137) — El humo que deja detrás: voxeles grandes, grises a casi negros, que se abren y suben despacio durante casi un segundo.
  - Declaración: `pub const JET_SMOKE: DustShape = DustShape {`

- [`JET_NOZZLE_BACK`](dust.rs#L155) — Columnas por detrás de los pies a las que están las toberas del jetpack, a la espalda de la figura.
  - Declaración: `pub const JET_NOZZLE_BACK: f64 = 0.12;`

- [`JET_NOZZLE_LIFT`](dust.rs#L158) — Bloques por encima de los pies a los que están esas toberas.
  - Declaración: `pub const JET_NOZZLE_LIFT: f64 = 0.1;`
- [`WATER_COLORS`](dust.rs) — Tonos del agua que levanta quien nada: de espuma blanca a un azul pálido.

- [`KICK_DUST`](dust.rs#L53) — El soplo pequeño que un jugador corriendo o derrapando levanta detrás de sus pies.
  - Declaración: `pub const KICK_DUST: DustShape = DustShape {`

### `motion.rs`

#### Funciones y métodos

- [`transition_player_motion`](motion.rs#L116) — Aplica un evento a `state` y devuelve el estado de movimiento resultante.
  - Firma: `pub fn transition_player_motion( state: PlayerMotionType, event: PlayerMotionEvent, ) -> PlayerMotionType {`

### `swim.rs`

#### Funciones y métodos

- [`entering`](swim.rs) — Un nado recién empezado en agua con el techo en `level`, entrado a `sink` bloques por tick (`0` al deslizarse desde la orilla) con el cuerpo ya `depth` bloques por debajo.
  - Firma: `pub fn entering(level: f64, depth: f64, sink: f64) -> Self {`

- [`is_swimmable`](swim.rs) — Si una columna de ese material es agua en la que se nada. Toda columna de agua lo es: el agua no tiene fondo donde vadear, así que no hay zona baja.
  - Firma: `pub fn is_swimmable(surface: crate::terrain::TerrainMaterial) -> bool {`

- [`next_float`](swim.rs) — Un tick del agua sosteniendo el cuerpo: el resorte de flotación hacia [`PLAYER_FLOAT_DEPTH`] más el arrastre del agua, limitado a la superficie y a [`PLAYER_PLUNGE_MAX`]. Devuelve la nueva velocidad de hundimiento y la nueva profundidad.
  - Firma: `pub fn next_float(sink: f64, depth: f64) -> (f64, f64) {`

- [`is_under`](swim.rs) — Si un cuerpo a `depth` bloques bajo el techo del agua cuenta como sumergido.
  - Firma: `pub fn is_under(depth: f64) -> bool {`

- [`swim_step`](swim.rs) — Columnas por tick que recorre quien nada: su velocidad de crucero, la rápida con la tecla de correr, y recortada a [`PLAYER_UNDER_SPEED`] mientras sigue bajo la superficie.
  - Firma: `pub fn swim_step(fast: bool, depth: f64) -> f64 {`

- [`splashes`](swim.rs) — Si entrar al agua a `sink` bloques por tick levanta salpicón.
  - Firma: `pub fn splashes(sink: f64) -> bool {`

- [`float_bob`](swim.rs) — Cuánto sube o baja el oleaje a un cuerpo que flota en el tick `ticks` de su nado, en bloques sumados a su profundidad: nada mientras sigue hundiéndose o subiendo, todo el vaivén flotando quieto y [`PLAYER_BOB_SWIMMING`] de él mientras nada.
  - Firma: `pub fn float_bob(ticks: i32, settled: f64, moving: bool) -> f64 {`

- [`float_settle`](swim.rs) — Cuán asentado en la superficie está un cuerpo a `depth` bloques del techo del agua: `1` justo en su profundidad de flote y `0` a un chapuzón de ella.
  - Firma: `pub fn float_settle(depth: f64) -> f64 {`

#### Constantes

- [`PLAYER_SWIM_SPEED`](swim.rs) / [`PLAYER_SWIM_STEP`](swim.rs) — Velocidad al nadar, en columnas por segundo de simulación y por tick: más lenta que caminar.
- [`PLAYER_SWIM_FAST_SPEED`](swim.rs) / [`PLAYER_SWIM_FAST_STEP`](swim.rs) — Lo mismo con la tecla de correr: un crol más rápido, aún por debajo de correr en tierra.
- [`PLAYER_SWIM_ACCEL`](swim.rs) / [`PLAYER_SWIM_BRAKE`](swim.rs) — Cambio de velocidad por tick al arrancar o soltar dentro del agua: cuesta más arrancar y se desliza al soltar.
- [`PLAYER_FLOAT_DEPTH`](swim.rs) — Bloques que el cuerpo flota por debajo del techo del agua en reposo.
- [`PLAYER_BUOYANCY`](swim.rs) / [`PLAYER_WATER_DRAG`](swim.rs) — El resorte amortiguado del flote: cuánto empuja el agua por bloque de desvío y qué parte de la velocidad vertical se come cada tick.
- [`PLAYER_PLUNGE_MAX`](swim.rs) — Lo más hondo que llega el cuerpo bajo el techo del agua, por rápido que caiga.
- [`PLAYER_UNDER_DEPTH`](swim.rs) / [`PLAYER_UNDER_SPEED`](swim.rs) — Cuánto hay que bajar de [`PLAYER_FLOAT_DEPTH`] para contar como sumergido, y qué parte de su velocidad conserva entonces.
- [`PLAYER_SURFACE_DEPTH`](swim.rs) — Bloques que el cuerpo puede subir sobre el techo del agua: ninguno.
- [`PLAYER_SWIM_EXIT_CLIMB`](swim.rs) — Bloques de altura sobre el agua a los que el jugador se iza para salir, mayor que [`PLAYER_MAX_CLIMB`].
- [`PLAYER_BOB_TICKS`](swim.rs) / [`PLAYER_BOB_DEPTH`](swim.rs) / [`PLAYER_BOB_SWIMMING`](swim.rs) — El oleaje que mece a quien flota: cuánto tarda una subida y bajada, cuántos bloques sube y baja, y qué parte de eso siente quien va nadando.
- [`PLAYER_SPLASH_MIN_SPEED`](swim.rs) — Velocidad de caída por debajo de la cual entrar al agua no levanta salpicón.

#### Tipos

- [`PlayerSwim`](swim.rs) — El nado en curso: el techo del agua, la profundidad del cuerpo, su velocidad vertical y los ticks que lleva nadando (de los que sale el oleaje).

### `physics.rs`

#### Funciones y métodos

- [`get_jump_height`](physics.rs#L124) — Altura de los pies sobre suelo llano `tick` ticks después de un salto.
  - Firma: `pub fn get_jump_height(tick: f64) -> f64 {`

- [`get_climb_rise`](physics.rs#L136) — Fracción de su ascenso que los pies de una escalada han subido en `progress` (0–1).
  - Firma: `pub fn get_climb_rise(progress: f64) -> f64 {`

- [`get_climb_advance`](physics.rs#L141) — Fracción del camino de `from` a `to` que una escalada ha recorrido en `progress` (0–1).
  - Firma: `pub fn get_climb_advance(progress: f64) -> f64 {`

- [`get_climb_shares`](physics.rs) — Fracción de su subida y fracción de su avance que una escalada ha recorrido en `progress` (0–1). Sobre un reborde el jugador se iza primero y pasa después; una grada avanza a ritmo constante y sube de peldaño en peldaño (`get_stairs_rise`), que es lo que parece tomar los escalones.
  - Firma: `pub fn get_climb_shares(stairs: bool, progress: f64) -> (f64, f64) {`

- [`get_stairs_rise`](physics.rs) — Fracción de su subida que una grada ha recorrido en `progress` (0–1): de peldaño en peldaño, subiendo el pie a cada escalón y descansando en él, en vez de deslizarse por una rampa. Las subidas negativas, las bajadas, toman sus peldaños igual.
  - Firma: `pub fn get_stairs_rise(progress: f64) -> f64 {`

- [`get_stairs_hop`](physics.rs) — Bloques que el cuerpo del jugador está por encima del peldaño que tiene bajo los pies en `progress` (0–1) de una grada: un saltito hacia cada escalón, nada al aterrizar en uno.
  - Firma: `pub fn get_stairs_hop(progress: f64) -> f64 {`

- [`get_stairs_align`](physics.rs) — Fracción de la corrección lateral hacia la línea central de la grada que el tramo ha andado en `progress` (0–1): el primer tramo de la grada, con la misma easing que un peldaño. A partir de ahí, el resto del vuelo va por el centro.
  - Firma: `pub fn get_stairs_align(progress: f64) -> f64 {`

- [`flight_shove`](physics.rs#L426) — El empujón que el juego aplica a un jugador quieto sobre una grada flotando por encima de los peldaños: una velocidad en el eje de bajada, a la distancia de un paso por tick, o `None` si camina, está en el aire, hay tramo en curso, o pisa la última huella a ras de la cima. Lo desliza fuera del tramo y el motor resuelve el salto al pie como una caída.
  - Firma: `fn flight_shove<G: PlayerGround>(player: &PlayerState, ground: &G) -> Option<GridPoint> {`

- [`blocked_side`](physics.rs#L205) — Lado del cuadrado que bloquea la columna: `0.0` si es pisable, su `collision_at` en caso contrario (`1.0` si no declara).
  - Firma: `pub fn blocked_side(&self, _x: f64, _y: f64) -> f64 {`

- [`get_player_column`](physics.rs#L315) — Columna a la que pertenece el punto de suelo `point`.
  - Firma: `pub fn get_player_column(point: GridPoint) -> WorldCoord {`

- [`can_stand_on`](physics.rs#L323) — Si el jugador puede mantenerse en pie en el centro de la columna `(x, y)` viniendo de `from_elevation`.
  - Firma: `pub fn can_stand_on<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`find_player_spawn`](physics.rs#L676) — Busca la posición erguida inicial alrededor de `centre`, explorando en espiral hasta `PLAYER_SPAWN_RADIUS`.
  - Firma: `pub fn find_player_spawn<G: PlayerGround>(ground: &G, centre: GridPoint) -> PlayerPosition {`

- [`create_player`](physics.rs#L756) — Crea el `PlayerState` erguido en `at` con los valores por defecto.
  - Firma: `pub fn create_player<G: PlayerGround>(ground: &G, at: GridPoint) -> PlayerState {`

- [`get_walk_direction`](physics.rs#L789) — Dirección normalizada de movimiento a partir de la entrada: `x = across + up`, `y = up − across`; `0` en ambos ejes si no hay entrada.
  - Firma: `pub fn get_walk_direction(directions: &ScreenDirections) -> GridPoint {`

- [`get_player_facing`](physics.rs#L813) — Orientación (0..`PLAYER_FACINGS`−1) derivada de `walk`; `None` si está quieto.
  - Firma: `pub fn get_player_facing(walk: GridPoint) -> Option<usize> {`

- [`set_player_walk`](physics.rs#L824) — Fija `player.walk` con la dirección resultante de `directions`.
  - Firma: `pub fn set_player_walk(player: &mut PlayerState, directions: ScreenDirections) {`

- [`set_player_jetpack`](physics.rs#L828) — Activa o desactiva el jetpack.
  - Firma: `pub fn set_player_jetpack(player: &mut PlayerState, jetpack: bool) {`

- [`set_player_run`](physics.rs#L832) — Activa o desactiva la carrera.
  - Firma: `pub fn set_player_run(player: &mut PlayerState, running: bool) {`

- [`is_player_running`](physics.rs#L836) — Si el jugador está corriendo (superó el umbral de marcha con la carrera activa).
  - Firma: `pub fn is_player_running(player: &PlayerState) -> bool {`

- [`is_player_skidding`](physics.rs#L840) — Si se desliza con velocidad residual y entrada de caminar cero (`walk` ≈ 0, `velocity` ≠ 0).
  - Firma: `pub fn is_player_skidding(player: &PlayerState) -> bool {`

- [`jump_player`](physics.rs#L844) — Arranca el salto si puede (buffer/coyote u obstáculo válido); si no, lo rechaza con el motivo.
  - Firma: `pub fn jump_player(player: &mut PlayerState) {`

- [`set_player_jump_held`](physics.rs#L850) — Fija la tecla de salto mantenida (salto variable).
  - Firma: `pub fn set_player_jump_held(player: &mut PlayerState, held: bool) {`

- [`cancel_player_jump`](physics.rs#L854) — Corta el ascenso del salto en curso (la tecla se soltó).
  - Firma: `pub fn cancel_player_jump(player: &mut PlayerState) {`

- [`step_player`](physics.rs#L1504) — Avanza la simulación del jugador `ticks` pasos fijos sobre `ground`.
  - Firma: `pub fn step_player<G: PlayerGround>(player: &mut PlayerState, ground: &mut G, ticks: u32) {`

- [`get_player_jump_phase`](physics.rs#L1714) — Fase del salto para la animación; en el suelo (o nadando) responde `Ground`.
  - Firma: `pub fn get_player_jump_phase(player: &PlayerState) -> PlayerJumpPhase {`

- [`get_player_climb_progress`](physics.rs#L1751) — Cuánto lleva recorrido el jugador de una escalada sobre un reborde, para las poses de trepar. Una grada se sube andando, así que no informa nada y la vista sigue caminando.
  - Firma: `pub fn get_player_climb_progress(player: &PlayerState, alpha: f64) -> Option<f64> {`

- [`get_player_render_position`](physics.rs#L1762) — Posición de render del jugador: interpolación cúbica Hermite entre la posición al inicio del tick (`previous`, con sus velocidades) y la posición actual, con tangentes iguales a la velocidad horizontal y vertical de cada límite de tick; es C1 en cada límite y reproduce exactamente arcos de aceleración constante (un salto).
  - Firma: `pub fn get_player_render_position(player: &PlayerState, alpha: f64) -> PlayerRenderPosition {`

- [`get_player_cells`](physics.rs#L1797) — Rectángulo de casillas que ocupa el cuerpo centrado en `point`.
  - Firma: `pub fn get_player_cells(point: GridPoint) -> crate::grid::WorldRect {`

- [`can_stand_on_public`](physics.rs#L1814) — Wrapper público de `can_stand_on`: si se puede pisar el suelo de `(x, y)` desde `from_elevation`.
  - Firma: `pub fn can_stand_on_public<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`fits_player_at`](physics.rs#L1823) — Si el cuerpo cabe parado en `point` (sin colisión ni obstáculos).
  - Firma: `pub fn fits_player_at<G: PlayerGround>(ground: &G, point: GridPoint) -> bool {`

#### Constantes

- [`PLAYER_SPEED`](physics.rs#L14) — Velocidad de caminata del jugador, en columnas por segundo de simulación.
  - Declaración: `pub const PLAYER_SPEED: f64 = 3.0;`

- [`PLAYER_STEP`](physics.rs#L16) — Columnas horizontales máximas que un jugador caminando avanza en un tick.
  - Declaración: `pub const PLAYER_STEP: f64 = PLAYER_SPEED / TICKS_PER_SECOND as f64;`

- [`PLAYER_RUN_SPEED`](physics.rs#L18) — Velocidad de carrera del jugador, en columnas por segundo de simulación.
  - Declaración: `pub const PLAYER_RUN_SPEED: f64 = 5.0;`

- [`PLAYER_RUN_STEP`](physics.rs#L20) — Columnas horizontales máximas que un jugador corriendo avanza en un tick.
  - Declaración: `pub const PLAYER_RUN_STEP: f64 = PLAYER_RUN_SPEED / TICKS_PER_SECOND as f64;`

- [`PLAYER_GROUND_ACCEL`](physics.rs#L22) — Cambio de velocidad horizontal por tick al arrancar o redirigir en tierra.
  - Declaración: `pub const PLAYER_GROUND_ACCEL: f64 = 0.05;`

- [`PLAYER_GROUND_BRAKE`](physics.rs#L24) — Velocidad horizontal retirada por tick al soltar el movimiento en tierra.
  - Declaración: `pub const PLAYER_GROUND_BRAKE: f64 = 0.03;`

- [`PLAYER_AIR_ACCEL`](physics.rs#L26) — Cambio de velocidad horizontal por tick al virar en el aire.
  - Declaración: `pub const PLAYER_AIR_ACCEL: f64 = 0.04;`

- [`PLAYER_AIR_BRAKE`](physics.rs#L28) — Velocidad horizontal retirada por tick al soltar el movimiento en el aire.
  - Declaración: `pub const PLAYER_AIR_BRAKE: f64 = 0.025;`

- [`PLAYER_CORNER_NUDGE`](physics.rs#L30) — Desplazamiento lateral máximo usado para salvar una esquina pequeña.
  - Declaración: `pub const PLAYER_CORNER_NUDGE: f64 = 0.04;`

- [`PLAYER_RADIUS`](physics.rs#L32) — Mitad del lado del cuadrado que ocupan los pies del jugador en el suelo.
  - Declaración: `pub const PLAYER_RADIUS: f64 = 0.2;`

- [`PLAYER_BODY_HEIGHT`](physics.rs#L34) — Extensión vertical del cuerpo de colisión del jugador por encima de sus pies, en bloques.
  - Declaración: `pub const PLAYER_BODY_HEIGHT: f64 = 0.6;`

- [`PLAYER_RESCUE_DROP`](physics.rs#L36) — Distancia por debajo de la última superficie estable a la que se rescata una caída.
  - Declaración: `pub const PLAYER_RESCUE_DROP: f64 = 2.0;`

- [`PLAYER_MAX_CLIMB`](physics.rs#L38) — Máximo de bloques que el jugador escala hacia arriba o hacia abajo de una columna a la siguiente.
  - Declaración: `pub const PLAYER_MAX_CLIMB: f64 = 1.0;`

- [`PLAYER_JUMP_HEIGHT`](physics.rs#L40) — Bloques que suben los pies del jugador en el punto más alto de un salto.
  - Declaración: `pub const PLAYER_JUMP_HEIGHT: f64 = 0.85;`

- [`PLAYER_JUMP_TICKS`](physics.rs#L42) — Ticks que dura un salto en suelo llano, desde el despegue hasta el aterrizaje.
  - Declaración: `pub const PLAYER_JUMP_TICKS: i32 = 10;`

- [`PLAYER_JUMP_BUFFER_TICKS`](physics.rs#L44) — Ticks durante los que una pulsación de salto puede esperar al aterrizaje.
  - Declaración: `pub const PLAYER_JUMP_BUFFER_TICKS: i32 = 2;`

- [`PLAYER_COYOTE_TICKS`](physics.rs#L46) — Ticks durante los que el salto sigue siendo posible tras abandonar un borde.
  - Declaración: `pub const PLAYER_COYOTE_TICKS: i32 = 2;`

- [`PLAYER_AIR_JUMPS`](physics.rs#L48) — Saltos que el jugador puede dar en el aire antes de aterrizar.
  - Declaración: `pub const PLAYER_AIR_JUMPS: i32 = 1;`

- [`PLAYER_JUMP_SPEED`](physics.rs#L50) — Bloques por tick que suben los pies en el despegue.
  - Declaración: `pub const PLAYER_JUMP_SPEED: f64 = (4.0 * PLAYER_JUMP_HEIGHT) / PLAYER_JUMP_TICKS as f64;`

- [`PLAYER_JUMP_CUT_SPEED`](physics.rs#L52) — Velocidad ascendente que se conserva al soltar la tecla de salto.
  - Declaración: `pub const PLAYER_JUMP_CUT_SPEED: f64 = PLAYER_JUMP_SPEED * 0.6;`

- [`PLAYER_MAX_FALL_SPEED`](physics.rs#L54) — Velocidad descendente máxima en bloques por tick de simulación.
  - Declaración: `pub const PLAYER_MAX_FALL_SPEED: f64 = 0.6;`

- [`PLAYER_GRAVITY`](physics.rs#L56) — Bloques por tick que la velocidad ascendente de sus pies cae en cada tick en el aire.
  - Declaración: `pub const PLAYER_GRAVITY: f64 = (8.0 * PLAYER_JUMP_HEIGHT) / ((PLAYER_JUMP_TICKS as f64) * (PLAYER_JUMP_TICKS as f64));`

- [`PLAYER_STEP_HEIGHT`](physics.rs#L59) — Bloques que una superficie puede quedar por encima de los pies del jugador y aun así pisarse en un tick.
  - Declaración: `pub const PLAYER_STEP_HEIGHT: f64 = 0.25;`

- [`PLAYER_CLIMB_TICKS`](physics.rs#L61) — Ticks que dura una escalada de un bloque.
  - Declaración: `pub const PLAYER_CLIMB_TICKS: i32 = 12;`

- [`PLAYER_CLIMB_MS`](physics.rs#L63) — Milisegundos reales que dura una escalada de un bloque.
  - Declaración: `pub const PLAYER_CLIMB_MS: f64 = (PLAYER_CLIMB_TICKS as f64 * 1000.0) / TICKS_PER_SECOND as f64;`

- [`PLAYER_CLIMB_RISE_SHARE`](physics.rs#L65) — Fracción de una escalada que los pies emplean en subir hasta la cima.
  - Declaración: `pub const PLAYER_CLIMB_RISE_SHARE: f64 = 0.7;`

- [`PLAYER_CLIMB_REACH`](physics.rs#L67) — Columnas más allá de donde alcanza la superficie más alta que el jugador pisa durante una escalada.
  - Declaración: `pub const PLAYER_CLIMB_REACH: f64 = 0.25;`

- [`PLAYER_STAIRS_TICKS`](physics.rs) — Ticks que dura una grada de un bloque: se sube andando, no izándose.
  - Declaración: `pub const PLAYER_STAIRS_TICKS: i32 = 16;`

- [`PLAYER_STAIRS_REACH`](physics.rs) — Columnas del bloque de gradas que el jugador ha cruzado al llegar arriba, medidas desde el borde por el que entró: cruza casi el bloque entero. Si la entidad del bloque siguiente cierra el paso, el vuelo termina en el punto más avanzado cuyo cuerpo cabe sin solaparla (`farthest_clear_point`), no de vuelta al pie.
  - Declaración: `pub const PLAYER_STAIRS_REACH: f64 = 0.95;`

- [`PLAYER_STAIRS_DESCENT_SHARE`](physics.rs) — Parte de la cara superior de una grada que el jugador cruza desde su borde de arriba antes de empezar a bajar los escalones: el último tramo de cima llana en el que se queda de pie.
  - Declaración: `pub const PLAYER_STAIRS_DESCENT_SHARE: f64 = 0.2;`

- [`PLAYER_STAIRS_STEPS`](physics.rs) — Peldaños en los que se toma una grada, uno por escalón de la obra.
  - Declaración: `pub const PLAYER_STAIRS_STEPS: i32 = 4;`

- [`PLAYER_STAIRS_LIFT_SHARE`](physics.rs) — Parte del tiempo de un peldaño que el jugador pasa subiéndose a él; el resto se queda de pie encima.
  - Declaración: `pub const PLAYER_STAIRS_LIFT_SHARE: f64 = 0.6;`

- [`PLAYER_STAIRS_HOP`](physics.rs) — Bloques que el cuerpo del jugador se despega del peldaño al dar el saltito hacia el siguiente.
  - Declaración: `pub const PLAYER_STAIRS_HOP: f64 = 0.08;`

- [`PLAYER_STAIRS_ALIGN_SHARE`](physics.rs) — Parte del vuelo sobre la que se anda la corrección lateral hacia la línea central de la grada, desde el arranque; el resto del vuelo va por el centro.
  - Declaración: `pub const PLAYER_STAIRS_ALIGN_SHARE: f64 = 0.4;`

- [`PLAYER_FLY_SPEED`](physics.rs#L86) — Bloques por tick que suben como máximo los pies de un jugador volando.
  - Declaración: `pub const PLAYER_FLY_SPEED: f64 = 0.15;`

- [`PLAYER_FLY_THRUST`](physics.rs#L88) — Bloques por tick que el jetpack acelera los pies de un jugador volando en cada tick.
  - Declaración: `pub const PLAYER_FLY_THRUST: f64 = 0.04;`

- [`PLAYER_FLY_MAX_HEIGHT`](physics.rs#L90) — Altura máxima que alcanzan los pies de un jugador volando sobre el último suelo en el que estuvo.
  - Declaración: `pub const PLAYER_FLY_MAX_HEIGHT: f64 = 10.0;`

- [`PLAYER_LANDING_TICKS`](physics.rs#L92) — Ticks durante los que el jugador muestra su pose de aterrizaje tras aterrizar.
  - Declaración: `pub const PLAYER_LANDING_TICKS: i32 = 3;`

- [`PLAYER_TAKEOFF_TICKS`](physics.rs#L94) — Ticks tras un despegue durante los que muestra su pose de despegue.
  - Declaración: `pub const PLAYER_TAKEOFF_TICKS: i32 = 2;`

- [`PLAYER_APEX_SPEED`](physics.rs#L96) — Velocidad vertical por debajo de la cual un salto está en su punto más alto.
  - Declaración: `pub const PLAYER_APEX_SPEED: f64 = PLAYER_GRAVITY;`

- [`PLAYER_PART_ID`](physics.rs#L98) — Clave de la parte del jugador.
  - Declaración: `pub const PLAYER_PART_ID: &str = "player";`

- [`PLAYER_FACINGS`](physics.rs#L100) — Las orientaciones en las que se dibuja al jugador: los dieciséis puntos cardinales, en sentido antihorario sobre
  - Declaración: `pub const PLAYER_FACINGS: [&str; 16] = [ "east", "east-north-east", "north-east", "north-north-east", "north", "north-north-west", "north-west", "west-north-west", "west", "west-south-west", "south-west", "south-south-west", "south", "south-south-east", "south-east", "east-south-east", ];`

- [`PLAYER_SPAWN_RADIUS`](physics.rs#L119) — Columnas alrededor del centro en las que se busca el spawn de un jugador nuevo.
  - Declaración: `pub const PLAYER_SPAWN_RADIUS: i32 = 32;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `dust.rs`

#### Funciones internas

- [`remaining`](dust.rs#L16) — Cuánto de un efecto que dura `duration` queda `ms` después de que empezó: `1` → `0`, `0` después.
  - Firma: `fn remaining(ms: f64, duration: f64) -> f64 {`

- [`between`](dust.rs#L292) — `share` del camino del extremo bajo al alto de un rango.
  - Firma: `fn between(range: (f64, f64), share: f64) -> f64 {`

### `motion.rs`

#### Funciones internas

- [`next_state`](motion.rs#L106) — Busca el siguiente estado para `event` en `transitions`, o `None` cuando el evento no está manejado.
  - Firma: `fn next_state( transitions: &[(PlayerMotionEvent, PlayerMotionType)], event: PlayerMotionEvent, ) -> Option<PlayerMotionType> {`

#### Constantes internas

- [`GROUND`](motion.rs#L46) — Transiciones desde cada estado de suelo: en reposo, caminando, corriendo y derrapando.
  - Declaración: `const GROUND: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Walk, PlayerMotionType::Walking), (PlayerMotionEvent::Run, PlayerMotionType::Running), (PlayerMotionEvent::Skid, PlayerMotionType::Skidding), (PlayerMotionEvent::Stop, PlayerMotionType::Idle), (PlayerMotionEvent::Jump, PlayerMotionType::Jumping), (PlayerMotionEvent::Fall, PlayerMotionType::Falling), (PlayerMotionEvent::Climb, PlayerMotionType::Climbing), ];`

- [`AIR`](motion.rs#L59) — Transiciones desde el aire: saltando, cayendo o volando.
  - Declaración: `const AIR: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Fall, PlayerMotionType::Falling), (PlayerMotionEvent::Fly, PlayerMotionType::Flying), (PlayerMotionEvent::LandIdle, PlayerMotionType::Idle), (PlayerMotionEvent::LandWalking, PlayerMotionType::Walking), (PlayerMotionEvent::LandRunning, PlayerMotionType::Running), (PlayerMotionEvent::LandSkidding, PlayerMotionType::Skidding), (PlayerMotionEvent::Climb, PlayerMotionType::Climbing), ];`

- [`AIR_JUMP`](motion.rs#L72) — Una pulsación de salto en pleno aire mantiene al jugador saltando o volando.
  - Declaración: `const AIR_JUMP: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Jump, PlayerMotionType::Jumping), ];`

- [`CLIMBING`](motion.rs#L76) — Transiciones desde la escalada.
  - Declaración: `const CLIMBING: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::ClimbTick, PlayerMotionType::Climbing), (PlayerMotionEvent::ClimbDoneIdle, PlayerMotionType::Idle), (PlayerMotionEvent::ClimbDoneWalking, PlayerMotionType::Walking), ];`

### `physics.rs`

#### Funciones internas

- [`harmonic`](physics.rs#L130) — Easing `(1 − cos(π t)) / 2` en `[0, 1]` (corrección lateral del tramo de gradas).
  - Firma: `fn harmonic(t: f64) -> f64 {`

- [`column_at`](physics.rs#L306) — Columna del terreno en `(x, y)`; `None` si no está disponible (método del trait `PlayerGround`).
  - Firma: `fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn>;`

- [`occupancy_at`](physics.rs#L307) — Obstáculos que toca la columna `(x, y)`.
  - Firma: `fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle>;`

- [`chunk_has`](physics.rs#L308) — Si el chunk de `(x, y)` está cargado; por defecto `true` (trait `PlayerGround`).
  - Firma: `fn chunk_has(&self, _coord: ChunkCoord) -> bool {`

- [`load_around`](physics.rs#L311) — Hook para cargar/prefetech alrededor de `point`; vacío por defecto.
  - Firma: `fn load_around(&mut self, _point: GridPoint) {} } /// Column the ground point `point` belongs to. pub fn get_player_column(point: GridPoint) -> WorldCoord {`

- [`is_steppable`](physics.rs#L348) — Si la columna se puede pisar para entrar: cualquier agua entra siempre; si no, la altura de su techo.
  - Firma: `fn is_steppable<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`clears_standing_body`](physics.rs#L365) — Si `occ` (obstáculo) no llega al cuerpo parado sobre la columna.
  - Firma: `fn clears_standing_body(occ: &PlayerObstacle, column: &TerrainColumn) -> bool {`

- [`support_at`](physics.rs#L371) — La columna que soporta al punto `point` (techo a su altura o por debajo), o `None`.
  - Firma: `fn support_at<G: PlayerGround>(ground: &G, point: GridPoint) -> Option<TerrainColumn> {`

- [`fits_in_air`](physics.rs#L515) — Si el cuerpo cabe en el aire en `point` sin solapar obstáculos.
  - Firma: `fn fits_in_air<G: PlayerGround>(ground: &G, point: GridPoint, feet: f64) -> bool {`

- [`can_leave_edge`](physics.rs#L524) — Si se puede abandonar el borde de la columna `(x, y)` (cuenta como caída; el agua también es borde).
  - Firma: `fn can_leave_edge<G: PlayerGround>(ground: &G, point: GridPoint, feet: f64) -> bool {`

- [`block_reason_at`](physics.rs#L551) — El motivo por el que el cuerpo no puede estar en `point`, o `None` si está libre.
  - Firma: `fn block_reason_at<G: PlayerGround>( ground: &G, point: GridPoint, elevation: f64, feet: f64, airborne: bool, ) -> Option<PlayerBlockReason> {`

- [`farthest_clear_point`](physics.rs#L650) — El punto más avanzado del segmento `[near, far]` cuya casilla ocupa el cuerpo sin solapar nada. Lo usa el final de una grada cerrada por una entidad: el vuelo termina lo más lejos posible dentro del bloque, nunca de vuelta al pie.
  - Firma: `fn farthest_clear_point<G: PlayerGround>( ground: &G, near: GridPoint, far: GridPoint, elevation: f64, reach: f64, ) -> GridPoint {`

- [`fits_at`](physics.rs#L621) — Si el cuerpo cabe parado en `point`, usando `from_elevation` como referencia de altura.
  - Firma: `fn fits_at<G: PlayerGround>(ground: &G, point: GridPoint, from_elevation: f64) -> bool {`

- [`elevation_at`](physics.rs#L638) — Altura del suelo bajo `point` (el techo de su columna).
  - Firma: `fn elevation_at<G: PlayerGround>(ground: &G, point: GridPoint) -> f64 {`

- [`approach_velocity`](physics.rs#L861) — Acerca `current` a `desired` al ritmo `rate` (aceleración o frenado), eje a eje.
  - Firma: `fn approach_velocity(current: GridPoint, desired: GridPoint, rate: f64) -> GridPoint {`

- [`is_faster_than_walk`](physics.rs#L874) — Si la velocidad actual supera la de caminar.
  - Firma: `fn is_faster_than_walk(player: &PlayerState) -> bool {`

- [`is_sliding`](physics.rs#L879) — Si mantiene velocidad residual sin impulso de caminar (derrape).
  - Firma: `fn is_sliding(player: &PlayerState) -> bool {`

- [`get_gait`](physics.rs#L888) — La cadencia del ciclo de caminar según el estado: `IDLE`/`WALKING`/`RUNNING`/`SKIDDING`.
  - Firma: `fn get_gait(player: &PlayerState, moved: bool) -> &'static str {`

- [`get_motion_event`](physics.rs#L901) — El evento resultante del estado y las condiciones (salto, caída, agua, aterrizaje, …).
  - Firma: `fn get_motion_event(player: &PlayerState, flying: bool) -> PlayerMotionEvent {`

- [`update_motion`](physics.rs#L957) — Aplica la máquina de movimiento con el evento de este tick.
  - Firma: `fn update_motion(player: &mut PlayerState, flying: bool) {`

- [`take_off`](physics.rs#L963) — Consuma un salto o salto aéreo y arranca el ascenso (`PLAYER_JUMP_SPEED`).
  - Firma: `fn take_off(player: &mut PlayerState, air: bool) {`

- [`reject_jump`](physics.rs#L978) — Registra el rechazo del salto con su motivo (contador y `rejected`).
  - Firma: `fn reject_jump(player: &mut PlayerState, reason: PlayerBlockReason) {`

- [`land`](physics.rs#L983) — Aterriza: contadores, `PLAYER_LANDING_TICKS` y recarga los saltos aéreos.
  - Firma: `fn land(player: &mut PlayerState) {`

- [`accelerate_player`](physics.rs#L990) — Integra aceleración/frenado horizontal y la gravedad/vertical del tick.
  - Firma: `fn accelerate_player(player: &mut PlayerState) {`

- [`may_step_onto`](physics.rs#L464) — Si el jugador de a pie sacando sus pies a `feet` puede moverse de `from` a `to`. Una grada solo se entra por su eje: por el pie para subir y por el borde de bajada para bajar; desde cualquier otra casilla, a cualquier altura incluida la cima, es un muro que el cuerpo para como cualquier bloque (el solape no puede crecer en ningún eje).
  - Firma: `fn may_step_onto<G: PlayerGround>(ground: &G, from: GridPoint, to: GridPoint, feet: f64) -> bool {`

- [`step_once`](physics.rs#L1041) — Un tick completo de simulación sobre `ground`: intención, gravedad, colisiones, movimiento y estado.
  - Firma: `fn step_once<G: PlayerGround>( player: &mut PlayerState, ground: &G, diagnose: bool, ) -> Option<PlayerBlockReason> {`

- [`step_air`](physics.rs#L1318) — Un tick estando en el aire: vuelo, gravedad, choque con techo y aterrizaje.
  - Firma: `fn step_air<G: PlayerGround>( player: &mut PlayerState, ground: &G, flying: bool, ) -> Option<&'static str> {`

- [`ceiling_at`](physics.rs#L1421) — Altura del techo sobre `point` (choque de cabeza), o `None` si no hay.
  - Firma: `fn ceiling_at<G: PlayerGround>( ground: &G, point: GridPoint, head: f64, next_head: f64, ) -> Option<f64> {`

- [`is_flying`](physics.rs#L1493) — Si el jetpack está activo (vuelo).
  - Firma: `fn is_flying(player: &PlayerState) -> bool {`

#### Constantes internas

- [`LANDING`](physics.rs#L121) — Tolerancia `ε` para comparar alturas en `f64` al aterrizar.
  - Declaración: `const LANDING: f64 = 1e-9;`
