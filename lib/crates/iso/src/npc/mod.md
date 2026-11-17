# NPC

Este dominio contiene a los personajes no jugadores: quién nace en cada chunk, el deambular que los mueve y el conjunto de los que están vivos. Reutiliza el suelo del jugador (`iso::player::PlayerGround`) para preguntar por columnas y ocupantes, de modo que un personaje ve el mismo mundo que el jugador.

Un personaje solo hace dos cosas: **caminar** e **ir parado**. No salta, no escala, no sube gradas, no nada y no corre: solo pisa suelo seco de **su mismo nivel**, sin nada sólido encima, y nunca se aleja más de `NPC_LEASH` columnas de la casilla en la que nació. La IA es un deambular: descansa un rato, elige una casilla vecina libre (las ocho, empezando por una al azar), pasea de una a cuatro casillas en esa dirección y vuelve a descansar. Nadie entra en la casilla del jugador ni en una que otro personaje ocupa o a la que va.

Todo es determinista: quién nace sale de la semilla, del chunk y de su suelo (`derive_seed` + `lattice_at`), y cada personaje decide con su propio flujo (`DustRandom` sembrado con su id, que es la clave de su casilla de origen). Avanzan solo en el paso fijo. **No se guardan**: al volver un chunk, sus personajes nacen otra vez en casa.

No dibuja nada ni conoce sprites: la vista vive en el cliente (`src/npc`).

## Catálogo de API pública

### `wander.rs`

#### Funciones y métodos

- [`Npc::new`](wander.rs#L72) — Un personaje nacido en `home`, a `elevation`, con un primer descanso sacado de su propio flujo para que los vecinos no arranquen a la vez.
  - Firma: `pub fn new(id: u64, home: WorldCoord, elevation: i32) -> Self {`

- [`Npc::position`](wander.rs#L92) — Dónde está ahora, en las coordenadas del jugador (el centro de una casilla es su par entero).
  - Firma: `pub fn position(&self) -> GridPoint {`

- [`Npc::render_position`](wander.rs#L104) — Dónde se dibuja a `alpha` del camino entre el tick anterior y este.
  - Firma: `pub fn render_position(&self, alpha: f64) -> GridPoint {`

- [`Npc::target`](wander.rs#L118) — La casilla en la que está entrando, si hay un paso en curso.
  - Firma: `pub fn target(&self) -> Option<WorldCoord> {`

- [`Npc::claims`](wander.rs#L126) — Si ocupa `cell`: está en ella o va hacia ella.
  - Firma: `pub fn claims(&self, cell: WorldCoord) -> bool {`

- [`Npc::motion`](wander.rs#L131) — Qué hace este tick: `Idle` o `Walking`.
  - Firma: `pub fn motion(&self) -> NpcMotion {`

- [`can_npc_stand`](wander.rs#L164) — Si un personaje puede estar en `cell`: suelo seco, que no sea grada, sin nada sólido; con `level`, exactamente a ese nivel.
  - Firma: `pub fn can_npc_stand<G: PlayerGround>(ground: &G, cell: WorldCoord, level: Option<i32>) -> bool {`

- [`can_npc_step`](wander.rs#L187) — Si `npc` puede dar un paso hacia `heading`: dentro de su correa, pisable a su nivel, sin dueño, y sin cortar una esquina cerrada en diagonal.
  - Firma: `pub fn can_npc_step<G: PlayerGround>( npc: &Npc, heading: (i32, i32), ground: &G, taken: impl Fn(WorldCoord) -> bool, ) -> bool {`

- [`step_npc`](wander.rs#L221) — Un tick de `npc`: descansa, arranca un paseo o continúa el paso en curso.
  - Firma: `pub fn step_npc<G: PlayerGround>(npc: &mut Npc, ground: &G, taken: impl Fn(WorldCoord) -> bool) {`

#### Constantes

- [`NPC_SPEED`](wander.rs#L11) — Velocidad de paseo, en columnas por segundo de simulación: más lenta que el caminar del jugador.
  - Declaración: `pub const NPC_SPEED: f64 = 1.2;`

- [`NPC_STEP`](wander.rs#L13) — Columnas que avanza por tick.
  - Declaración: `pub const NPC_STEP: f64 = NPC_SPEED / TICKS_PER_SECOND as f64;`

- [`NPC_LEASH`](wander.rs#L15) — Columnas que se aleja de su casa, en cada eje.
  - Declaración: `pub const NPC_LEASH: i32 = 6;`

- [`NPC_REST_TICKS`](wander.rs#L17) — El descanso más corto y el más largo entre dos paseos, en ticks.
  - Declaración: `pub const NPC_REST_TICKS: (i32, i32) = (40, 160);`

- [`NPC_STROLL_CELLS`](wander.rs#L19) — Las menos y las más casillas que cubre un paseo.
  - Declaración: `pub const NPC_STROLL_CELLS: (i32, i32) = (1, 4);`

- [`NPC_BLOCKED_REST_TICKS`](wander.rs#L21) — El descanso de quien no tiene salida, antes de volver a intentarlo.
  - Declaración: `pub const NPC_BLOCKED_REST_TICKS: i32 = 20;`

#### Tipos

- [`NpcMotion`](wander.rs#L37) — Lo que hace un personaje, para quien lo dibuja: `Idle` o `Walking`.

- [`Npc`](wander.rs#L45) — Un personaje: su casa, la casilla que pisa, su nivel, el paso en curso, hacia dónde mira y cuánto le queda de descanso.

### `spawn.rs`

#### Funciones y métodos

- [`spawn_npcs`](spawn.rs#L22) — Los personajes que nacen en `chunk`: aldeanos en las casillas de poblado y, de vez en cuando, un caminante fuera. Misma semilla, chunk y suelo dan siempre los mismos.
  - Firma: `pub fn spawn_npcs<G: PlayerGround>( seed: u64, chunk: ChunkCoord, ground: &G, in_village: impl Fn(i32, i32) -> bool, ) -> Vec<Npc> {`

#### Constantes

- [`NPC_SPAWN_TRIES`](spawn.rs#L11) — Casillas de un chunk que se prueban como casa.
  - Declaración: `pub const NPC_SPAWN_TRIES: i32 = 96;`

- [`NPC_VILLAGERS_PER_CHUNK`](spawn.rs#L13) — Tope de personajes que un chunk da dentro de un poblado.
  - Declaración: `pub const NPC_VILLAGERS_PER_CHUNK: usize = 20;`

- [`NPC_WANDERERS_PER_CHUNK`](spawn.rs#L15) — Tope de personajes que un chunk da fuera de un poblado.
  - Declaración: `pub const NPC_WANDERERS_PER_CHUNK: usize = 1;`

- [`NPC_WANDERER_CHANCE`](spawn.rs#L17) — Parte de las casillas salvajes probadas que sí reciben un caminante.
  - Declaración: `pub const NPC_WANDERER_CHANCE: f64 = 0.05;`

### `crowd.rs`

#### Funciones y métodos

- [`Npcs::sync`](crowd.rs#L21) — Ajusta el conjunto a los chunks vivos: se van los de un chunk que salió y `spawn` da los de uno que llegó. Devuelve si cambió alguien.
  - Firma: `pub fn sync( &mut self, live: &[ChunkCoord], mut spawn: impl FnMut(ChunkCoord) -> Vec<Npc>, ) -> bool {`

- [`Npcs::step`](crowd.rs#L51) — Avanza a todos `ticks` ticks, en orden de id; nadie entra en la casilla de `player` ni en la de otro.
  - Firma: `pub fn step<G: PlayerGround>(&mut self, ground: &G, player: WorldCoord, ticks: u32) {`

- [`Npcs::iter`](crowd.rs#L69) — Todos, en orden de id.
  - Firma: `pub fn iter(&self) -> impl Iterator<Item = &Npc> {`

- [`Npcs::len`](crowd.rs#L74) — Cuántos personajes hay vivos.
  - Firma: `pub fn len(&self) -> usize {`

- [`Npcs::is_empty`](crowd.rs#L79) — Si no hay nadie vivo.
  - Firma: `pub fn is_empty(&self) -> bool {`

#### Tipos

- [`Npcs`](crowd.rs#L12) — Los personajes de los chunks vivos, en orden de id. No se guardan.
