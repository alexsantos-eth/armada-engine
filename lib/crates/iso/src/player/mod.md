# Player

Este dominio contiene el estado del jugador, movimiento, física y efectos de juego compartidos por los clientes. Mantiene las reglas que transforman entradas de simulación en cambios de posición y estado.

La física debe ser independiente de la frecuencia de renderizado y trabajar con datos del mundo, no con objetos del backend. Los efectos de dominio expresan eventos o estado jugable, no partículas ni sonidos concretos.

No dibuja al jugador, no reproduce audio y no lee dispositivos directamente. Esas adaptaciones se implementan fuera del crate de dominio.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `dust.rs`

#### Funciones y métodos

- [`get_dust`](dust.rs#L74) — A puff of dust `ms` real milliseconds after it rose: how far through its life of `duration`
  - Firma: `pub fn get_dust(ms: f64, duration: f64, alpha: f64) -> Option<DustLook> {`

- [`mix_color`](dust.rs#L96) — The colour `share` (`0` → `1`) of the way from `from` to `to`, channel by channel, rounded
  - Firma: `pub fn mix_color(colors: (u32, u32), share: f64) -> u32 {`

- [`new`](dust.rs#L116) — The stream of `seed`, which is the count of puffs raised so far.
  - Firma: `pub fn new(seed: u64) -> Self {`

- [`roll`](dust.rs#L121) — The next number of the stream, in `[0, 1)`. SplitMix64, as `terrain::noise` hashes.
  - Firma: `pub fn roll(&mut self) -> f64 {`

- [`get_dust_voxels`](dust.rs#L132) — The voxels of a puff of dust of `shape`, scattered by the stream of `seed`: spread round the
  - Firma: `pub fn get_dust_voxels( shape: DustShape, seed: u64, kick: GridPoint, origin: GridPoint, ) -> Vec<DustVoxel> {`

- [`get_dust_voxel_at`](dust.rs#L177) — Where `voxel` is `progress` of the way through its puff's life (`0` → `1`): in columns from
  - Firma: `pub fn get_dust_voxel_at(voxel: DustVoxel, progress: f64) -> DustVoxelState {`

- [`get_dust_column`](dust.rs#L198) — The column a voxel of dust at `point` (on the ground, in columns) is drawn with, for feet at
  - Firma: `pub fn get_dust_column( point: GridPoint, feet: GridPoint, level: f64, top_at: impl Fn(i32, i32) -> Option<f64>, ) -> DustColumn {`

- [`voxel_faces`](dust.rs#L232) — A small voxel standing on the ground, `size` tiles wide, its bottom centred on a point: its
  - Firma: `pub fn voxel_faces(size: f64, tile_width: f64, tile_height: f64, box_height: f64) -> VoxelFaces {`

#### Constantes

- [`DUST_MS`](dust.rs#L7) — Real milliseconds a puff of dust lasts, at a take-off or a landing.
  - Declaración: `pub const DUST_MS: f64 = 360.0;`

- [`DUST_ALPHA`](dust.rs#L10) — Opacity of a puff of dust as it rises, fading to `0` over [`DUST_MS`].
  - Declaración: `pub const DUST_ALPHA: f64 = 0.85;`

- [`DUST_MIN_IMPACT`](dust.rs#L13) — Landings softer than this, in blocks per tick (a small step down), raise no dust.
  - Declaración: `pub const DUST_MIN_IMPACT: f64 = 0.1;`

- [`DUST_COLORS`](dust.rs#L36) — Shades of dust: white to a light grey.
  - Declaración: `pub const DUST_COLORS: (u32, u32) = (0xffffff, 0xdbdbdb);`

- [`BURST_DUST`](dust.rs#L39) — The puff of a take-off or a landing: a ring of voxels that bursts out from the feet.
  - Declaración: `pub const BURST_DUST: DustShape = DustShape {`

- [`KICK_DUST`](dust.rs#L53) — The small puff a running or skidding player kicks up behind its feet.
  - Declaración: `pub const KICK_DUST: DustShape = DustShape {`

### `motion.rs`

#### Funciones y métodos

- [`transition_player_motion`](motion.rs#L82) — Applies one event to `state` and returns the resulting motion state.
  - Firma: `pub fn transition_player_motion( state: PlayerMotionType, event: PlayerMotionEvent, ) -> PlayerMotionType {`

### `physics.rs`

#### Funciones y métodos

- [`get_jump_height`](physics.rs#L105) — Height of the feet above flat ground `tick` ticks into a jump.
  - Firma: `pub fn get_jump_height(tick: f64) -> f64 {`

- [`get_climb_rise`](physics.rs#L116) — Share of its rise a climb's feet have risen at `progress` (0–1).
  - Firma: `pub fn get_climb_rise(progress: f64) -> f64 {`

- [`get_climb_advance`](physics.rs#L121) — Share of the way from `from` to `to` a climb has gone at `progress` (0–1).
  - Firma: `pub fn get_climb_advance(progress: f64) -> f64 {`

- [`blocked_side`](physics.rs#L147) — Calcula o recupera «blocked side» según los parámetros de la firma.
  - Firma: `pub fn blocked_side(&self, _x: f64, _y: f64) -> f64 {`

- [`get_player_column`](physics.rs#L246) — Column the ground point `point` belongs to.
  - Firma: `pub fn get_player_column(point: GridPoint) -> WorldCoord {`

- [`can_stand_on`](physics.rs#L254) — Whether the player can stand on the centre of column `(x, y)` coming from `from_elevation`.
  - Firma: `pub fn can_stand_on<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`find_player_spawn`](physics.rs#L402) — Localiza «player spawn» que satisface las condiciones de la consulta.
  - Firma: `pub fn find_player_spawn<G: PlayerGround>(ground: &G, centre: GridPoint) -> PlayerPosition {`

- [`create_player`](physics.rs#L471) — Crea el recurso o estado «player» a partir de los parámetros recibidos.
  - Firma: `pub fn create_player<G: PlayerGround>(ground: &G, at: GridPoint) -> PlayerState {`

- [`get_walk_direction`](physics.rs#L503) — Obtiene «walk direction» sin modificar el estado consultado.
  - Firma: `pub fn get_walk_direction(directions: &ScreenDirections) -> GridPoint {`

- [`get_player_facing`](physics.rs#L524) — Obtiene «player facing» sin modificar el estado consultado.
  - Firma: `pub fn get_player_facing(walk: GridPoint) -> Option<usize> {`

- [`set_player_walk`](physics.rs#L535) — Actualiza «player walk» con el valor indicado.
  - Firma: `pub fn set_player_walk(player: &mut PlayerState, directions: ScreenDirections) {`

- [`set_player_jetpack`](physics.rs#L539) — Actualiza «player jetpack» con el valor indicado.
  - Firma: `pub fn set_player_jetpack(player: &mut PlayerState, jetpack: bool) {`

- [`set_player_run`](physics.rs#L543) — Actualiza «player run» con el valor indicado.
  - Firma: `pub fn set_player_run(player: &mut PlayerState, running: bool) {`

- [`is_player_running`](physics.rs#L547) — Evalúa si se cumple la condición «player running» para el estado recibido.
  - Firma: `pub fn is_player_running(player: &PlayerState) -> bool {`

- [`is_player_skidding`](physics.rs#L551) — Evalúa si se cumple la condición «player skidding» para el estado recibido.
  - Firma: `pub fn is_player_skidding(player: &PlayerState) -> bool {`

- [`jump_player`](physics.rs#L555) — Calcula o recupera «jump player» según los parámetros de la firma.
  - Firma: `pub fn jump_player(player: &mut PlayerState) {`

- [`set_player_jump_held`](physics.rs#L561) — Actualiza «player jump held» con el valor indicado.
  - Firma: `pub fn set_player_jump_held(player: &mut PlayerState, held: bool) {`

- [`cancel_player_jump`](physics.rs#L565) — Calcula o recupera «cancel player jump» según los parámetros de la firma.
  - Firma: `pub fn cancel_player_jump(player: &mut PlayerState) {`

- [`step_player`](physics.rs#L1003) — Calcula o recupera «step player» según los parámetros de la firma.
  - Firma: `pub fn step_player<G: PlayerGround>(player: &mut PlayerState, ground: &mut G, ticks: u32) {`

- [`get_player_jump_phase`](physics.rs#L1141) — Obtiene «player jump phase» sin modificar el estado consultado.
  - Firma: `pub fn get_player_jump_phase(player: &PlayerState) -> PlayerJumpPhase {`

- [`get_player_climb_progress`](physics.rs#L1173) — Obtiene «player climb progress» sin modificar el estado consultado.
  - Firma: `pub fn get_player_climb_progress(player: &PlayerState, alpha: f64) -> Option<f64> {`

- [`get_player_render_position`](physics.rs#L1185) — Obtiene «player render position» sin modificar el estado consultado.
  - Firma: `pub fn get_player_render_position(player: &PlayerState, alpha: f64) -> PlayerRenderPosition {`

- [`get_player_cells`](physics.rs#L1201) — Obtiene «player cells» sin modificar el estado consultado.
  - Firma: `pub fn get_player_cells(point: GridPoint) -> crate::grid::WorldRect {`

- [`can_stand_on_public`](physics.rs#L1219) — Calcula o recupera «can stand on public» según los parámetros de la firma.
  - Firma: `pub fn can_stand_on_public<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`fits_player_at`](physics.rs#L1223) — Calcula o recupera «fits player at» según los parámetros de la firma.
  - Firma: `pub fn fits_player_at<G: PlayerGround>(ground: &G, point: GridPoint) -> bool {`

#### Constantes

- [`PLAYER_SPEED`](physics.rs#L11) — Walking speed of the player, in columns per second of simulation.
  - Declaración: `pub const PLAYER_SPEED: f64 = 3.0;`

- [`PLAYER_STEP`](physics.rs#L13) — Maximum horizontal columns a walking player moves in one tick.
  - Declaración: `pub const PLAYER_STEP: f64 = PLAYER_SPEED / TICKS_PER_SECOND as f64;`

- [`PLAYER_RUN_SPEED`](physics.rs#L15) — Running speed of the player, in columns per second of simulation.
  - Declaración: `pub const PLAYER_RUN_SPEED: f64 = 5.0;`

- [`PLAYER_RUN_STEP`](physics.rs#L17) — Maximum horizontal columns a running player moves in one tick.
  - Declaración: `pub const PLAYER_RUN_STEP: f64 = PLAYER_RUN_SPEED / TICKS_PER_SECOND as f64;`

- [`PLAYER_GROUND_ACCEL`](physics.rs#L19) — Horizontal velocity change per tick while starting or redirecting on land.
  - Declaración: `pub const PLAYER_GROUND_ACCEL: f64 = 0.05;`

- [`PLAYER_GROUND_BRAKE`](physics.rs#L21) — Horizontal velocity removed per tick when releasing movement on land.
  - Declaración: `pub const PLAYER_GROUND_BRAKE: f64 = 0.03;`

- [`PLAYER_AIR_ACCEL`](physics.rs#L23) — Horizontal velocity change per tick while steering in the air.
  - Declaración: `pub const PLAYER_AIR_ACCEL: f64 = 0.04;`

- [`PLAYER_AIR_BRAKE`](physics.rs#L25) — Horizontal velocity removed per tick when releasing movement in the air.
  - Declaración: `pub const PLAYER_AIR_BRAKE: f64 = 0.025;`

- [`PLAYER_CORNER_NUDGE`](physics.rs#L27) — Maximum sideways displacement used to clear a small corner.
  - Declaración: `pub const PLAYER_CORNER_NUDGE: f64 = 0.04;`

- [`PLAYER_RADIUS`](physics.rs#L29) — Half the side of the square the player's feet take on the ground.
  - Declaración: `pub const PLAYER_RADIUS: f64 = 0.2;`

- [`PLAYER_BODY_HEIGHT`](physics.rs#L31) — Vertical extent of the player's collision body above its feet, in blocks.
  - Declaración: `pub const PLAYER_BODY_HEIGHT: f64 = 0.6;`

- [`PLAYER_RESCUE_DROP`](physics.rs#L33) — Distance below the last stable surface at which a fall is rescued.
  - Declaración: `pub const PLAYER_RESCUE_DROP: f64 = 2.0;`

- [`PLAYER_MAX_CLIMB`](physics.rs#L35) — Most blocks the player climbs up or down from one column to the next.
  - Declaración: `pub const PLAYER_MAX_CLIMB: f64 = 1.0;`

- [`PLAYER_JUMP_HEIGHT`](physics.rs#L37) — Blocks the player's feet rise at the top of a jump.
  - Declaración: `pub const PLAYER_JUMP_HEIGHT: f64 = 0.85;`

- [`PLAYER_JUMP_TICKS`](physics.rs#L39) — Ticks a jump lasts on flat ground, from take-off to landing.
  - Declaración: `pub const PLAYER_JUMP_TICKS: i32 = 10;`

- [`PLAYER_JUMP_BUFFER_TICKS`](physics.rs#L41) — Ticks for which a jump press can wait for landing.
  - Declaración: `pub const PLAYER_JUMP_BUFFER_TICKS: i32 = 2;`

- [`PLAYER_COYOTE_TICKS`](physics.rs#L43) — Ticks for which jumping remains possible after leaving a ledge.
  - Declaración: `pub const PLAYER_COYOTE_TICKS: i32 = 2;`

- [`PLAYER_AIR_JUMPS`](physics.rs#L45) — Jumps the player can take in the air before it lands.
  - Declaración: `pub const PLAYER_AIR_JUMPS: i32 = 1;`

- [`PLAYER_JUMP_SPEED`](physics.rs#L47) — Blocks per tick the feet rise at take-off.
  - Declaración: `pub const PLAYER_JUMP_SPEED: f64 = (4.0 * PLAYER_JUMP_HEIGHT) / PLAYER_JUMP_TICKS as f64;`

- [`PLAYER_JUMP_CUT_SPEED`](physics.rs#L49) — Upward speed retained when a jump key is released.
  - Declaración: `pub const PLAYER_JUMP_CUT_SPEED: f64 = PLAYER_JUMP_SPEED * 0.6;`

- [`PLAYER_MAX_FALL_SPEED`](physics.rs#L51) — Fastest downward speed in blocks per simulation tick.
  - Declaración: `pub const PLAYER_MAX_FALL_SPEED: f64 = 0.6;`

- [`PLAYER_GRAVITY`](physics.rs#L53) — Blocks per tick its feet's upward speed drops each tick in the air.
  - Declaración: `pub const PLAYER_GRAVITY: f64 = (8.0 * PLAYER_JUMP_HEIGHT) / ((PLAYER_JUMP_TICKS as f64) * (PLAYER_JUMP_TICKS as f64));`

- [`PLAYER_STEP_HEIGHT`](physics.rs#L55) — Blocks a top may stand above the player's feet and still be stepped onto in one tick.
  - Declaración: `pub const PLAYER_STEP_HEIGHT: f64 = 0.25;`

- [`PLAYER_CLIMB_TICKS`](physics.rs#L57) — Ticks a climb of one block lasts.
  - Declaración: `pub const PLAYER_CLIMB_TICKS: i32 = 12;`

- [`PLAYER_CLIMB_MS`](physics.rs#L59) — Real milliseconds a climb of one block lasts.
  - Declaración: `pub const PLAYER_CLIMB_MS: f64 = (PLAYER_CLIMB_TICKS as f64 * 1000.0) / TICKS_PER_SECOND as f64;`

- [`PLAYER_CLIMB_RISE_SHARE`](physics.rs#L61) — Share of a climb its feet take to rise to the top.
  - Declaración: `pub const PLAYER_CLIMB_RISE_SHARE: f64 = 0.7;`

- [`PLAYER_CLIMB_REACH`](physics.rs#L63) — Columns past where it reaches the higher top the player walks on during a climb.
  - Declaración: `pub const PLAYER_CLIMB_REACH: f64 = 0.25;`

- [`PLAYER_FLY_SPEED`](physics.rs#L65) — Blocks per tick a flying player's feet rise at most.
  - Declaración: `pub const PLAYER_FLY_SPEED: f64 = 0.15;`

- [`PLAYER_FLY_THRUST`](physics.rs#L67) — Blocks per tick its jetpack speeds a flying player's feet up by each tick.
  - Declaración: `pub const PLAYER_FLY_THRUST: f64 = 0.04;`

- [`PLAYER_FLY_MAX_HEIGHT`](physics.rs#L69) — Highest a flying player's feet go above the last land it stood on.
  - Declaración: `pub const PLAYER_FLY_MAX_HEIGHT: f64 = 10.0;`

- [`PLAYER_LANDING_TICKS`](physics.rs#L71) — Ticks the player shows its landing pose after it lands.
  - Declaración: `pub const PLAYER_LANDING_TICKS: i32 = 3;`

- [`PLAYER_TAKEOFF_TICKS`](physics.rs#L73) — Ticks after a take-off it shows its take-off pose.
  - Declaración: `pub const PLAYER_TAKEOFF_TICKS: i32 = 2;`

- [`PLAYER_APEX_SPEED`](physics.rs#L75) — Vertical speed under which a jump is at its apex.
  - Declaración: `pub const PLAYER_APEX_SPEED: f64 = PLAYER_GRAVITY;`

- [`PLAYER_PART_ID`](physics.rs#L77) — Key of the player part.
  - Declaración: `pub const PLAYER_PART_ID: &str = "player";`

- [`PLAYER_FACINGS`](physics.rs#L79) — The facings the player is drawn in: the sixteen points of the compass, counter-clockwise on
  - Declaración: `pub const PLAYER_FACINGS: [&str; 16] = [ "east", "east-north-east", "north-east", "north-north-east", "north", "north-north-west", "north-west", "west-north-west", "west", "west-south-west", "south-west", "south-south-west", "south", "south-south-east", "south-east", "east-south-east", ];`

- [`PLAYER_SPAWN_RADIUS`](physics.rs#L98) — Columns around the centre a new player's spawn is searched in.
  - Declaración: `pub const PLAYER_SPAWN_RADIUS: i32 = 32;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `dust.rs`

#### Funciones internas

- [`remaining`](dust.rs#L16) — How much of an effect lasting `duration` is left `ms` after it started: `1` → `0`, `0` after.
  - Firma: `fn remaining(ms: f64, duration: f64) -> f64 {`

- [`between`](dust.rs#L163) — `share` of the way from the low to the high end of a range.
  - Firma: `fn between(range: (f64, f64), share: f64) -> f64 {`

### `motion.rs`

#### Funciones internas

- [`next_state`](motion.rs#L72) — Finds the next state for `event` in `transitions`, or `None` when the event is not handled.
  - Firma: `fn next_state( transitions: &[(PlayerMotionEvent, PlayerMotionType)], event: PlayerMotionEvent, ) -> Option<PlayerMotionType> {`

#### Constantes internas

- [`GROUND`](motion.rs#L38) — Transitions out of every ground state: idle, walking, running and skidding.
  - Declaración: `const GROUND: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Walk, PlayerMotionType::Walking), (PlayerMotionEvent::Run, PlayerMotionType::Running), (PlayerMotionEvent::Skid, PlayerMotionType::Skidding), (PlayerMotionEvent::Stop, PlayerMotionType::Idle), (PlayerMotionEvent::Jump, PlayerMotionType::Jumping), (PlayerMotionEvent::Fall, PlayerMotionType::Falling), (PlayerMotionEvent::Climb, PlayerMotionType::Climbing), ];`

- [`AIR`](motion.rs#L49) — Transitions out of the air: jumping, falling or flying.
  - Declaración: `const AIR: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Fall, PlayerMotionType::Falling), (PlayerMotionEvent::Fly, PlayerMotionType::Flying), (PlayerMotionEvent::LandIdle, PlayerMotionType::Idle), (PlayerMotionEvent::LandWalking, PlayerMotionType::Walking), (PlayerMotionEvent::LandRunning, PlayerMotionType::Running), (PlayerMotionEvent::LandSkidding, PlayerMotionType::Skidding), (PlayerMotionEvent::Climb, PlayerMotionType::Climbing), ];`

- [`AIR_JUMP`](motion.rs#L60) — A jump press while already airborne keeps the player jumping or flying.
  - Declaración: `const AIR_JUMP: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::Jump, PlayerMotionType::Jumping), ];`

- [`CLIMBING`](motion.rs#L65) — Transitions out of climbing.
  - Declaración: `const CLIMBING: &[(PlayerMotionEvent, PlayerMotionType)] = &[ (PlayerMotionEvent::ClimbTick, PlayerMotionType::Climbing), (PlayerMotionEvent::ClimbDoneIdle, PlayerMotionType::Idle), (PlayerMotionEvent::ClimbDoneWalking, PlayerMotionType::Walking), ];`

### `physics.rs`

#### Funciones internas

- [`harmonic`](physics.rs#L110) — Calcula o recupera «harmonic» según los parámetros de la firma.
  - Firma: `fn harmonic(t: f64) -> f64 {`

- [`column_at`](physics.rs#L236) — Calcula o recupera «column at» según los parámetros de la firma.
  - Firma: `fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn>;`

- [`occupancy_at`](physics.rs#L237) — Calcula o recupera «occupancy at» según los parámetros de la firma.
  - Firma: `fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle>;`

- [`chunk_has`](physics.rs#L238) — Calcula o recupera «chunk has» según los parámetros de la firma.
  - Firma: `fn chunk_has(&self, _coord: ChunkCoord) -> bool {`

- [`load_around`](physics.rs#L241) — Calcula o recupera «load around» según los parámetros de la firma.
  - Firma: `fn load_around(&mut self, _point: GridPoint) {} } /// Column the ground point `point` belongs to. pub fn get_player_column(point: GridPoint) -> WorldCoord {`

- [`is_steppable`](physics.rs#L279) — Evalúa si se cumple la condición «steppable» para el estado recibido.
  - Firma: `fn is_steppable<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {`

- [`clears_standing_body`](physics.rs#L290) — Calcula o recupera «clears standing body» según los parámetros de la firma.
  - Firma: `fn clears_standing_body(occ: &PlayerObstacle, column: &TerrainColumn) -> bool {`

- [`support_at`](physics.rs#L296) — Calcula o recupera «support at» según los parámetros de la firma.
  - Firma: `fn support_at<G: PlayerGround>(ground: &G, point: GridPoint) -> Option<TerrainColumn> {`

- [`fits_in_air`](physics.rs#L315) — Calcula o recupera «fits in air» según los parámetros de la firma.
  - Firma: `fn fits_in_air<G: PlayerGround>(ground: &G, point: GridPoint, feet: f64) -> bool {`

- [`can_leave_edge`](physics.rs#L319) — Calcula o recupera «can leave edge» según los parámetros de la firma.
  - Firma: `fn can_leave_edge<G: PlayerGround>(ground: &G, point: GridPoint, feet: f64) -> bool {`

- [`block_reason_at`](physics.rs#L336) — Calcula o recupera «block reason at» según los parámetros de la firma.
  - Firma: `fn block_reason_at<G: PlayerGround>( ground: &G, point: GridPoint, elevation: f64, feet: f64, airborne: bool, ) -> Option<PlayerBlockReason> {`

- [`fits_at`](physics.rs#L392) — Calcula o recupera «fits at» según los parámetros de la firma.
  - Firma: `fn fits_at<G: PlayerGround>(ground: &G, point: GridPoint, from_elevation: f64) -> bool {`

- [`elevation_at`](physics.rs#L396) — Calcula o recupera «elevation at» según los parámetros de la firma.
  - Firma: `fn elevation_at<G: PlayerGround>(ground: &G, point: GridPoint) -> f64 {`

- [`approach_velocity`](physics.rs#L573) — Calcula o recupera «approach velocity» según los parámetros de la firma.
  - Firma: `fn approach_velocity(current: GridPoint, desired: GridPoint, rate: f64) -> GridPoint {`

- [`is_faster_than_walk`](physics.rs#L586) — Evalúa si se cumple la condición «faster than walk» para el estado recibido.
  - Firma: `fn is_faster_than_walk(player: &PlayerState) -> bool {`

- [`is_sliding`](physics.rs#L590) — Evalúa si se cumple la condición «sliding» para el estado recibido.
  - Firma: `fn is_sliding(player: &PlayerState) -> bool {`

- [`get_gait`](physics.rs#L599) — Obtiene «gait» sin modificar el estado consultado.
  - Firma: `fn get_gait(player: &PlayerState, moved: bool) -> &'static str {`

- [`get_motion_event`](physics.rs#L612) — Obtiene «motion event» sin modificar el estado consultado.
  - Firma: `fn get_motion_event(player: &PlayerState, flying: bool) -> PlayerMotionEvent {`

- [`update_motion`](physics.rs#L661) — Calcula o recupera «update motion» según los parámetros de la firma.
  - Firma: `fn update_motion(player: &mut PlayerState, flying: bool) {`

- [`take_off`](physics.rs#L667) — Calcula o recupera «take off» según los parámetros de la firma.
  - Firma: `fn take_off(player: &mut PlayerState, air: bool) {`

- [`reject_jump`](physics.rs#L682) — Calcula o recupera «reject jump» según los parámetros de la firma.
  - Firma: `fn reject_jump(player: &mut PlayerState, reason: PlayerBlockReason) {`

- [`land`](physics.rs#L687) — Calcula o recupera «land» según los parámetros de la firma.
  - Firma: `fn land(player: &mut PlayerState) {`

- [`accelerate_player`](physics.rs#L694) — Calcula o recupera «accelerate player» según los parámetros de la firma.
  - Firma: `fn accelerate_player(player: &mut PlayerState) {`

- [`step_once`](physics.rs#L727) — Calcula o recupera «step once» según los parámetros de la firma.
  - Firma: `fn step_once<G: PlayerGround>( player: &mut PlayerState, ground: &G, diagnose: bool, ) -> Option<PlayerBlockReason> {`

- [`step_air`](physics.rs#L873) — Calcula o recupera «step air» según los parámetros de la firma.
  - Firma: `fn step_air<G: PlayerGround>( player: &mut PlayerState, ground: &G, flying: bool, ) -> Option<&'static str> {`

- [`ceiling_at`](physics.rs#L956) — Calcula o recupera «ceiling at» según los parámetros de la firma.
  - Firma: `fn ceiling_at<G: PlayerGround>( ground: &G, point: GridPoint, head: f64, next_head: f64, ) -> Option<f64> {`

- [`is_flying`](physics.rs#L991) — Evalúa si se cumple la condición «flying» para el estado recibido.
  - Firma: `fn is_flying(player: &PlayerState) -> bool {`

#### Constantes internas

- [`LANDING`](physics.rs#L100) — Define el parámetro interno «LANDING» empleado por este módulo.
  - Declaración: `const LANDING: f64 = 1e-9;`
