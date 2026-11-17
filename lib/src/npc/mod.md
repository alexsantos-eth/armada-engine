# NPC

Este dominio de cliente anima a los personajes de `iso::npc` con las hojas del mono del jugador. Cada personaje lleva la misma contabilidad de animación que el jugador (`PlayerAnimation`: giro suave entre las dieciséis orientaciones, ciclo de caminar por distancia, baile de reposo por tiempo), alimentada solo con lo que un personaje hace: caminar y estar parado. De las hojas del jugador solo usa `walk` e `idle`.

No decide nada del deambular: `iso::npc` es la autoridad. El encolado de sus sprites (`Game::collect_npcs`, en `src/game/scene.rs`) necesita el atlas y las sombras horneadas, así que vive con el resto de la escena y dibuja a cada personaje como al jugador: su sombra de suelo, la pose, las sombras que le caen encima y su reflejo. Esa parte se comprueba mirando, con una corrida guionizada sobre el mundo procedural (`armada-visual-check`, poblado de `(267, 204)`).

Los personajes solo existen en el mundo que se transmite (`Game::streams`): ni el editor ni una escena `blank` los tienen.

## Catálogo de API pública

### `npc_view.rs`

#### Funciones y métodos

- [`npc_moment`](npc_view.rs#L32) — Lo que un fotograma de `npc` es para la animación del jugador: caminar o reposar en el suelo, nunca un salto, una escalada, un nado o una carrera.
  - Firma: `pub fn npc_moment(npc: &Npc, moved: f64, elapsed_ms: f64) -> PlayerMoment {`

- [`npc_sheets`](npc_view.rs#L51) — Las hojas de las que se dibuja un personaje: solo caminar y reposo.
  - Firma: `pub fn npc_sheets(sheets: PlayerSheets) -> PlayerSheets {`

- [`NpcViews::begin`](npc_view.rs#L61) — Marca todas las vistas como no vistas; las que no se dibujen antes de `finish` se sueltan.
  - Firma: `pub fn begin(&mut self) {`

- [`NpcViews::advance`](npc_view.rs#L68) — Cuenta un fotograma de `npc`, dibujado en `at`, y responde con su pose.
  - Firma: `pub fn advance( &mut self, npc: &Npc, at: GridPoint, elapsed_ms: f64, sheets: PlayerSheets, ) -> PlayerPose {`

- [`NpcViews::finish`](npc_view.rs#L96) — Suelta la vista de quien no se dibujó desde `begin`.
  - Firma: `pub fn finish(&mut self) {`

#### Tipos

- [`NpcViews`](npc_view.rs#L26) — La animación de cada personaje dibujado últimamente, por id.
