# NPC

Este dominio contiene a los personajes no jugadores: quién nace en cada chunk, el deambular que los mueve y el conjunto de los que están vivos. Reutiliza el suelo del jugador (`iso::player::PlayerGround`) para preguntar por columnas y ocupantes, de modo que un personaje ve el mismo mundo que el jugador.

Un personaje va de casilla en casilla, y cómo llega a la siguiente lo decide el suelo (`plan_npc_step`):

- **Camina** por suelo seco de su mismo nivel, en las ocho direcciones, sin cortar una esquina cerrada.
- **Sube y baja gradas**: solo por el eje del tramo, y lo cruza entero hasta la casilla de más allá (un paso de dos casillas), con los mismos peldaños y saltitos que el jugador (`get_stairs_rise`, `get_stairs_hop`). Nunca se queda parado en una grada.
- **Escala** un bloque exactamente un nivel más alto, de frente: camina hasta la pared, se iza con la curva del jugador (`get_climb_rise`/`get_climb_advance`, `PLAYER_CLIMB_TICKS`) y sigue andando hasta el centro.
- **Cae** a un suelo exactamente un nivel más bajo, de frente: camina hasta pasar el borde (`NPC_DROP_EDGE`) y cae con la gravedad del jugador.

No salta, no nada y no corre; un desnivel de dos bloques o más, el agua y lo sólido le cierran el paso, y nunca se aleja más de `NPC_LEASH` columnas de la casilla en la que nació. La IA es un deambular: descansa un rato, elige una vecina abierta (las ocho, empezando por una al azar), pasea de una a cuatro casillas en esa dirección y vuelve a descansar. Nadie entra en la casilla del jugador ni en una que otro personaje ocupa, cruza o a la que va.

Todo es determinista: quién nace sale de la semilla, del chunk y de su suelo (`derive_seed` + `lattice_at`), y cada personaje decide con su propio flujo (`DustRandom` sembrado con su id, que es la clave de su casilla de origen). Avanzan solo en el paso fijo. **No se guardan**: al volver un chunk, sus personajes nacen otra vez en casa.

No dibuja nada ni conoce sprites: la vista vive en el cliente (`src/npc`).

## Catálogo de API pública

### `wander.rs`

#### Funciones y métodos

- [`Npc::new`](wander.rs#L171) — Un personaje nacido en `home`, a `elevation`, con un primer descanso sacado de su propio flujo para que los vecinos no arranquen a la vez.

- [`Npc::pose`](wander.rs#L198) — Dónde tiene los pies ahora: punto de la rejilla, nivel del suelo o del peldaño que pisa y cuánto está su cuerpo por encima.

- [`Npc::position`](wander.rs#L245) — Dónde está sobre el suelo, en las coordenadas del jugador.

- [`Npc::render_pose`](wander.rs#L254) — Dónde se dibuja a `alpha` del camino entre el tick anterior y este; al pasar un borde el suelo cambia de golpe y los pies no.

- [`Npc::target`](wander.rs#L279) — La casilla a la que va, si hay un paso en curso.

- [`Npc::claims`](wander.rs#L287) — Si ocupa `cell`: está en ella, va hacia ella o la está cruzando (la grada de un tramo).

- [`Npc::climbing`](wander.rs#L301) — Cuánto lleva del izado sobre un reborde, o `None` si no está en una pared.

- [`Npc::motion`](wander.rs#L307) — Qué hace este tick: `Idle`, `Walking`, `Climbing` o `Falling`.

- [`NpcStep::span`](wander.rs#L82) — Casillas que cubre el paso: dos por un tramo de gradas, una en los demás.

- [`get_npc_climb`](wander.rs#L115) — Una escalada a `progress` de su paso entero: parte de la casilla avanzada, parte del bloque subida y, mientras está en la pared, cuánto lleva del izado.

- [`get_npc_fall`](wander.rs#L136) — Bloques que ha caído un cuerpo `ticks` ticks después de pasar un borde, uno como mucho.

- [`can_npc_stand`](wander.rs#L342) — Si un personaje puede estar en `cell`: suelo seco, que no sea grada, sin nada sólido; con `level`, exactamente a ese nivel.

- [`plan_npc_step`](wander.rs#L383) — El paso que `npc` daría hacia `heading` (caminar, gradas, escalar o caer), o `None` si ese lado está cerrado.

- [`step_npc`](wander.rs#L458) — Un tick de `npc`: descansa, arranca un paseo o continúa el paso en curso.

#### Constantes

- [`NPC_SPEED`](wander.rs#L15) — Velocidad de paseo, en columnas por segundo de simulación: más lenta que el caminar del jugador.
  - Declaración: `pub const NPC_SPEED: f64 = 1.2;`

- [`NPC_STEP`](wander.rs#L17) — Columnas que avanza por tick.
  - Declaración: `pub const NPC_STEP: f64 = NPC_SPEED / TICKS_PER_SECOND as f64;`

- [`NPC_LEASH`](wander.rs#L19) — Columnas que se aleja de su casa, en cada eje.
  - Declaración: `pub const NPC_LEASH: i32 = 6;`

- [`NPC_REST_TICKS`](wander.rs#L21) — El descanso más corto y el más largo entre dos paseos, en ticks.
  - Declaración: `pub const NPC_REST_TICKS: (i32, i32) = (40, 160);`

- [`NPC_STROLL_CELLS`](wander.rs#L23) — Las menos y las más casillas que cubre un paseo.
  - Declaración: `pub const NPC_STROLL_CELLS: (i32, i32) = (1, 4);`

- [`NPC_BLOCKED_REST_TICKS`](wander.rs#L25) — El descanso de quien no tiene salida, antes de volver a intentarlo.
  - Declaración: `pub const NPC_BLOCKED_REST_TICKS: i32 = 20;`

- [`NPC_CLIMB_APPROACH`](wander.rs#L28) — Parte de la casilla que camina hasta la pared antes de izarse.
  - Declaración: `pub const NPC_CLIMB_APPROACH: f64 = 0.3;`

- [`NPC_CLIMB_SETTLE`](wander.rs#L30) — Parte de la casilla que camina hasta el centro después del izado.
  - Declaración: `pub const NPC_CLIMB_SETTLE: f64 = 0.25;`

- [`NPC_DROP_EDGE`](wander.rs#L32) — Parte del paso en la que quien baja de un bloque deja el borde y cae.
  - Declaración: `pub const NPC_DROP_EDGE: f64 = 0.6;`

#### Tipos

- [`NpcMotion`](wander.rs#L48) — Lo que hace un personaje, para quien lo dibuja.

- [`NpcMove`](wander.rs#L59) — Cómo llega un paso a la casilla siguiente: `Walk`, `Stairs`, `Climb` o `Drop`.

- [`NpcStep`](wander.rs#L72) — Un paso en curso: hacia dónde, de qué tipo y cuántos niveles gana.

- [`NpcPose`](wander.rs#L100) — Dónde están los pies: punto, nivel del suelo bajo ellos y altura del cuerpo sobre él.

- [`Npc`](wander.rs#L144) — Un personaje: su casa, la casilla que pisa, su nivel, el paso en curso, hacia dónde mira y cuánto le queda de descanso.

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
