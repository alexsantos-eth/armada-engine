# NPC

Este dominio de cliente anima a los personajes de `iso::npc` con las hojas del mono del jugador. Cada personaje lleva la misma contabilidad de animación que el jugador (`PlayerAnimation`: giro suave entre las dieciséis orientaciones, ciclo de caminar por distancia, baile de reposo por tiempo), alimentada con lo que un personaje hace: caminar (también por las gradas), estar parado, izarse a un bloque y caer de uno. De las hojas del jugador usa `walk`, `idle`, `climb` y la pose de caída de `jump`; nunca `swim` ni `flip`.

No decide nada del deambular: `iso::npc` es la autoridad. El encolado de sus sprites (`Game::collect_npcs`, en `src/game/scene.rs`) necesita el atlas y las sombras horneadas, así que vive con el resto de la escena y dibuja a cada personaje como al jugador: su sombra de suelo, la pose, las sombras que le caen encima y su reflejo. Esa parte se comprueba mirando, con una corrida guionizada sobre el mundo procedural (`armada-visual-check`, poblado de `(267, 204)`).

Los personajes solo existen en el mundo que se transmite (`Game::streams`): ni el editor ni una escena `blank` los tienen.

Cada personaje se dibuja con su aspecto (`iso::npc::npc_look`): el tamaño escala la tinta del sprite alrededor de los pies y la sombra de suelo, y el tinte multiplica el dibujo (`SpriteDraw::tinted_by`), también bajo las sombras horneadas. El reflejo en el agua toma el tamaño pero no el tinte.

## Catálogo de API pública

### `npc_view.rs`

#### Funciones y métodos

- [`npc_moment`](npc_view.rs#L33) — Lo que un fotograma de `npc` es para la animación del jugador: caminar o reposar en el suelo, el izado sobre un reborde o la caída de un bloque; nunca un salto propio, un nado o una carrera.
  - Firma: `pub fn npc_moment(npc: &Npc, moved: f64, elapsed_ms: f64) -> PlayerMoment {`

- [`npc_sheets`](npc_view.rs#L61) — Las hojas de las que se dibuja un personaje: todas las del jugador menos nado y mortal.
  - Firma: `pub fn npc_sheets(sheets: PlayerSheets) -> PlayerSheets {`

- [`NpcViews::begin`](npc_view.rs#L87) — Marca todas las vistas como no vistas; las que no se dibujen antes de `finish` se sueltan.
  - Firma: `pub fn begin(&mut self) {`

- [`NpcViews::advance`](npc_view.rs#L94) — Cuenta un fotograma de `npc`, dibujado en `at`, y responde con su pose.
  - Firma: `pub fn advance( &mut self, npc: &Npc, at: GridPoint, elapsed_ms: f64, sheets: PlayerSheets, ) -> PlayerPose {`

- [`NpcViews::finish`](npc_view.rs#L122) — Suelta la vista de quien no se dibujó desde `begin`.
  - Firma: `pub fn finish(&mut self) {`

- [`coat_color`](npc_view.rs#L70) — El color por el que se multiplica el dibujo de un personaje, a partir de su pelaje `0xRRGGBB`.
  - Firma: `pub fn coat_color(tint: u32) -> macroquad::color::Color {`

- [`scaled_shadow`](npc_view.rs#L77) — La sombra de suelo de un personaje `scale` veces el tamaño del jugador: igual de ancha y honda que su cuerpo, desde el mismo sitio.
  - Firma: `pub fn scaled_shadow(shadow: PlayerShadow, scale: f64) -> PlayerShadow {`

#### Tipos

- [`NpcViews`](npc_view.rs#L27) — La animación de cada personaje dibujado últimamente, por id.
